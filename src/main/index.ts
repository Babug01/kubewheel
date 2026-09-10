import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { KubeManager } from './k8s/client'
import type { LogStreamRequest, Result, ResourceKind } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let kube: KubeManager | null = null

function getKube(): KubeManager {
  if (!kube) kube = new KubeManager()
  return kube
}

async function withResult<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('k8s:listContexts', () => withResult(() => getKube().listContexts()))

  ipcMain.handle('k8s:setContext', (_e, name: string) =>
    withResult(() => {
      getKube().setContext(name)
    })
  )

  ipcMain.handle('k8s:getOverview', () => withResult(() => getKube().getOverview()))

  ipcMain.handle('k8s:listNamespaces', () => withResult(() => getKube().listNamespaces()))

  ipcMain.handle('k8s:listResources', (_e, kind: ResourceKind, namespace: string) =>
    withResult(() => getKube().listResources(kind, namespace as string | 'all'))
  )

  ipcMain.handle(
    'k8s:getResourceYaml',
    (_e, kind: ResourceKind, namespace: string | undefined, name: string) =>
      withResult(() => getKube().getResourceYaml(kind, namespace, name))
  )

  ipcMain.handle('k8s:listPodContainers', (_e, namespace: string, pod: string) =>
    withResult(() => getKube().listPodContainers(namespace, pod))
  )

  ipcMain.handle('logs:start', (event, req: LogStreamRequest) => {
    const sender = event.sender
    return getKube().streamLogs(
      req.requestId,
      req.namespace,
      req.pod,
      req.container,
      req.follow,
      req.tailLines,
      (chunk) => sender.send('logs:data', { requestId: req.requestId, chunk }),
      () => sender.send('logs:end', { requestId: req.requestId }),
      (message) => sender.send('logs:error', { requestId: req.requestId, message })
    )
  })

  ipcMain.handle('logs:stop', (_e, requestId: string) => {
    getKube().stopLogs(requestId)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
