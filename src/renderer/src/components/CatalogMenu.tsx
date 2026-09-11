import { useEffect, useState } from 'react'
import type { ContextInfo } from '@shared/types'
import { loadFavorites } from '../lib/favorites'

interface Props {
  onOpen: (contextName: string) => void
  onBrowseAll: () => void
  isOnCatalogPage: boolean
}

export default function CatalogMenu({ onOpen, onBrowseAll, isOnCatalogPage }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [contexts, setContexts] = useState<ContextInfo[] | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('[data-catalog-menu]')) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const toggle = (): void => {
    setOpen((o) => !o)
    if (!contexts) {
      window.api.listContexts().then((res) => {
        if (res.ok) setContexts(res.data)
      })
    }
  }

  const favorites = loadFavorites()
  const favoriteContexts = (contexts ?? []).filter((c) => favorites.has(c.name))

  return (
    <div className="relative" data-catalog-menu>
      <button
        onClick={toggle}
        className={`mr-1 flex h-8 items-center gap-1 rounded px-3 text-sm font-medium ${
          open || isOnCatalogPage
            ? 'bg-accent-600 text-white'
            : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Cluster catalog"
      >
        Catalog
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Favorite clusters
          </div>
          {!contexts && <div className="px-2 py-2 text-sm text-slate-500">Loading...</div>}
          {contexts && favoriteContexts.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-400">
              No favorites yet — star a cluster in the catalog to pin it here.
            </div>
          )}
          {favoriteContexts.map((c) => (
            <button
              key={c.name}
              onClick={() => {
                setOpen(false)
                onOpen(c.name)
              }}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              title={c.name}
            >
              <span className="mr-1.5 text-accent-500">&#9733;</span>
              {c.name}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-800">
            <button
              onClick={() => {
                setOpen(false)
                onBrowseAll()
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-accent-600 hover:bg-slate-100 dark:text-accent-400 dark:hover:bg-slate-800"
            >
              Browse all clusters &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
