import { useEffect, useState } from 'react'
import type {
  ClusterOverview,
  ContextInfo,
  ResourceKind,
  ResourceRow,
  ResourceTableResult
} from '@shared/types'
import Sidebar, { type ViewKind } from './components/Sidebar'
import Overview from './components/Overview'
import ResourceView from './components/ResourceView'
import YamlPanel from './components/YamlPanel'
import LogPanel from './components/LogPanel'

export default function App(): React.JSX.Element {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('kll-dark') === '1')

  const [contexts, setContexts] = useState<ContextInfo[]>([])
  const [currentContext, setCurrentContext] = useState<string | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)

  const [view, setView] = useState<ViewKind>('overview')
  const [namespace, setNamespace] = useState('all')
  const [namespaces, setNamespaces] = useState<string[]>([])

  const [overview, setOverview] = useState<ClusterOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const [table, setTable] = useState<ResourceTableResult | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  const [yamlTarget, setYamlTarget] = useState<{ kind: ResourceKind; namespace?: string; name: string } | null>(
    null
  )
  const [yamlText, setYamlText] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const [logTarget, setLogTarget] = useState<{ namespace: string; pod: string } | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kll-dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    window.api.listContexts().then((res) => {
      if (res.ok) {
        setContexts(res.data)
        const current = res.data.find((c) => c.isCurrent) ?? res.data[0]
        setCurrentContext(current?.name ?? null)
      } else {
        setContextError(res.error)
      }
    })
  }, [])

  useEffect(() => {
    if (!currentContext) return
    setNamespace('all')
    window.api.listNamespaces().then((res) => {
      if (res.ok) setNamespaces(res.data)
    })
  }, [currentContext])

  useEffect(() => {
    if (!currentContext || view !== 'overview') return
    setOverviewLoading(true)
    setOverviewError(null)
    window.api.getOverview().then((res) => {
      setOverviewLoading(false)
      if (res.ok) setOverview(res.data)
      else setOverviewError(res.error)
    })
  }, [currentContext, view])

  useEffect(() => {
    if (!currentContext || view === 'overview') return
    setTableLoading(true)
    setTableError(null)
    window.api.listResources(view, namespace).then((res) => {
      setTableLoading(false)
      if (res.ok) setTable(res.data)
      else setTableError(res.error)
    })
  }, [currentContext, view, namespace])

  const onSwitchContext = async (name: string): Promise<void> => {
    setContextError(null)
    const res = await window.api.setContext(name)
    if (res.ok) {
      setCurrentContext(name)
      setContexts((prev) => prev.map((c) => ({ ...c, isCurrent: c.name === name })))
      setOverview(null)
      setTable(null)
    } else {
      setContextError(res.error)
    }
  }

  const onSelectView = (v: ViewKind): void => {
    setView(v)
    setTable(null)
  }

  const onSelectRow = (kind: ResourceKind, row: ResourceRow): void => {
    setYamlTarget({ kind, namespace: row.namespace, name: row.name })
    setYamlText(null)
    setYamlError(null)
    setYamlLoading(true)
    window.api.getResourceYaml(kind, row.namespace, row.name).then((res) => {
      setYamlLoading(false)
      if (res.ok) setYamlText(res.data)
      else setYamlError(res.error)
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar
        contexts={contexts}
        currentContext={currentContext}
        onSwitchContext={onSwitchContext}
        view={view}
        onSelectView={onSelectView}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
      />

      <div className="flex-1 overflow-hidden">
        {contextError && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {contextError}
          </div>
        )}

        {view === 'overview' ? (
          <Overview overview={overview} loading={overviewLoading} error={overviewError} />
        ) : (
          <ResourceView
            kind={view}
            table={table}
            loading={tableLoading}
            error={tableError}
            namespaces={namespaces}
            namespace={namespace}
            onNamespaceChange={setNamespace}
            onSelectRow={(row) => onSelectRow(view, row)}
            onViewLogs={(row) =>
              row.namespace && setLogTarget({ namespace: row.namespace, pod: row.name })
            }
          />
        )}
      </div>

      {yamlTarget && (
        <YamlPanel
          title={`${yamlTarget.kind}/${yamlTarget.namespace ? yamlTarget.namespace + '/' : ''}${yamlTarget.name}`}
          yaml={yamlText}
          loading={yamlLoading}
          error={yamlError}
          onClose={() => setYamlTarget(null)}
        />
      )}

      {logTarget && (
        <LogPanel
          namespace={logTarget.namespace}
          pod={logTarget.pod}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  )
}
