import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  NetworkingV1Api,
  VersionApi,
  Log
} from '@kubernetes/client-node'
import * as yaml from 'js-yaml'
import { Writable } from 'stream'
import type {
  ClusterOverview,
  ContextInfo,
  NodeSummary,
  ResourceKind,
  ResourceRow,
  ResourceTableResult
} from '../../shared/types'
import {
  formatAge,
  formatCpu,
  formatMemory,
  nodeReadyStatus,
  nodeRoles,
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

export class KubeManager {
  private kc = new KubeConfig()
  private core!: CoreV1Api
  private apps!: AppsV1Api
  private net!: NetworkingV1Api
  private version!: VersionApi
  private activeLogStreams = new Map<string, AbortController>()

  constructor() {
    this.kc.loadFromDefault()
    this.buildClients()
  }

  private buildClients(): void {
    this.core = this.kc.makeApiClient(CoreV1Api)
    this.apps = this.kc.makeApiClient(AppsV1Api)
    this.net = this.kc.makeApiClient(NetworkingV1Api)
    this.version = this.kc.makeApiClient(VersionApi)
  }

  listContexts(): ContextInfo[] {
    const current = this.kc.getCurrentContext()
    return this.kc.getContexts().map((c) => ({
      name: c.name,
      cluster: c.cluster,
      user: c.user,
      namespace: c.namespace ?? 'default',
      isCurrent: c.name === current
    }))
  }

  setContext(name: string): void {
    this.kc.setCurrentContext(name)
    this.buildClients()
  }

  async getOverview(): Promise<ClusterOverview> {
    const [versionInfo, nodeList, nsList, podList] = await Promise.all([
      this.version.getCode(),
      this.core.listNode(),
      this.core.listNamespace(),
      this.core.listPodForAllNamespaces()
    ])

    const nodes: NodeSummary[] = nodeList.items.map((n) => ({
      name: n.metadata?.name ?? '-',
      status: nodeReadyStatus(n.status?.conditions),
      roles: nodeRoles(n.metadata?.labels),
      version: n.status?.nodeInfo?.kubeletVersion ?? '-',
      os: n.status?.nodeInfo?.osImage ?? '-',
      internalIP: n.status?.addresses?.find((a) => a.type === 'InternalIP')?.address ?? '-',
      cpu: formatCpu(n.status?.allocatable?.['cpu']),
      memory: formatMemory(n.status?.allocatable?.['memory']),
      age: formatAge(n.metadata?.creationTimestamp)
    }))

    return {
      contextName: this.kc.getCurrentContext(),
      version: versionInfo.gitVersion ?? '-',
      namespaceCount: nsList.items.length,
      podCount: podList.items.length,
      nodes
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
      case 'services':
        return this.listServices(namespace)
      case 'ingresses':
        return this.listIngresses(namespace)
      case 'configmaps':
        return this.listConfigMaps(namespace)
      case 'secrets':
        return this.listSecrets(namespace)
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
}
