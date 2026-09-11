import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  NetworkingV1Api,
  VersionApi,
  BatchV1Api,
  AutoscalingV2Api,
  PolicyV1Api,
  SchedulingV1Api,
  CoordinationV1Api,
  StorageV1Api,
  RbacAuthorizationV1Api,
  DiscoveryV1Api,
  ApiextensionsV1Api,
  CustomObjectsApi,
  Metrics,
  Log
} from '@kubernetes/client-node'
import * as yaml from 'js-yaml'
import { Writable } from 'stream'
import { gunzipSync } from 'zlib'
import type {
  ClusterMetricsPoint,
  ClusterOverview,
  ContextInfo,
  CrdGroups,
  CrdInfo,
  NodeSummary,
  ResourceKind,
  ResourceRow,
  ResourceTableResult,
  SecretDetail,
  SecretKeyValue
} from '../../shared/types'
import {
  formatAge,
  formatCpu,
  formatMemory,
  nodeReadyStatus,
  nodeRoles,
  parseCpuMilli,
  parseMemBytes,
  podReadyCount,
  podRestartCount,
  podStatusPhase
} from './format'

// Strips the noisy, rarely-useful managedFields block before rendering YAML.
function cleanForYaml<T extends { metadata?: { managedFields?: unknown } }>(obj: T): T {
  const clone = structuredClone(obj)
  if (clone.metadata) delete clone.metadata.managedFields
  return clone
}

// CRD `additionalPrinterColumns[].jsonPath` is a restricted subset of JSONPath: plain field
// access, numeric array indices, and -- very commonly, e.g. cert-manager's `status.conditions[?
// (@.type == "Ready")].status` -- a single-condition equality filter (no nesting, no other
// operators). Full JSONPath filter syntax isn't needed; just that one well-established pattern.
const JSONPATH_TOKEN =
  /\.([A-Za-z0-9_-]+)|\[(\d+)\]|\[\?\(@\.([A-Za-z0-9_-]+)\s*(==|!=)\s*["']([^"']*)["']\)\]/g

function resolveJsonPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const match of path.matchAll(JSONPATH_TOKEN)) {
    if (cur == null) return undefined
    const [, field, index, filterKey, filterOp, filterValue] = match
    if (field !== undefined) {
      if (typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[field]
    } else if (index !== undefined) {
      if (!Array.isArray(cur)) return undefined
      cur = cur[Number(index)]
    } else if (filterKey !== undefined) {
      if (!Array.isArray(cur)) return undefined
      cur = cur.find((item) => {
        const value = (item as Record<string, unknown>)?.[filterKey]
        return filterOp === '==' ? String(value) === filterValue : String(value) !== filterValue
      })
    }
  }
  return cur
}

