import { useEffect, useMemo, useState } from 'react'
import type { ContextInfo } from '@shared/types'
import { loadFavorites, saveFavorites } from '../lib/favorites'
import { loadExtraKubeconfigs, saveExtraKubeconfigs } from '../lib/kubeconfigs'
import { loadHiddenContexts, saveHiddenContexts } from '../lib/hiddenContexts'
import { getCachedVersion, setCachedVersion } from '../lib/clusterVersions'

interface Props {
  onOpen: (contextName: string, kubeconfigPath: string) => void
  onOpenPreferences: () => void
}

// How many clusters to connect to at once just to read their version. Kept low because each
// lookup opens a real connection (auth plugin and all) and a catalog can easily list dozens of
// clusters, several of which may be unreachable (VPN-gated) or slow to auth.
const VERSION_FETCH_CONCURRENCY = 4

export default function Catalog({ onOpen, onOpenPreferences }: Props): React.JSX.Element {
  const [contexts, setContexts] = useState<ContextInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenContexts())
  const [showHidden, setShowHidden] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [versions, setVersions] = useState<Record<string, string | null>>({})

  const reloadContexts = (): void => {
    window.api.listContexts(loadExtraKubeconfigs()).then((res) => {
      if (res.ok) setContexts(res.data)
      else setError(res.error)
    })
  }

  useEffect(() => {
    reloadContexts()
  }, [])

  // Fetch a Kubernetes version badge per card: cached results show instantly, everything else is
  // fetched in the background with a small concurrency cap so we don't open a connection to every
  // cluster in the catalog at once.
  useEffect(() => {
    if (!contexts) return
    let cancelled = false

    const cached: Record<string, string | null> = {}
    for (const c of contexts) {
      const v = getCachedVersion(c.name)
      if (v) cached[c.name] = v
    }
    setVersions((prev) => ({ ...cached, ...prev }))

    const toFetch = contexts.filter((c) => !hidden.has(c.name) && !cached[c.name])
    let index = 0
    async function worker(): Promise<void> {
      while (index < toFetch.length) {
        if (cancelled) return
        const c = toFetch[index++]
        const res = await window.api.getContextVersion(c.name, c.kubeconfigPath)
        if (cancelled) return
        if (res.ok) {
          setCachedVersion(c.name, res.data)
          setVersions((prev) => ({ ...prev, [c.name]: res.data }))
        } else {
          setVersions((prev) => ({ ...prev, [c.name]: null }))
        }
      }
    }
    const workers = Array.from({ length: VERSION_FETCH_CONCURRENCY }, () => worker())
    void Promise.all(workers)

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexts])

  const addCluster = async (): Promise<void> => {
    setAddError(null)
    setAdding(true)
    const res = await window.api.pickKubeconfig()
    setAdding(false)
    if (!res.ok) {
      setAddError(res.error)
      return
    }
    const path = res.data
    if (!path) return
    const existing = loadExtraKubeconfigs()
    if (!existing.includes(path)) {
      saveExtraKubeconfigs([...existing, path])
    }
    reloadContexts()
  }

  const toggleFavorite = (name: string): void => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveFavorites(next)
      return next
    })
  }

  const toggleHidden = (name: string): void => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveHiddenContexts(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!contexts) return []
    const q = search.toLowerCase()
    const visible = showHidden ? contexts : contexts.filter((c) => !hidden.has(c.name))
    const matching = q
      ? visible.filter((c) => c.name.toLowerCase().includes(q) || c.cluster.toLowerCase().includes(q))
      : visible
    return [...matching].sort((a, b) => {
      const fa = favorites.has(a.name) ? 0 : 1
      const fb = favorites.has(b.name) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.name.localeCompare(b.name)
    })
  }, [contexts, search, favorites, hidden, showHidden])

  const hiddenCount = contexts?.filter((c) => hidden.has(c.name)).length ?? 0

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cluster catalog</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by context or cluster..."
          className="ml-auto w-72 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          onClick={addCluster}
          disabled={adding}
          className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-500 disabled:opacity-60"
          title="Add another kubeconfig file to browse its clusters here"
        >
          {adding ? 'Adding...' : '+ Add Cluster'}
        </button>
        <button
          onClick={onOpenPreferences}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Preferences
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {addError && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Could not add kubeconfig file: {addError}
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!error && !contexts && <div className="text-sm text-slate-500">Loading kubeconfig contexts...</div>}
        {!error && contexts && filtered.length === 0 && (
          <div className="text-sm text-slate-500">No contexts match "{search}".</div>
        )}
        {!error && filtered.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {filtered.map((c) => (
              <div
                key={c.name}
                onClick={() => onOpen(c.name, c.kubeconfigPath)}
                className={`group cursor-pointer rounded-lg border p-4 transition hover:border-accent-400 hover:shadow-md dark:hover:border-accent-600 ${
                  hidden.has(c.name)
                    ? 'border-dashed border-slate-300 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-900/50'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={c.name}>
                      {c.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500" title={c.cluster}>
                      {c.cluster}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleHidden(c.name)
                      }}
                      className="rounded px-1.5 py-0.5 text-xs leading-none text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-red-400"
                      title={
                        hidden.has(c.name)
                          ? 'Restore to catalog'
                          : 'Remove from this list (does not touch your kubeconfig file)'
                      }
                    >
                      {hidden.has(c.name) ? 'Restore' : 'Remove'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(c.name)
                      }}
                      className={`text-lg leading-none ${
                        favorites.has(c.name)
                          ? 'text-accent-500'
                          : 'text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-700'
                      }`}
                      title={favorites.has(c.name) ? 'Unfavorite' : 'Favorite'}
                    >
                      {favorites.has(c.name) ? '★' : '☆'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <span className="min-w-0 flex-1 truncate" title={c.user}>
                    {c.user}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {versions[c.name] && (
                      <span
                        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        title="Kubernetes server version"
                      >
                        {versions[c.name]}
                      </span>
                    )}
                    {c.isCurrent && (
                      <span
                        className="rounded bg-accent-50 px-1.5 py-0.5 text-accent-700 dark:bg-accent-900 dark:text-accent-300"
                        title="The current-context in ~/.kube/config"
                      >
                        current context
                      </span>
                    )}
                    {c.kubeconfigPath && (
                      <span
                        className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        title={c.kubeconfigPath}
                      >
                        extra file
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden((s) => !s)}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            {showHidden ? 'Hide removed clusters again' : `Show ${hiddenCount} removed cluster${hiddenCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}
