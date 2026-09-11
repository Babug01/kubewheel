import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { KubeManager, listKubeContexts } from './k8s/client'
import type { LogStreamRequest, Result, ResourceKind } from '../shared/types'

let mainWindow: BrowserWindow | null = null
// One KubeManager per open cluster tab, keyed by context name, so several clusters can be
// connected to at once without a context switch on one tab affecting another. Contexts from the
// default kubeconfig work with no setup; contexts from an extra file must be registered via
// openContext first (renderer does this automatically when opening a tab) so the manager knows
// which file to load from.
const kubeManagers = new Map<string, KubeManager>()

function getKube(contextName: string): KubeManager {
  let manager = kubeManagers.get(contextName)
  if (!manager) {
    manager = new KubeManager(contextName)
    kubeManagers.set(contextName, manager)
  }
  return manager
}

async function withResult<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('k8s:listContexts', (_e, extraPaths: string[]) =>
    withResult(() => listKubeContexts(extraPaths))
  )

  // Registers (or re-registers) the manager for a context before any other k8s:* call touches
  // it, so contexts from an extra kubeconfig file connect through the right file.
  ipcMain.handle('k8s:openContext', (_e, contextName: string, kubeconfigPath: string) =>
    withResult(() => {
      kubeManagers.get(contextName)?.stopAllLogs()
      kubeManagers.set(contextName, new KubeManager(contextName, kubeconfigPath || undefined))
    })
  )

  ipcMain.handle('dialog:pickKubeconfig', async () => {
    if (!mainWindow) return { ok: true, data: null }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add kubeconfig file',
      properties: ['openFile'],
      filters: [
        { name: 'kubeconfig', extensions: ['yaml', 'yml', 'config', ''] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return { ok: true, data: result.canceled ? null : (result.filePaths[0] ?? null) }
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('k8s:getOverview', (_e, contextName: string) =>
    withResult(() => getKube(contextName).getOverview())
  )

  ipcMain.handle('k8s:getClusterMetrics', (_e, contextName: string) =>
    withResult(() => getKube(contextName).getClusterMetrics())
  )

  ipcMain.handle('k8s:listNamespaces', (_e, contextName: string) =>
    withResult(() => getKube(contextName).listNamespaces())
  )

  ipcMain.handle(
    'k8s:listResources',
    (_e, contextName: string, kind: ResourceKind, namespace: string) =>
      withResult(() => getKube(contextName).listResources(kind, namespace as string | 'all'))
  )

  ipcMain.handle(
    'k8s:getResourceYaml',
    (_e, contextName: string, kind: ResourceKind, namespace: string | undefined, name: string) =>
      withResult(() => getKube(contextName).getResourceYaml(kind, namespace, name))
  )

  ipcMain.handle('k8s:listPodContainers', (_e, contextName: string, namespace: string, pod: string) =>
    withResult(() => getKube(contextName).listPodContainers(namespace, pod))
  )

  ipcMain.handle('k8s:getSecretDetail', (_e, contextName: string, namespace: string, name: string) =>
    withResult(() => getKube(contextName).getSecretDetail(namespace, name))
  )

  ipcMain.handle('k8s:listCrds', (_e, contextName: string) => withResult(() => getKube(contextName).listCrds()))

  ipcMain.handle(
    'k8s:listCrdInstances',
    (_e, contextName: string, crdName: string, namespace: string) =>
      withResult(() => getKube(contextName).listCrdInstances(crdName, namespace as string | 'all'))
  )

  ipcMain.handle(
    'k8s:getCrdInstanceYaml',
    (_e, contextName: string, crdName: string, namespace: string | undefined, name: string) =>
      withResult(() => getKube(contextName).getCrdInstanceYaml(crdName, namespace, name))
  )

  ipcMain.handle('k8s:listHelmReleases', (_e, contextName: string, namespace: string) =>
    withResult(() => getKube(contextName).listHelmReleases(namespace as string | 'all'))
  )

  ipcMain.handle('k8s:getHelmReleaseYaml', (_e, contextName: string, namespace: string, name: string) =>
    withResult(() => getKube(contextName).getHelmReleaseYaml(namespace, name))
  )

  ipcMain.handle('logs:start', (event, contextName: string, req: LogStreamRequest) => {
    const sender = event.sender
    return getKube(contextName).streamLogs(
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

  ipcMain.handle('logs:stop', (_e, contextName: string, requestId: string) => {
    getKube(contextName).stopLogs(requestId)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
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