function formatPrinterColumnValue(val: unknown, type?: string): string {
  if (val === undefined || val === null) return '-'
  if (type === 'date') return formatAge(val as string)
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

interface HelmRelease {
  name: string
  namespace: string
  version: number
  chart?: { metadata?: { name?: string; version?: string; appVersion?: string } }
  info?: { status?: string; first_deployed?: string; last_deployed?: string; description?: string; notes?: string }
  config?: Record<string, unknown>
}

// Helm 3 stores each release revision as a Secret whose `data.release` value is
// base64(gzip(base64(JSON))) -- the inner base64+JSON is Helm's own encodeRelease() output, the
// outer base64 is just the standard k8s API wire encoding for Secret byte values.
function decodeHelmRelease(wireBase64: string): HelmRelease {
  const helmBase64 = Buffer.from(wireBase64, 'base64').toString('utf8')
  const gzipped = Buffer.from(helmBase64, 'base64')
  return JSON.parse(gunzipSync(gzipped).toString('utf8')) as HelmRelease
}

// Multiple revisions of the same release stay in the cluster as separate Secrets; only the
// highest `version` label is the current one (mirrors `helm list`, which shows one row per release).
function latestHelmSecrets<
  T extends { metadata?: { name?: string; namespace?: string; labels?: Record<string, string> } }
>(secrets: T[]): T[] {
  const latest = new Map<string, (typeof secrets)[number]>()
  for (const secret of secrets) {
    const releaseName = secret.metadata?.labels?.name
    const ns = secret.metadata?.namespace
    if (!releaseName || !ns) continue
    const key = `${ns}/${releaseName}`
    const version = Number(secret.metadata?.labels?.version ?? 0)
    const existing = latest.get(key)
    const existingVersion = existing ? Number(existing.metadata?.labels?.version ?? 0) : -1
    if (version > existingVersion) latest.set(key, secret)
  }
  return [...latest.values()]
}

// Shorthand for the common name/namespace/cells row shape used by every list method below.
function row(meta: { name?: string; namespace?: string } | undefined, cells: Record<string, string>): ResourceRow {
  return { name: meta?.name ?? '-', namespace: meta?.namespace, cells }
}

// Secrets are read-only here by design; values are never surfaced, only key names.
function redactSecret(obj: {
  data?: Record<string, string>
  stringData?: Record<string, string>
}): void {
  if (obj.data) {
    for (const key of Object.keys(obj.data)) obj.data[key] = '<redacted>'
  }
  if (obj.stringData) {
    for (const key of Object.keys(obj.stringData)) obj.stringData[key] = '<redacted>'
  }
}

// Standalone, doesn't need a live cluster connection -- used by the catalog to list every
// context across the default kubeconfig and any extra files the user has added, before any of
// them have been opened as a workspace. Contexts are deduped by name, first file wins -- the same
// rule kubectl itself uses when merging multiple files via the KUBECONFIG env var.
export function listKubeContexts(extraPaths: string[] = []): ContextInfo[] {
  const results: ContextInfo[] = []
  const seen = new Set<string>()

  const loadFrom = (path: string | undefined): void => {
    const kc = new KubeConfig()
    if (path) kc.loadFromFile(path)
    else kc.loadFromDefault()
    const current = kc.getCurrentContext()
    for (const c of kc.getContexts()) {
      if (seen.has(c.name)) continue
      seen.add(c.name)
      results.push({
        name: c.name,
        cluster: c.cluster,
        user: c.user,
        namespace: c.namespace ?? 'default',
        isCurrent: !path && c.name === current,
        kubeconfigPath: path ?? ''
      })
    }
  }

  loadFrom(undefined)
  for (const path of extraPaths) {
    try {
      loadFrom(path)
    } catch {
      // an unreadable/invalid extra file shouldn't take down the whole catalog
    }
  }

  return results
}

// One instance per open cluster tab -- each owns an independent KubeConfig/client set bound to
// a single context, so multiple clusters can be connected to at the same time without one
// context switch affecting another tab's in-flight requests.
export class KubeManager {
  private kc = new KubeConfig()
  private core!: CoreV1Api
  private apps!: AppsV1Api
  private net!: NetworkingV1Api
  private version!: VersionApi
  private batch!: BatchV1Api
  private autoscaling!: AutoscalingV2Api
  private policy!: PolicyV1Api
  private scheduling!: SchedulingV1Api
  private coordination!: CoordinationV1Api
  private storage!: StorageV1Api
  private rbac!: RbacAuthorizationV1Api
  private discovery!: DiscoveryV1Api
  private apiext!: ApiextensionsV1Api
  private customObjects!: CustomObjectsApi
  private metrics!: Metrics
  private activeLogStreams = new Map<string, AbortController>()

  constructor(contextName: string, kubeconfigPath?: string) {
    if (kubeconfigPath) this.kc.loadFromFile(kubeconfigPath)
    else this.kc.loadFromDefault()
    this.kc.setCurrentContext(contextName)
    this.buildClients()
  }

  private buildClients(): void {
    this.core = this.kc.makeApiClient(CoreV1Api)
    this.apps = this.kc.makeApiClient(AppsV1Api)
    this.net = this.kc.makeApiClient(NetworkingV1Api)
    this.version = this.kc.makeApiClient(VersionApi)
    this.batch = this.kc.makeApiClient(BatchV1Api)
    this.autoscaling = this.kc.makeApiClient(AutoscalingV2Api)
    this.policy = this.kc.makeApiClient(PolicyV1Api)
    this.scheduling = this.kc.makeApiClient(SchedulingV1Api)
    this.coordination = this.kc.makeApiClient(CoordinationV1Api)
    this.storage = this.kc.makeApiClient(StorageV1Api)
    this.rbac = this.kc.makeApiClient(RbacAuthorizationV1Api)
    this.discovery = this.kc.makeApiClient(DiscoveryV1Api)
    this.apiext = this.kc.makeApiClient(ApiextensionsV1Api)
    this.customObjects = this.kc.makeApiClient(CustomObjectsApi)
    this.metrics = new Metrics(this.kc)
  }

  // metrics-server is optional cluster infrastructure -- absent on plenty of real clusters (this
  // one included), so every metrics call is best-effort and never fails the caller.
  private async tryGetNodeMetrics(): Promise<Map<string, { cpuMilli: number; memBytes: number }> | null> {
    try {
      const list = await this.metrics.getNodeMetrics()
      const byName = new Map<string, { cpuMilli: number; memBytes: number }>()
      for (const item of list.items) {
        byName.set(item.metadata.name, {
          cpuMilli: parseCpuMilli(item.usage.cpu),
          memBytes: parseMemBytes(item.usage.memory)
        })
      }
      return byName
    } catch {
      return null
    }
  }

  async getOverview(): Promise<ClusterOverview> {
    const [versionInfo, nodeList, nsList, podList, nodeMetrics] = await Promise.all([
      this.version.getCode(),
      this.core.listNode(),
      this.core.listNamespace(),
      this.core.listPodForAllNamespaces(),
      this.tryGetNodeMetrics()
    ])

    const nodes: NodeSummary[] = nodeList.items.map((n) => {
      const name = n.metadata?.name ?? '-'
      const usage = nodeMetrics?.get(name)
      const cpuAllocatable = parseCpuMilli(n.status?.allocatable?.['cpu'])
      const memAllocatable = parseMemBytes(n.status?.allocatable?.['memory'])
      return {
        name,
        status: nodeReadyStatus(n.status?.conditions),
        roles: nodeRoles(n.metadata?.labels),
        version: n.status?.nodeInfo?.kubeletVersion ?? '-',
        os: n.status?.nodeInfo?.osImage ?? '-',
        internalIP: n.status?.addresses?.find((a) => a.type === 'InternalIP')?.address ?? '-',
        cpu: formatCpu(n.status?.allocatable?.['cpu']),
        memory: formatMemory(n.status?.allocatable?.['memory']),
        age: formatAge(n.metadata?.creationTimestamp),
        cpuUsagePercent: usage && cpuAllocatable > 0 ? (usage.cpuMilli / cpuAllocatable) * 100 : null,
        memUsagePercent: usage && memAllocatable > 0 ? (usage.memBytes / memAllocatable) * 100 : null
      }
    })

    return {
      contextName: this.kc.getCurrentContext(),
      version: versionInfo.gitVersion ?? '-',
      namespaceCount: nsList.items.length,
      podCount: podList.items.length,
      nodes,
      metricsAvailable: nodeMetrics !== null
    }
  }

  async getClusterMetrics(): Promise<ClusterMetricsPoint> {
    const [nodeList, nodeMetrics] = await Promise.all([this.core.listNode(), this.tryGetNodeMetrics()])
    if (!nodeMetrics) return { available: false, cpuPercent: 0, memPercent: 0 }

    let cpuUsed = 0
    let memUsed = 0
    let cpuAllocatable = 0
    let memAllocatable = 0
    for (const n of nodeList.items) {
      const name = n.metadata?.name
      const usage = name ? nodeMetrics.get(name) : undefined
      if (!usage) continue
      cpuUsed += usage.cpuMilli
      memUsed += usage.memBytes
      cpuAllocatable += parseCpuMilli(n.status?.allocatable?.['cpu'])
      memAllocatable += parseMemBytes(n.status?.allocatable?.['memory'])
    }

    return {
      available: true,
      cpuPercent: cpuAllocatable > 0 ? (cpuUsed / cpuAllocatable) * 100 : 0,
      memPercent: memAllocatable > 0 ? (memUsed / memAllocatable) * 100 : 0
    }
  }

  async listNamespaces(): Promise<string[]> {
    const nsList = await this.core.listNamespace()
    return nsList.items.map((n) => n.metadata?.name ?? '-').sort()
  }

  async listResources(kind: ResourceKind, namespace: string | 'all'): Promise<ResourceTableResult> {
    switch (kind) {
      case 'pods':
        return this.listPods(namespace)
      case 'deployments':
        return this.listDeployments(namespace)
      case 'statefulsets':
        return this.listStatefulSets(namespace)
      case 'daemonsets':
        return this.listDaemonSets(namespace)
      case 'replicasets':
        return this.listReplicaSets(namespace)
      case 'jobs':
        return this.listJobs(namespace)
      case 'cronjobs':
        return this.listCronJobs(namespace)
      case 'services':
        return this.listServices(namespace)
      case 'ingresses':
        return this.listIngresses(namespace)
      case 'ingressclasses':
        return this.listIngressClasses()
      case 'endpoints':
        return this.listEndpoints(namespace)
      case 'endpointslices':
        return this.listEndpointSlices(namespace)
      case 'networkpolicies':
        return this.listNetworkPolicies(namespace)
      case 'configmaps':
        return this.listConfigMaps(namespace)
      case 'secrets':
        return this.listSecrets(namespace)
      case 'resourcequotas':
        return this.listResourceQuotas(namespace)
      case 'limitranges':
        return this.listLimitRanges(namespace)
      case 'hpas':
        return this.listHpas(namespace)
      case 'poddisruptionbudgets':
        return this.listPodDisruptionBudgets(namespace)
      case 'priorityclasses':
        return this.listPriorityClasses()
      case 'leases':
        return this.listLeases(namespace)
      case 'persistentvolumeclaims':
        return this.listPvcs(namespace)
      case 'persistentvolumes':
        return this.listPvs()
      case 'storageclasses':
        return this.listStorageClasses()
      case 'namespaces':
        return this.listNamespacesTable()
      case 'serviceaccounts':
        return this.listServiceAccounts(namespace)
      case 'roles':
        return this.listRoles(namespace)
      case 'rolebindings':
        return this.listRoleBindings(namespace)
      case 'clusterroles':
        return this.listClusterRoles()
      case 'clusterrolebindings':
        return this.listClusterRoleBindings()
      case 'events':
        return this.listEvents(namespace)
    }
  }

  private async listPods(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listPodForAllNamespaces()
        : await this.core.listNamespacedPod({ namespace })
    return {
      columns: [
        { key: 'ready', label: 'Ready' },
        { key: 'status', label: 'Status' },
        { key: 'restarts', label: 'Restarts' },
        { key: 'node', label: 'Node' },
        { key: 'ip', label: 'IP' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((p) => ({
        name: p.metadata?.name ?? '-',
        namespace: p.metadata?.namespace,
        cells: {
          ready: podReadyCount(p.status?.containerStatuses),
          status: podStatusPhase(p),
          restarts: podRestartCount(p.status?.containerStatuses),
          node: p.spec?.nodeName ?? '-',
          ip: p.status?.podIP ?? '-',
          age: formatAge(p.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listDeployments(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.apps.listDeploymentForAllNamespaces()
        : await this.apps.listNamespacedDeployment({ namespace })
    return {
      columns: [
        { key: 'ready', label: 'Ready' },
        { key: 'upToDate', label: 'Up-to-date' },
        { key: 'available', label: 'Available' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((d) => ({
        name: d.metadata?.name ?? '-',
        namespace: d.metadata?.namespace,
        cells: {
          ready: `${d.status?.readyReplicas ?? 0}/${d.spec?.replicas ?? 0}`,
          upToDate: String(d.status?.updatedReplicas ?? 0),
          available: String(d.status?.availableReplicas ?? 0),
          age: formatAge(d.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listStatefulSets(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.apps.listStatefulSetForAllNamespaces()
        : await this.apps.listNamespacedStatefulSet({ namespace })
    return {
      columns: [
        { key: 'ready', label: 'Ready' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((s) => ({
        name: s.metadata?.name ?? '-',
        namespace: s.metadata?.namespace,
        cells: {
          ready: `${s.status?.readyReplicas ?? 0}/${s.spec?.replicas ?? 0}`,
          age: formatAge(s.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listDaemonSets(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.apps.listDaemonSetForAllNamespaces()
        : await this.apps.listNamespacedDaemonSet({ namespace })
    return {
      columns: [
        { key: 'desired', label: 'Desired' },
        { key: 'current', label: 'Current' },
        { key: 'ready', label: 'Ready' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((d) => ({
        name: d.metadata?.name ?? '-',
        namespace: d.metadata?.namespace,
        cells: {
          desired: String(d.status?.desiredNumberScheduled ?? 0),
          current: String(d.status?.currentNumberScheduled ?? 0),
          ready: String(d.status?.numberReady ?? 0),
          age: formatAge(d.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listServices(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listServiceForAllNamespaces()
        : await this.core.listNamespacedService({ namespace })
    return {
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'clusterIP', label: 'Cluster IP' },
        { key: 'externalIP', label: 'External IP' },
        { key: 'ports', label: 'Ports' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((s) => ({
        name: s.metadata?.name ?? '-',
        namespace: s.metadata?.namespace,
        cells: {
          type: s.spec?.type ?? '-',
          clusterIP: s.spec?.clusterIP ?? '-',
          externalIP:
            s.status?.loadBalancer?.ingress?.map((i) => i.ip ?? i.hostname).join(',') || '-',
          ports: (s.spec?.ports ?? []).map((p) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`).join(','),
          age: formatAge(s.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listIngresses(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.net.listIngressForAllNamespaces()
        : await this.net.listNamespacedIngress({ namespace })
    return {
      columns: [
        { key: 'class', label: 'Class' },
        { key: 'hosts', label: 'Hosts' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((i) => ({
        name: i.metadata?.name ?? '-',
        namespace: i.metadata?.namespace,
        cells: {
          class: i.spec?.ingressClassName ?? '-',
          hosts: (i.spec?.rules ?? []).map((r) => r.host).filter(Boolean).join(',') || '-',
          age: formatAge(i.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listConfigMaps(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listConfigMapForAllNamespaces()
        : await this.core.listNamespacedConfigMap({ namespace })
    return {
      columns: [
        { key: 'keys', label: 'Keys' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((c) => ({
        name: c.metadata?.name ?? '-',
        namespace: c.metadata?.namespace,
        cells: {
          keys: String(Object.keys(c.data ?? {}).length + Object.keys(c.binaryData ?? {}).length),
          age: formatAge(c.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listSecrets(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listSecretForAllNamespaces()
        : await this.core.listNamespacedSecret({ namespace })
    return {
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'keys', label: 'Keys' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((s) => ({
        name: s.metadata?.name ?? '-',
        namespace: s.metadata?.namespace,
        cells: {
          type: s.type ?? '-',
          keys: String(Object.keys(s.data ?? {}).length),
          age: formatAge(s.metadata?.creationTimestamp)
        }
      }))
    }
  }

  // Values are decoded here (not left as raw base64) but the caller is responsible for masking
  // them in the UI by default -- this only removes the "redacted entirely" wall, not the "shown
  // by default" one. Anyone who can call this already has equivalent access via
  // `kubectl get secret -o jsonpath | base64 -d`; masked-by-default-with-reveal (like Freelens)
  // protects against shoulder-surfing/screen-share, not against a user who can already read it.
  async getSecretDetail(namespace: string, name: string): Promise<SecretDetail> {
    const secret = await this.core.readNamespacedSecret({ name, namespace })
    const data: SecretKeyValue[] = Object.entries(secret.data ?? {}).map(([key, base64Value]) => {
      const bytes = Buffer.from(base64Value, 'base64')
      const text = bytes.toString('utf8')
      const binary = text.includes('�') || /[\x00-\x08\x0E-\x1F]/.test(text)
      return { key, value: binary ? `<binary data, ${bytes.length} bytes>` : text, binary }
    })
    return {
      name: secret.metadata?.name ?? name,
      namespace: secret.metadata?.namespace ?? namespace,
      type: secret.type ?? 'Opaque',
      labels: secret.metadata?.labels ?? {},
      annotations: secret.metadata?.annotations ?? {},
      age: formatAge(secret.metadata?.creationTimestamp),
      data
    }
  }

  private async listEvents(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listEventForAllNamespaces()
        : await this.core.listNamespacedEvent({ namespace })
    const sorted = [...list.items].sort((a, b) => {
      const at = new Date(a.lastTimestamp ?? a.eventTime ?? a.metadata?.creationTimestamp ?? 0).getTime()
      const bt = new Date(b.lastTimestamp ?? b.eventTime ?? b.metadata?.creationTimestamp ?? 0).getTime()
      return bt - at
    })
    return {
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'reason', label: 'Reason' },
        { key: 'object', label: 'Object' },
        { key: 'message', label: 'Message' },
        { key: 'age', label: 'Age' }
      ],
      rows: sorted.map((e) => ({
        name: e.metadata?.name ?? '-',
        namespace: e.metadata?.namespace,
        cells: {
          type: e.type ?? '-',
          reason: e.reason ?? '-',
          object: e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : '-',
          message: e.message ?? '-',
          age: formatAge(e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp)
        }
      }))
    }
  }

  private async listReplicaSets(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.apps.listReplicaSetForAllNamespaces()
        : await this.apps.listNamespacedReplicaSet({ namespace })
    return {
      columns: [
        { key: 'desired', label: 'Desired' },
        { key: 'current', label: 'Current' },
        { key: 'ready', label: 'Ready' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((r) =>
        row(r.metadata, {
          desired: String(r.spec?.replicas ?? 0),
          current: String(r.status?.replicas ?? 0),
          ready: String(r.status?.readyReplicas ?? 0),
          age: formatAge(r.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listJobs(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.batch.listJobForAllNamespaces()
        : await this.batch.listNamespacedJob({ namespace })
    return {
      columns: [
        { key: 'completions', label: 'Completions' },
        { key: 'status', label: 'Status' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((j) =>
        row(j.metadata, {
          completions: `${j.status?.succeeded ?? 0}/${j.spec?.completions ?? 1}`,
          status: j.status?.failed ? 'Failed' : j.status?.active ? 'Running' : j.status?.succeeded ? 'Complete' : 'Pending',
          age: formatAge(j.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listCronJobs(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.batch.listCronJobForAllNamespaces()
        : await this.batch.listNamespacedCronJob({ namespace })
    return {
      columns: [
        { key: 'schedule', label: 'Schedule' },
        { key: 'suspend', label: 'Suspend' },
        { key: 'active', label: 'Active' },
        { key: 'lastSchedule', label: 'Last Schedule' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((c) =>
        row(c.metadata, {
          schedule: c.spec?.schedule ?? '-',
          suspend: String(c.spec?.suspend ?? false),
          active: String(c.status?.active?.length ?? 0),
          lastSchedule: formatAge(c.status?.lastScheduleTime),
          age: formatAge(c.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listIngressClasses(): Promise<ResourceTableResult> {
    const list = await this.net.listIngressClass()
    return {
      columns: [
        { key: 'controller', label: 'Controller' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((i) =>
        row(i.metadata, {
          controller: i.spec?.controller ?? '-',
          age: formatAge(i.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listEndpoints(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listEndpointsForAllNamespaces()
        : await this.core.listNamespacedEndpoints({ namespace })
    return {
      columns: [
        { key: 'endpoints', label: 'Endpoints' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((e) => {
        const addrs = (e.subsets ?? []).flatMap(
          (s) => (s.addresses ?? []).flatMap((a) => (s.ports ?? [{ port: undefined }]).map((p) => `${a.ip}${p.port ? ':' + p.port : ''}`))
        )
        return row(e.metadata, {
          endpoints: addrs.slice(0, 3).join(',') + (addrs.length > 3 ? ` (+${addrs.length - 3})` : '') || '-',
          age: formatAge(e.metadata?.creationTimestamp)
        })
      })
    }
  }

  private async listEndpointSlices(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.discovery.listEndpointSliceForAllNamespaces()
        : await this.discovery.listNamespacedEndpointSlice({ namespace })
    return {
      columns: [
        { key: 'addressType', label: 'Address Type' },
        { key: 'ports', label: 'Ports' },
        { key: 'endpointCount', label: 'Endpoints' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((e) =>
        row(e.metadata, {
          addressType: e.addressType ?? '-',
          ports: (e.ports ?? []).map((p) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`).join(',') || '-',
          endpointCount: String(e.endpoints?.length ?? 0),
          age: formatAge(e.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listNetworkPolicies(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.net.listNetworkPolicyForAllNamespaces()
        : await this.net.listNamespacedNetworkPolicy({ namespace })
    return {
      columns: [
        { key: 'podSelector', label: 'Pod Selector' },
        { key: 'policyTypes', label: 'Policy Types' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((n) =>
        row(n.metadata, {
          podSelector: Object.entries(n.spec?.podSelector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',') || 'all pods',
          policyTypes: (n.spec?.policyTypes ?? []).join(',') || '-',
          age: formatAge(n.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listResourceQuotas(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listResourceQuotaForAllNamespaces()
        : await this.core.listNamespacedResourceQuota({ namespace })
    return {
      columns: [
        { key: 'requests', label: 'Used / Hard' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((q) => {
        const used = q.status?.used ?? {}
        const hard = q.status?.hard ?? {}
        const summary = Object.keys(hard)
          .slice(0, 3)
          .map((k) => `${k}: ${used[k] ?? 0}/${hard[k]}`)
          .join(', ')
        return row(q.metadata, { requests: summary || '-', age: formatAge(q.metadata?.creationTimestamp) })
      })
    }
  }

  private async listLimitRanges(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listLimitRangeForAllNamespaces()
        : await this.core.listNamespacedLimitRange({ namespace })
    return {
      columns: [
        { key: 'limitCount', label: 'Limits' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((l) =>
        row(l.metadata, {
          limitCount: String(l.spec?.limits?.length ?? 0),
          age: formatAge(l.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listHpas(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.autoscaling.listHorizontalPodAutoscalerForAllNamespaces()
        : await this.autoscaling.listNamespacedHorizontalPodAutoscaler({ namespace })
    return {
      columns: [
        { key: 'reference', label: 'Reference' },
        { key: 'minPods', label: 'Min' },
        { key: 'maxPods', label: 'Max' },
        { key: 'replicas', label: 'Replicas' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((h) =>
        row(h.metadata, {
          reference: h.spec?.scaleTargetRef ? `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}` : '-',
          minPods: String(h.spec?.minReplicas ?? '-'),
          maxPods: String(h.spec?.maxReplicas ?? '-'),
          replicas: String(h.status?.currentReplicas ?? 0),
          age: formatAge(h.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listPodDisruptionBudgets(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.policy.listPodDisruptionBudgetForAllNamespaces()
        : await this.policy.listNamespacedPodDisruptionBudget({ namespace })
    return {
      columns: [
        { key: 'minAvailable', label: 'Min Available' },
        { key: 'maxUnavailable', label: 'Max Unavailable' },
        { key: 'allowedDisruptions', label: 'Allowed Disruptions' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((p) =>
        row(p.metadata, {
          minAvailable: String(p.spec?.minAvailable ?? '-'),
          maxUnavailable: String(p.spec?.maxUnavailable ?? '-'),
          allowedDisruptions: String(p.status?.disruptionsAllowed ?? 0),
          age: formatAge(p.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listPriorityClasses(): Promise<ResourceTableResult> {
    const list = await this.scheduling.listPriorityClass()
    return {
      columns: [
        { key: 'value', label: 'Value' },
        { key: 'globalDefault', label: 'Global Default' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((p) =>
        row(p.metadata, {
          value: String(p.value ?? 0),
          globalDefault: String(p.globalDefault ?? false),
          age: formatAge(p.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listLeases(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.coordination.listLeaseForAllNamespaces()
        : await this.coordination.listNamespacedLease({ namespace })
    return {
      columns: [
        { key: 'holder', label: 'Holder' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((l) =>
        row(l.metadata, {
          holder: l.spec?.holderIdentity ?? '-',
          age: formatAge(l.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listPvcs(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listPersistentVolumeClaimForAllNamespaces()
        : await this.core.listNamespacedPersistentVolumeClaim({ namespace })
    return {
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'volume', label: 'Volume' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'storageClass', label: 'Storage Class' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((p) =>
        row(p.metadata, {
          status: p.status?.phase ?? '-',
          volume: p.spec?.volumeName ?? '-',
          capacity: p.status?.capacity?.storage ?? '-',
          storageClass: p.spec?.storageClassName ?? '-',
          age: formatAge(p.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listPvs(): Promise<ResourceTableResult> {
    const list = await this.core.listPersistentVolume()
    return {
      columns: [
        { key: 'capacity', label: 'Capacity' },
        { key: 'accessModes', label: 'Access Modes' },
        { key: 'reclaimPolicy', label: 'Reclaim Policy' },
        { key: 'status', label: 'Status' },
        { key: 'claim', label: 'Claim' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((p) =>
        row(p.metadata, {
          capacity: p.spec?.capacity?.storage ?? '-',
          accessModes: (p.spec?.accessModes ?? []).join(',') || '-',
          reclaimPolicy: p.spec?.persistentVolumeReclaimPolicy ?? '-',
          status: p.status?.phase ?? '-',
          claim: p.spec?.claimRef ? `${p.spec.claimRef.namespace}/${p.spec.claimRef.name}` : '-',
          age: formatAge(p.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listStorageClasses(): Promise<ResourceTableResult> {
    const list = await this.storage.listStorageClass()
    return {
      columns: [
        { key: 'provisioner', label: 'Provisioner' },
        { key: 'reclaimPolicy', label: 'Reclaim Policy' },
        { key: 'volumeBindingMode', label: 'Volume Binding Mode' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((s) =>
        row(s.metadata, {
          provisioner: s.provisioner ?? '-',
          reclaimPolicy: s.reclaimPolicy ?? '-',
          volumeBindingMode: s.volumeBindingMode ?? '-',
          age: formatAge(s.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listNamespacesTable(): Promise<ResourceTableResult> {
    const list = await this.core.listNamespace()
    return {
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((n) =>
        row(n.metadata, {
          status: n.status?.phase ?? '-',
          age: formatAge(n.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listServiceAccounts(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listServiceAccountForAllNamespaces()
        : await this.core.listNamespacedServiceAccount({ namespace })
    return {
      columns: [
        { key: 'secrets', label: 'Secrets' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((s) =>
        row(s.metadata, {
          secrets: String(s.secrets?.length ?? 0),
          age: formatAge(s.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listRoles(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.rbac.listRoleForAllNamespaces()
        : await this.rbac.listNamespacedRole({ namespace })
    return {
      columns: [
        { key: 'rules', label: 'Rules' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((r) =>
        row(r.metadata, {
          rules: String(r.rules?.length ?? 0),
          age: formatAge(r.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listRoleBindings(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.rbac.listRoleBindingForAllNamespaces()
        : await this.rbac.listNamespacedRoleBinding({ namespace })
    return {
      columns: [
        { key: 'role', label: 'Role' },
        { key: 'subjects', label: 'Subjects' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((b) =>
        row(b.metadata, {
          role: b.roleRef ? `${b.roleRef.kind}/${b.roleRef.name}` : '-',
          subjects: (b.subjects ?? []).map((s) => s.name).join(',') || '-',
          age: formatAge(b.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listClusterRoles(): Promise<ResourceTableResult> {
    const list = await this.rbac.listClusterRole()
    return {
      columns: [
        { key: 'rules', label: 'Rules' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((r) =>
        row(r.metadata, {
          rules: String(r.rules?.length ?? 0),
          age: formatAge(r.metadata?.creationTimestamp)
        })
      )
    }
  }

  private async listClusterRoleBindings(): Promise<ResourceTableResult> {
    const list = await this.rbac.listClusterRoleBinding()
    return {
      columns: [
        { key: 'role', label: 'Role' },
        { key: 'subjects', label: 'Subjects' },
        { key: 'age', label: 'Age' }
      ],
      rows: list.items.map((b) =>
        row(b.metadata, {
          role: b.roleRef ? `${b.roleRef.kind}/${b.roleRef.name}` : '-',
          subjects: (b.subjects ?? []).map((s) => s.name).join(',') || '-',
          age: formatAge(b.metadata?.creationTimestamp)
        })
      )
    }
  }

  async listCrds(): Promise<CrdGroups> {
    const list = await this.apiext.listCustomResourceDefinition()
    const groups: CrdGroups = {}
    for (const crd of list.items) {
      const version = crd.spec.versions.find((v) => v.storage) ?? crd.spec.versions.find((v) => v.served) ?? crd.spec.versions[0]
      if (!version) continue
      const info: CrdInfo = {
        name: crd.metadata?.name ?? '-',
        group: crd.spec.group,
        version: version.name,
        kind: crd.spec.names.kind,
        plural: crd.spec.names.plural,
        namespaced: crd.spec.scope === 'Namespaced'
      }
      ;(groups[info.group] ??= []).push(info)
    }
    for (const g of Object.values(groups)) g.sort((a, b) => a.kind.localeCompare(b.kind))
    return groups
  }

  private async getCrdDef(crdName: string): Promise<{
    group: string
    version: string
    plural: string
    namespaced: boolean
    printerColumns: { name: string; type: string; jsonPath: string }[]
  }> {
    const crd = await this.apiext.readCustomResourceDefinition({ name: crdName })
    const version = crd.spec.versions.find((v) => v.storage) ?? crd.spec.versions.find((v) => v.served) ?? crd.spec.versions[0]
    return {
      group: crd.spec.group,
      version: version?.name ?? '',
      plural: crd.spec.names.plural,
      namespaced: crd.spec.scope === 'Namespaced',
      printerColumns: (version?.additionalPrinterColumns ?? []).filter((c) => c.name !== 'Age')
    }
  }

  async listCrdInstances(crdName: string, namespace: string | 'all'): Promise<ResourceTableResult> {
    const def = await this.getCrdDef(crdName)
    let items: Record<string, unknown>[]
    if (!def.namespaced) {
      const result = await this.customObjects.listClusterCustomObject({
        group: def.group,
        version: def.version,
        plural: def.plural
      })
      items = ((result as { items?: Record<string, unknown>[] }).items ?? [])
    } else if (namespace === 'all') {
      const result = await this.customObjects.listCustomObjectForAllNamespaces({
        group: def.group,
        version: def.version,
        plural: def.plural
      })
      items = ((result as { items?: Record<string, unknown>[] }).items ?? [])
    } else {
      const result = await this.customObjects.listNamespacedCustomObject({
        group: def.group,
        version: def.version,
        namespace,
        plural: def.plural
      })
      items = ((result as { items?: Record<string, unknown>[] }).items ?? [])
    }

    // Real, kind-specific columns from the CRD's own schema -- the same source `kubectl get`
    // reads -- instead of a generic Name/Age table for every custom resource.
    const columns = def.printerColumns.map((c) => ({ key: c.name, label: c.name }))
    columns.push({ key: 'age', label: 'Age' })

    return {
      columns,
      rows: items.map((obj) => {
        const meta = (obj as { metadata?: { name?: string; namespace?: string; creationTimestamp?: string } })
          .metadata
        const cells: Record<string, string> = {}
        for (const col of def.printerColumns) {
          cells[col.name] = formatPrinterColumnValue(resolveJsonPath(obj, col.jsonPath), col.type)
        }
        cells.age = formatAge(meta?.creationTimestamp)
        return row(meta, cells)
      })
    }
  }

  async getCrdInstanceYaml(crdName: string, namespace: string | undefined, name: string): Promise<string> {
    const def = await this.getCrdDef(crdName)
    const obj = def.namespaced
      ? await this.customObjects.getNamespacedCustomObject({
          group: def.group,
          version: def.version,
          namespace: namespace!,
          plural: def.plural,
          name
        })
      : await this.customObjects.getClusterCustomObject({
          group: def.group,
          version: def.version,
          plural: def.plural,
          name
        })
    return yaml.dump(cleanForYaml(obj as { metadata?: { managedFields?: unknown } }), { noRefs: true })
  }

  async listHelmReleases(namespace: string | 'all'): Promise<ResourceTableResult> {
    const list =
      namespace === 'all'
        ? await this.core.listSecretForAllNamespaces({ labelSelector: 'owner=helm' })
        : await this.core.listNamespacedSecret({ namespace, labelSelector: 'owner=helm' })

    const rows: ResourceRow[] = []
    for (const secret of latestHelmSecrets(list.items)) {
      try {
        const release = decodeHelmRelease(secret.data?.release ?? '')
        rows.push({
          name: release.name,
          namespace: secret.metadata?.namespace,
          cells: {
            chart: release.chart?.metadata?.name ?? '-',
            chartVersion: release.chart?.metadata?.version ?? '-',
            appVersion: release.chart?.metadata?.appVersion ?? '-',
            revision: String(release.version ?? '-'),
            status: release.info?.status ?? '-',
            updated: formatAge(release.info?.last_deployed)
          }
        })
      } catch {
        // A release secret we can't decode (unexpected format, corrupted) shouldn't break the
        // rest of the list -- just skip it.
      }
    }

    return {
      columns: [
        { key: 'chart', label: 'Chart' },
        { key: 'chartVersion', label: 'Chart Version' },
        { key: 'appVersion', label: 'App Version' },
        { key: 'revision', label: 'Revision' },
        { key: 'status', label: 'Status' },
        { key: 'updated', label: 'Updated' }
      ],
      rows
    }
  }

  async getHelmReleaseYaml(namespace: string, name: string): Promise<string> {
    const list = await this.core.listNamespacedSecret({
      namespace,
      labelSelector: `owner=helm,name=${name}`
    })
    const [latestSecret] = latestHelmSecrets(list.items)
    if (!latestSecret) throw new Error(`Helm release "${name}" not found in namespace "${namespace}"`)

    const release = decodeHelmRelease(latestSecret.data?.release ?? '')
    return yaml.dump(
      {
        name: release.name,
        namespace: release.namespace,
        chart: release.chart?.metadata?.name,
        chartVersion: release.chart?.metadata?.version,
        appVersion: release.chart?.metadata?.appVersion,
        revision: release.version,
        status: release.info?.status,
        firstDeployed: release.info?.first_deployed,
        lastDeployed: release.info?.last_deployed,
        description: release.info?.description,
        notes: release.info?.notes,
        values: release.config ?? {}
      },
      { noRefs: true }
    )
  }

  async getResourceYaml(
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<string> {
    let obj: unknown
    switch (kind) {
      case 'pods':
        obj = await this.core.readNamespacedPod({ name, namespace: namespace! })
        break
      case 'deployments':
        obj = await this.apps.readNamespacedDeployment({ name, namespace: namespace! })
        break
      case 'statefulsets':
        obj = await this.apps.readNamespacedStatefulSet({ name, namespace: namespace! })
        break
      case 'daemonsets':
        obj = await this.apps.readNamespacedDaemonSet({ name, namespace: namespace! })
        break
      case 'services':
        obj = await this.core.readNamespacedService({ name, namespace: namespace! })
        break
      case 'ingresses':
        obj = await this.net.readNamespacedIngress({ name, namespace: namespace! })
        break
      case 'configmaps':
        obj = await this.core.readNamespacedConfigMap({ name, namespace: namespace! })
        break
      case 'secrets': {
        const secret = await this.core.readNamespacedSecret({ name, namespace: namespace! })
        redactSecret(secret)
        obj = secret
        break
      }
      case 'events':
        obj = await this.core.readNamespacedEvent({ name, namespace: namespace! })
        break
      case 'replicasets':
        obj = await this.apps.readNamespacedReplicaSet({ name, namespace: namespace! })
        break
      case 'jobs':
        obj = await this.batch.readNamespacedJob({ name, namespace: namespace! })
        break
      case 'cronjobs':
        obj = await this.batch.readNamespacedCronJob({ name, namespace: namespace! })
        break
      case 'ingressclasses':
        obj = await this.net.readIngressClass({ name })
        break
      case 'endpoints':
        obj = await this.core.readNamespacedEndpoints({ name, namespace: namespace! })
        break
      case 'endpointslices':
        obj = await this.discovery.readNamespacedEndpointSlice({ name, namespace: namespace! })
        break
      case 'networkpolicies':
        obj = await this.net.readNamespacedNetworkPolicy({ name, namespace: namespace! })
        break
      case 'resourcequotas':
        obj = await this.core.readNamespacedResourceQuota({ name, namespace: namespace! })
        break
      case 'limitranges':
        obj = await this.core.readNamespacedLimitRange({ name, namespace: namespace! })
        break
      case 'hpas':
        obj = await this.autoscaling.readNamespacedHorizontalPodAutoscaler({ name, namespace: namespace! })
        break
      case 'poddisruptionbudgets':
        obj = await this.policy.readNamespacedPodDisruptionBudget({ name, namespace: namespace! })
        break
      case 'priorityclasses':
        obj = await this.scheduling.readPriorityClass({ name })
        break
      case 'leases':
        obj = await this.coordination.readNamespacedLease({ name, namespace: namespace! })
        break
      case 'persistentvolumeclaims':
        obj = await this.core.readNamespacedPersistentVolumeClaim({ name, namespace: namespace! })
        break
      case 'persistentvolumes':
        obj = await this.core.readPersistentVolume({ name })
        break
      case 'storageclasses':
        obj = await this.storage.readStorageClass({ name })
        break
      case 'namespaces':
        obj = await this.core.readNamespace({ name })
        break
      case 'serviceaccounts':
        obj = await this.core.readNamespacedServiceAccount({ name, namespace: namespace! })
        break
      case 'roles':
        obj = await this.rbac.readNamespacedRole({ name, namespace: namespace! })
        break
      case 'rolebindings':
        obj = await this.rbac.readNamespacedRoleBinding({ name, namespace: namespace! })
        break
      case 'clusterroles':
        obj = await this.rbac.readClusterRole({ name })
        break
      case 'clusterrolebindings':
        obj = await this.rbac.readClusterRoleBinding({ name })
        break
    }
    return yaml.dump(cleanForYaml(obj as { metadata?: { managedFields?: unknown } }), { noRefs: true })
  }

  async listPodContainers(namespace: string, pod: string): Promise<string[]> {
    const p = await this.core.readNamespacedPod({ name: pod, namespace })
    const init = (p.spec?.initContainers ?? []).map((c) => c.name)
    const main = (p.spec?.containers ?? []).map((c) => c.name)
    return [...init, ...main]
  }

  async streamLogs(
    requestId: string,
    namespace: string,
    pod: string,
    container: string,
    follow: boolean,
    tailLines: number,
    onData: (chunk: string) => void,
    onEnd: () => void,
    onError: (message: string) => void
  ): Promise<void> {
    const log = new Log(this.kc)
    const sink = new Writable({
      write: (chunk, _enc, cb) => {
        onData(chunk.toString('utf8'))
        cb()
      }
    })
    sink.on('close', () => {
      this.activeLogStreams.delete(requestId)
      onEnd()
    })
    sink.on('error', (err) => onError(err.message))

    try {
      const controller = await log.log(namespace, pod, container, sink, {
        follow,
        tailLines,
        pretty: false,
        timestamps: false
      })
      this.activeLogStreams.set(requestId, controller)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  stopLogs(requestId: string): void {
    this.activeLogStreams.get(requestId)?.abort()
    this.activeLogStreams.delete(requestId)
  }

  // Called when this manager is about to be replaced (e.g. re-opening the same context against a
  // different kubeconfig file) so its streams don't keep running orphaned in the background.
  stopAllLogs(): void {
    for (const controller of this.activeLogStreams.values()) controller.abort()
    this.activeLogStreams.clear()
  }
}
