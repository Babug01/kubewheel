import { useState } from 'react'
import { loadExtraKubeconfigs, saveExtraKubeconfigs } from '../lib/kubeconfigs'
import { loadWebLinks, saveWebLinks, type WebLink } from '../lib/weblinks'

interface Props {
  onClose: () => void
  onKubeconfigsChanged: () => void
}

export default function PreferencesPanel({ onClose, onKubeconfigsChanged }: Props): React.JSX.Element {
  const [extraPaths, setExtraPaths] = useState<string[]>(() => loadExtraKubeconfigs())
  const [links, setLinks] = useState<WebLink[]>(() => loadWebLinks())
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)

  const addKubeconfig = async (): Promise<void> => {
    setPickError(null)
    const res = await window.api.pickKubeconfig()
    if (!res.ok) {
      setPickError(res.error)
      return
    }
    const path = res.data
    if (!path || extraPaths.includes(path)) return
    const next = [...extraPaths, path]
    setExtraPaths(next)
    saveExtraKubeconfigs(next)
    onKubeconfigsChanged()
  }

  const removeKubeconfig = (path: string): void => {
    const next = extraPaths.filter((p) => p !== path)
    setExtraPaths(next)
    saveExtraKubeconfigs(next)
    onKubeconfigsChanged()
  }

  const addLink = (): void => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) return
    const next = [...links, { name: newLinkName.trim(), url: newLinkUrl.trim() }]
    setLinks(next)
    saveWebLinks(next)
    setNewLinkName('')
    setNewLinkUrl('')
  }

  const removeLink = (name: string): void => {
    const next = links.filter((l) => l.name !== name)
    setLinks(next)
    saveWebLinks(next)
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[560px] max-w-full flex-col bg-white shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preferences</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <section className="mb-6">
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              Kubeconfig Files
            </h4>
            <p className="mb-2 text-xs text-slate-400">
              <span className="mono">~/.kube/config</span> is always included. Add more files to browse
              clusters defined elsewhere in the same catalog.
            </p>

            <div className="mb-2 space-y-1">
              {extraPaths.length === 0 && (
                <div className="text-xs text-slate-400">No extra kubeconfig files added.</div>
              )}
              {extraPaths.map((p) => (
                <div
                  key={p}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 dark:border-slate-800"
                >
                  <span className="mono truncate text-xs text-slate-700 dark:text-slate-300" title={p}>
                    {p}
                  </span>
                  <button
                    onClick={() => removeKubeconfig(p)}
                    className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {pickError && <div className="mb-2 text-xs text-red-600">{pickError}</div>}
            <button
              onClick={addKubeconfig}
              className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              + Add kubeconfig file
            </button>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Web Links</h4>
            <p className="mb-2 text-xs text-slate-400">
              Quick shortcuts to things like Grafana, ArgoCD, or internal docs — opened in your default
              browser.
            </p>

            <div className="mb-2 space-y-1">
              {links.length === 0 && <div className="text-xs text-slate-400">No web links added.</div>}
              {links.map((l) => (
                <div
                  key={l.name}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 dark:border-slate-800"
                >
                  <button
                    onClick={() => window.api.openExternal(l.url)}
                    className="truncate text-left text-sm text-accent-600 hover:underline dark:text-accent-400"
                    title={l.url}
                  >
                    {l.name}
                  </button>
                  <button
                    onClick={() => removeLink(l.name)}
                    className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="Name"
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                onClick={addLink}
                className="shrink-0 rounded bg-accent-600 px-3 py-1.5 text-xs text-white hover:bg-accent-500"
              >
                Add
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
