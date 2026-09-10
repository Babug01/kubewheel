import { useEffect, useMemo, useState } from 'react'
import type { ContextInfo } from '@shared/types'

const FAVORITES_KEY = 'kll-favorite-contexts'

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
  } catch {
    // best-effort; a private window or blocked storage just means favorites don't persist
  }
}

interface Props {
  onOpen: (contextName: string) => void
}

export default function Catalog({ onOpen }: Props): React.JSX.Element {
  const [contexts, setContexts] = useState<ContextInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())

  useEffect(() => {
    window.api.listContexts().then((res) => {
      if (res.ok) setContexts(res.data)
      else setError(res.error)
    })
  }, [])

  const toggleFavorite = (name: string): void => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveFavorites(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!contexts) return []
    const q = search.toLowerCase()
    const matching = q
      ? contexts.filter(
          (c) => c.name.toLowerCase().includes(q) || c.cluster.toLowerCase().includes(q)
        )
      : contexts
    return [...matching].sort((a, b) => {
      const fa = favorites.has(a.name) ? 0 : 1
      const fb = favorites.has(b.name) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.name.localeCompare(b.name)
    })
  }, [contexts, search, favorites])

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
      </div>

      <div className="flex-1 overflow-auto p-6">
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
                onClick={() => onOpen(c.name)}
                className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition hover:border-accent-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-600"
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(c.name)
                    }}
                    className={`shrink-0 text-lg leading-none ${
                      favorites.has(c.name)
                        ? 'text-accent-500'
                        : 'text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-700'
                    }`}
                    title={favorites.has(c.name) ? 'Unfavorite' : 'Favorite'}
                  >
                    {favorites.has(c.name) ? '★' : '☆'}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate" title={c.user}>
                    {c.user}
                  </span>
                  {c.isCurrent && (
                    <span className="rounded bg-accent-50 px-1.5 py-0.5 text-accent-700 dark:bg-accent-900 dark:text-accent-300">
                      kubectl default
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
