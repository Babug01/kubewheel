import { contextBridge, ipcRenderer } from 'electron'
import type {
  ClusterMetricsPoint,
  ClusterOverview,
  ContextInfo,
  CrdGroups,
  LogStreamRequest,
  ResourceKind,
  ResourceTableResult,
  Result,
  SecretDetail
} from '../shared/types'

const api = {
  listContexts: (extraPaths: string[]): Promise<Result<ContextInfo[]>> =>
    ipcRenderer.invoke('k8s:listContexts', extraPaths),
  openContext: (contextName: string, kubeconfigPath: string): Promise<Result<void>> =>
    ipcRenderer.invoke('k8s:openContext', contextName, kubeconfigPath),
  pickKubeconfig: (): Promise<Result<string | null>> => ipcRenderer.invoke('dialog:pickKubeconfig'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getOverview: (contextName: string): Promise<Result<ClusterOverview>> =>
    ipcRenderer.invoke('k8s:getOverview', contextName),
  getContextVersion: (contextName: string, kubeconfigPath: string): Promise<Result<string>> =>
    ipcRenderer.invoke('k8s:getContextVersion', contextName, kubeconfigPath),
  getClusterMetrics: (contextName: string): Promise<Result<ClusterMetricsPoint>> =>
    ipcRenderer.invoke('k8s:getClusterMetrics', contextName),
  listNamespaces: (contextName: string): Promise<Result<string[]>> =>
    ipcRenderer.invoke('k8s:listNamespaces', contextName),
  listResources: (
    contextName: string,
    kind: ResourceKind,
    namespace: string
  ): Promise<Result<ResourceTableResult>> =>
    ipcRenderer.invoke('k8s:listResources', contextName, kind, namespace),
  getResourceYaml: (
    contextName: string,
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<Result<string>> =>
    ipcRenderer.invoke('k8s:getResourceYaml', contextName, kind, namespace, name),
  listPodContainers: (contextName: string, namespace: string, pod: string): Promise<Result<string[]>> =>
    ipcRenderer.invoke('k8s:listPodContainers', contextName, namespace, pod),

  getReadOnlyMode: (): Promise<Result<boolean>> => ipcRenderer.invoke('settings:getReadOnlyMode'),
  setReadOnlyMode: (value: boolean): Promise<Result<void>> =>
    ipcRenderer.invoke('settings:setReadOnlyMode', value),
  applyResourceYaml: (
    contextName: string,
    kind: ResourceKind,
    namespace: string | undefined,
    name: string,
    yamlText: string
  ): Promise<Result<void>> =>
    ipcRenderer.invoke('k8s:applyResourceYaml', contextName, kind, namespace, name, yamlText),
  deleteResource: (
    contextName: string,
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<Result<void>> => ipcRenderer.invoke('k8s:deleteResource', contextName, kind, namespace, name),
  scaleResource: (
    contextName: string,
    kind: ResourceKind,
    namespace: string,
    name: string,
    replicas: number
  ): Promise<Result<void>> =>
    ipcRenderer.invoke('k8s:scaleResource', contextName, kind, namespace, name, replicas),
  restartResource: (contextName: string, kind: ResourceKind, namespace: string, name: string): Promise<Result<void>> =>
    ipcRenderer.invoke('k8s:restartResource', contextName, kind, namespace, name),

  getSecretDetail: (contextName: string, namespace: string, name: string): Promise<Result<SecretDetail>> =>
    ipcRenderer.invoke('k8s:getSecretDetail', contextName, namespace, name),

  listCrds: (contextName: string): Promise<Result<CrdGroups>> => ipcRenderer.invoke('k8s:listCrds', contextName),
  listCrdInstances: (
    contextName: string,
    crdName: string,
    namespace: string
  ): Promise<Result<ResourceTableResult>> =>
    ipcRenderer.invoke('k8s:listCrdInstances', contextName, crdName, namespace),
  getCrdInstanceYaml: (
    contextName: string,
    crdName: string,
    namespace: string | undefined,
    name: string
  ): Promise<Result<string>> =>
    ipcRenderer.invoke('k8s:getCrdInstanceYaml', contextName, crdName, namespace, name),

  listHelmReleases: (contextName: string, namespace: string): Promise<Result<ResourceTableResult>> =>
    ipcRenderer.invoke('k8s:listHelmReleases', contextName, namespace),
  getHelmReleaseYaml: (contextName: string, namespace: string, name: string): Promise<Result<string>> =>
    ipcRenderer.invoke('k8s:getHelmReleaseYaml', contextName, namespace, name),

  startLogStream: (contextName: string, req: LogStreamRequest): Promise<void> =>
    ipcRenderer.invoke('logs:start', contextName, req),
  stopLogStream: (contextName: string, requestId: string): Promise<void> =>
    ipcRenderer.invoke('logs:stop', contextName, requestId),
  onLogData: (cb: (data: { requestId: string; chunk: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { requestId: string; chunk: string }) =>
      cb(data)
    ipcRenderer.on('logs:data', listener)
    return () => ipcRenderer.removeListener('logs:data', listener)
  },
  onLogEnd: (cb: (data: { requestId: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { requestId: string }) => cb(data)
    ipcRenderer.on('logs:end', listener)
    return () => ipcRenderer.removeListener('logs:end', listener)
  },
  onLogError: (cb: (data: { requestId: string; message: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { requestId: string; message: string }) =>
      cb(data)
    ipcRenderer.on('logs:error', listener)
    return () => ipcRenderer.removeListener('logs:error', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
