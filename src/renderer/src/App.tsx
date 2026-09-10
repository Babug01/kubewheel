import { useEffect, useState } from 'react'
import TabBar from './components/TabBar'
import Catalog from './components/Catalog'
import ClusterWorkspace from './components/ClusterWorkspace'

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kll-dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs))
    } catch {
      // best-effort; losing the remembered tab set on a private/blocked-storage window is fine
    }
  }, [tabs])

  const openTab = (contextName: string): void => {
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onClose={closeTab}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
      />

      <div className="flex flex-1 overflow-hidden">
        {activeTab === null ? (
          <Catalog onOpen={openTab} />
        ) : (
          <ClusterWorkspace key={activeTab} contextName={activeTab} />
        )}
      </div>
    </div>
  )
}
