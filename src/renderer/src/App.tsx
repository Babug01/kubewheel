import { useEffect, useState } from 'react'
import TabBar from './components/TabBar'
import Home from './components/Home'
import Catalog from './components/Catalog'
import ClusterWorkspace from './components/ClusterWorkspace'
import PreferencesPanel from './components/PreferencesPanel'
import { applyStoredAccent } from './components/ColorPicker'

const OPEN_TABS_KEY = 'kll-open-tabs'

function loadOpenTabs(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export default function App(): React.JSX.Element {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('kll-dark') === '1')
  const [tabs, setTabs] = useState<string[]>(() => loadOpenTabs())
  const [activeTab, setActiveTab] = useState<string | null>(() => loadOpenTabs()[0] ?? null)
  const [screen, setScreen] = useState<'home' | 'catalog'>(() => (loadOpenTabs().length === 0 ? 'home' : 'catalog'))
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [catalogKey, setCatalogKey] = useState(0)
  const [openError, setOpenError] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState(true)

  useEffect(() => {
    window.api.getReadOnlyMode().then((res) => {
      if (res.ok) setReadOnly(res.data)
    })
  }, [])

  const setUnlocked = async (unlocked: boolean): Promise<void> => {
    const res = await window.api.setReadOnlyMode(!unlocked)
    if (res.ok) setReadOnly(!unlocked)
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kll-dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    applyStoredAccent()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs))
    } catch {
      // best-effort; losing the remembered tab set on a private/blocked-storage window is fine
    }
  }, [tabs])

  const openTab = async (contextName: string, kubeconfigPath: string): Promise<void> => {
    const res = await window.api.openContext(contextName, kubeconfigPath)
    if (!res.ok) {
      setOpenError(res.error)
      return
    }
    setOpenError(null)
    setTabs((prev) => (prev.includes(contextName) ? prev : [...prev, contextName]))
    setActiveTab(contextName)
  }

  const closeTab = (contextName: string): void => {
    setTabs((prev) => prev.filter((t) => t !== contextName))
    setActiveTab((current) => {
      if (current !== contextName) return current
      const remaining = tabs.filter((t) => t !== contextName)
      return remaining[remaining.length - 1] ?? null
    })
  }

  const goHome = (): void => {
    setActiveTab(null)
    setScreen('home')
  }

  const browseCatalog = (): void => {
    setActiveTab(null)
    setScreen('catalog')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        screen={screen}
        onSelect={setActiveTab}
        onOpenTab={openTab}
        onGoHome={goHome}
        onBrowseCatalog={browseCatalog}
        onClose={closeTab}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        readOnly={readOnly}
        onSetUnlocked={setUnlocked}
      />

      {!readOnly && (
        <div className="flex items-center justify-center bg-amber-500 px-4 py-1 text-xs font-semibold text-amber-950">
          Mutations unlocked -- edits, deletes, scaling, and restarts on this cluster will take effect immediately.
        </div>
      )}

      {openError && (
        <div className="flex items-center justify-between bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          <span>Could not open cluster: {openError}</span>
          <button onClick={() => setOpenError(null)} className="ml-3 shrink-0 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {activeTab === null ? (
          screen === 'home' ? (
            <Home onBrowseCatalog={browseCatalog} />
          ) : (
            <Catalog key={catalogKey} onOpen={openTab} onOpenPreferences={() => setPreferencesOpen(true)} />
          )
        ) : (
          <ClusterWorkspace key={activeTab} contextName={activeTab} readOnly={readOnly} />
        )}
      </div>

      {preferencesOpen && (
        <PreferencesPanel
          onClose={() => setPreferencesOpen(false)}
          onKubeconfigsChanged={() => setCatalogKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
