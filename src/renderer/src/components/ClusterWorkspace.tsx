import { useEffect, useState } from 'react'
import type { ClusterOverview, ResourceKind, ResourceRow, ResourceTableResult } from '@shared/types'
import Sidebar, { type ViewKind } from './Sidebar'
import Overview from './Overview'
import ResourceView from './ResourceView'
import YamlPanel from './YamlPanel'
import LogPanel from './LogPanel'

interface Props {
  contextName: string
}

export default function ClusterWorkspace({ contextName }: Props): React.JSX.Element {
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
    window.api.listNamespaces(contextName).then((res) => {
      if (res.ok) setNamespaces(res.data)
    })
  }, [contextName])

  useEffect(() => {
    if (view !== 'overview') return
    setOverviewLoading(true)
    setOverviewError(null)
    window.api.getOverview(contextName).then((res) => {
      setOverviewLoading(false)
      if (res.ok) setOverview(res.data)
      else setOverviewError(res.error)
    })
  }, [contextName, view])

  useEffect(() => {
    if (view === 'overview') return
    setTableLoading(true)
    setTableError(null)
    window.api.listResources(contextName, view, namespace).then((res) => {
      setTableLoading(false)
      if (res.ok) setTable(res.data)
      else setTableError(res.error)
    })
  }, [contextName, view, namespace])

  const onSelectView = (v: ViewKind): void => {
    setView(v)
    setTable(null)
  }

  const onSelectRow = (kind: ResourceKind, row: ResourceRow): void => {
    setYamlTarget({ kind, namespace: row.namespace, name: row.name })
    setYamlText(null)
    setYamlError(null)
    setYamlLoading(true)
    window.api.getResourceYaml(contextName, kind, row.namespace, row.name).then((res) => {
      setYamlLoading(false)
      if (res.ok) setYamlText(res.data)
      else setYamlError(res.error)
    })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar contextName={contextName} view={view} onSelectView={onSelectView} />

      <div className="flex-1 overflow-hidden">
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
          contextName={contextName}
          namespace={logTarget.namespace}
          pod={logTarget.pod}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  )
}
