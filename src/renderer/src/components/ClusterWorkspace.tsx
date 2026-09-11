import { useEffect, useState } from 'react'
import type { ClusterOverview, ResourceKind, ResourceRow, ResourceTableResult } from '@shared/types'
import Sidebar, { type ViewKind } from './Sidebar'
import Overview from './Overview'
import ResourceView from './ResourceView'
import CustomResources from './CustomResources'
import HelmReleases from './HelmReleases'
import YamlPanel from './YamlPanel'
import SecretPanel from './SecretPanel'
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
  const [secretTarget, setSecretTarget] = useState<{ namespace: string; name: string } | null>(null)

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
    if (view === 'overview' || view === 'customresources' || view === 'helmreleases') return
    setTableLoading(true)
    setTableError(null)
    window.api.listResources(contextName, view, namespace).then((res) => {
      setTableLoading(false)
      if (res.ok) setTable(res.data)
      else setTableError(res.error)
    })
  }, [contextName, view, namespace])

  const [crdBrowserKey, setCrdBrowserKey] = useState(0)

  const onSelectView = (v: ViewKind): void => {
    setView(v)
    setTable(null)
    // Re-clicking "Custom Resources" while already drilled into one CRD's instances should
    // return to the group picker -- force a remount since the view itself isn't changing.
    if (v === 'customresources') setCrdBrowserKey((k) => k + 1)
  }

  const onSelectRow = (kind: ResourceKind, row: ResourceRow): void => {
    // Secrets get their own masked/reveal-per-key panel instead of a plain YAML dump.
    if (kind === 'secrets' && row.namespace) {
      setSecretTarget({ namespace: row.namespace, name: row.name })
      return
    }
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
          <Overview contextName={contextName} overview={overview} loading={overviewLoading} error={overviewError} />
        ) : view === 'customresources' ? (
          <CustomResources key={crdBrowserKey} contextName={contextName} namespaces={namespaces} />
        ) : view === 'helmreleases' ? (
          <HelmReleases contextName={contextName} namespaces={namespaces} />
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

      {secretTarget && (
        <SecretPanel
          contextName={contextName}
          namespace={secretTarget.namespace}
          name={secretTarget.name}
          onClose={() => setSecretTarget(null)}
        />
      )}
    </div>
  )
}
