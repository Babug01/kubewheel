import ColorPicker from './ColorPicker'
import CatalogMenu from './CatalogMenu'

interface Props {
  tabs: string[]
  activeTab: string | null
  screen: 'home' | 'catalog'
  onSelect: (contextName: string) => void
  onOpenTab: (contextName: string, kubeconfigPath: string) => void
  onGoHome: () => void
  onBrowseCatalog: () => void
  onClose: (contextName: string) => void
  dark: boolean
  onToggleDark: () => void
}

export default function TabBar({
  tabs,
  activeTab,
  screen,
  onSelect,
  onOpenTab,
  onGoHome,
  onBrowseCatalog,
  onClose,
  dark,
  onToggleDark
}: Props): React.JSX.Element {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-slate-200 bg-slate-50 pl-1 dark:border-slate-800 dark:bg-slate-950">
      <button
        onClick={onGoHome}
        className="mr-2 flex items-center gap-1.5 rounded pl-2 pr-3 text-sm font-bold tracking-tight text-accent-600 hover:bg-slate-200 dark:text-accent-400 dark:hover:bg-slate-800"
        title="Go to home"
      >
        <span aria-hidden className="text-base leading-none">
          &#9784;
        </span>
        <span>Kubewheel</span>
      </button>

      <CatalogMenu
        onOpen={onOpenTab}
        onBrowseAll={onBrowseCatalog}
        isOnCatalogPage={activeTab === null && screen === 'catalog'}
      />

      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t}
            onClick={() => onSelect(t)}
            className={`flex h-8 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded px-3 text-sm ${
              activeTab === t
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
            title={t}
          >
            <span className="truncate">{t}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(t)
              }}
              className="shrink-0 rounded px-1 text-xs text-slate-400 hover:bg-slate-300 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mr-2">
        <ColorPicker />
      </div>

      <button
        onClick={onToggleDark}
        className="mr-3 shrink-0 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        title="Toggle theme"
      >
        {dark ? 'Light' : 'Dark'}
      </button>
    </div>
  )
}
