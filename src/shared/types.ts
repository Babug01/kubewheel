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
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
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
  services: 'Services',
  ingresses: 'Ingresses',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  events: 'Events'
}
