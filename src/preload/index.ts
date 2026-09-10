import { contextBridge, ipcRenderer } from 'electron'
import type {
  ClusterOverview,
  ContextInfo,
  LogStreamRequest,
  ResourceKind,
  ResourceTableResult,
  Result
} from '../shared/types'

const api = {
  listContexts: (): Promise<Result<ContextInfo[]>> => ipcRenderer.invoke('k8s:listContexts'),
  setContext: (name: string): Promise<Result<void>> => ipcRenderer.invoke('k8s:setContext', name),
  getOverview: (): Promise<Result<ClusterOverview>> => ipcRenderer.invoke('k8s:getOverview'),
  listNamespaces: (): Promise<Result<string[]>> => ipcRenderer.invoke('k8s:listNamespaces'),
  listResources: (kind: ResourceKind, namespace: string): Promise<Result<ResourceTableResult>> =>
    ipcRenderer.invoke('k8s:listResources', kind, namespace),
  getResourceYaml: (
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<Result<string>> => ipcRenderer.invoke('k8s:getResourceYaml', kind, namespace, name),
  listPodContainers: (namespace: string, pod: string): Promise<Result<string[]>> =>
    ipcRenderer.invoke('k8s:listPodContainers', namespace, pod),

  startLogStream: (req: LogStreamRequest): Promise<void> => ipcRenderer.invoke('logs:start', req),
  stopLogStream: (requestId: string): Promise<void> => ipcRenderer.invoke('logs:stop', requestId),
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
