export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ContextInfo {
  name: string
  cluster: string
  user: string
  namespace: string
  isCurrent: boolean
}

export interface NodeSummary {
  name: string
  status: string
  roles: string
  version: string
  os: string
  internalIP: string
  cpu: string
  memory: string
  age: string
}

export interface ClusterOverview {
  contextName: string
  version: string
  namespaceCount: number
  podCount: number
  nodes: NodeSummary[]
}

export type ResourceKind =
  | 'pods'
  | 'deployments'
  | 'statefulsets'
  | 'daemonsets'
  | 'replicasets'
  | 'jobs'
  | 'cronjobs'
  | 'services'
  | 'ingresses'
  | 'ingressclasses'
  | 'endpoints'
  | 'endpointslices'
  | 'networkpolicies'
  | 'configmaps'
  | 'secrets'
  | 'resourcequotas'
  | 'limitranges'
  | 'hpas'
  | 'poddisruptionbudgets'
  | 'priorityclasses'
  | 'leases'
  | 'persistentvolumeclaims'
  | 'persistentvolumes'
  | 'storageclasses'
  | 'namespaces'
  | 'serviceaccounts'
  | 'roles'
  | 'rolebindings'
  | 'clusterroles'
  | 'clusterrolebindings'
  | 'events'

export interface ResourceRow {
  name: string
  namespace?: string
  cells: Record<string, string>
}

export interface ResourceTableResult {
  columns: { key: string; label: string }[]
  rows: ResourceRow[]
}

export interface PodContainerInfo {
  name: string
  isInit: boolean
}

export interface LogStreamRequest {
  requestId: string
  namespace: string
  pod: string
  container: string
  follow: boolean
  tailLines: number
}

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  pods: 'Pods',
  deployments: 'Deployments',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  replicasets: 'ReplicaSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  services: 'Services',
  ingresses: 'Ingresses',
  ingressclasses: 'Ingress Classes',
  endpoints: 'Endpoints',
  endpointslices: 'Endpoint Slices',
  networkpolicies: 'Network Policies',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  resourcequotas: 'Resource Quotas',
  limitranges: 'Limit Ranges',
  hpas: 'Horizontal Pod Autoscalers',
  poddisruptionbudgets: 'Pod Disruption Budgets',
  priorityclasses: 'Priority Classes',
  leases: 'Leases',
  persistentvolumeclaims: 'Persistent Volume Claims',
  persistentvolumes: 'Persistent Volumes',
  storageclasses: 'Storage Classes',
  namespaces: 'Namespaces',
  serviceaccounts: 'Service Accounts',
  roles: 'Roles',
  rolebindings: 'Role Bindings',
  clusterroles: 'Cluster Roles',
  clusterrolebindings: 'Cluster Role Bindings',
  events: 'Events'
}

// Cluster-scoped kinds have no namespace -- the UI hides the namespace selector/column for these.
export const RESOURCE_KIND_NAMESPACED: Record<ResourceKind, boolean> = {
  pods: true,
  deployments: true,
  statefulsets: true,
  daemonsets: true,
  replicasets: true,
  jobs: true,
  cronjobs: true,
  services: true,
  ingresses: true,
  ingressclasses: false,
  endpoints: true,
  endpointslices: true,
  networkpolicies: true,
  configmaps: true,
  secrets: true,
  resourcequotas: true,
  limitranges: true,
  hpas: true,
  poddisruptionbudgets: true,
  priorityclasses: false,
  leases: true,
  persistentvolumeclaims: true,
  persistentvolumes: false,
  storageclasses: false,
  namespaces: false,
  serviceaccounts: true,
  roles: true,
  rolebindings: true,
  clusterroles: false,
  clusterrolebindings: false,
  events: true
}
