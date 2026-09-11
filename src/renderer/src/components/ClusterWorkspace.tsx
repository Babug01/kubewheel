import { useEffect, useState } from 'react'
import type { ClusterOverview, ResourceKind, ResourceRow, ResourceTableResult } from '@shared/types'
import { RESOURCE_KIND_EDITABLE } from '@shared/types'
import Sidebar, { type ViewKind } from './Sidebar'
import Overview from './Overview'
import ResourceView from './ResourceView'
import CustomResources from './CustomResources'
import HelmReleases from './HelmReleases'
import YamlPanel from './YamlPanel'
import SecretPanel from './SecretPanel'
import LogPanel from './LogPanel'

const RESOURCE_KIND_EDITABLE_SET = new Set(Object.keys(RESOURCE_KIND_EDITABLE) as ResourceKind[])

interface Props {
  contextName: string
  readOnly: boolean
}

export default function ClusterWorkspace({ contextName, readOnly }: Props): React.JSX.Element {
  const [view, setView] = useState<ViewKind>('overview')
  const [namespace, setNamespace] = useState('all')
  const [namespaces, setNamespaces] = useState<string[]>([])

  const [overview, setOverview] = useState<ClusterOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0)

  const [table, setTable] = useState<ResourceTableResult | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)
  const [tableRefreshKey, setTableRefreshKey] = useState(0)

  const [yamlTarget, setYamlTarget] = useState<{ kind: ResourceKind; namespace?: string; name: string } | null>(
    null
  )
  const [yamlText, setYamlText] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const [logTarget, setLogTarget] = useState<{ namespace: string; pod: string } | null>(null)
  const [secretTarget, setSecretTarget] = useState<{ namespace: string; name: string } | null>(null)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

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
  }, [contextName, view, overviewRefreshKey])

  const loadTable = (): void => {
    if (view === 'overview' || view === 'customresources' || view === 'helmreleases') return
    setTableLoading(true)
    setTableError(null)
    window.api.listResources(contextName, view, namespace).then((res) => {
      setTableLoading(false)
      if (res.ok) setTable(res.data)
      else setTableError(res.error)
    })
  }

  useEffect(loadTable, [contextName, view, namespace, tableRefreshKey])

  const [crdBrowserKey, setCrdBrowserKey] = useState(0)

  const onSelectView = (v: ViewKind): void => {
    setView(v)
    setTable(null)
    // Re-clicking "Custom Resources" while already drilled into one CRD's instances should
    // return to the group picker -- force a remount since the view itself isn't changing.
    if (v === 'customresources') setCrdBrowserKey((k) => k + 1)
  }

  const loadYaml = (kind: ResourceKind, ns: string | undefined, name: string): void => {
    setYamlLoading(true)
    setYamlError(null)
    window.api.getResourceYaml(contextName, kind, ns, name).then((res) => {
      setYamlLoading(false)
      if (res.ok) setYamlText(res.data)
      else setYamlError(res.error)
    })
  }

  const onSelectRow = (kind: ResourceKind, row: ResourceRow): void => {
    // Secrets get their own masked/reveal-per-key panel instead of a plain YAML dump.
    if (kind === 'secrets' && row.namespace) {
      setSecretTarget({ namespace: row.namespace, name: row.name })
      return
    }
    setYamlTarget({ kind, namespace: row.namespace, name: row.name })
    setYamlText(null)
    loadYaml(kind, row.namespace, row.name)
  }

  const onApplyYaml = async (newYaml: string): Promise<{ ok: boolean; error?: string }> => {
    if (!yamlTarget) return { ok: false, error: 'No resource selected' }
    const res = await window.api.applyResourceYaml(
      contextName,
      yamlTarget.kind,
      yamlTarget.namespace,
      yamlTarget.name,
      newYaml
    )
    if (res.ok) {
      // Re-fetch rather than trusting the edited text -- the server may add defaults, and the
      // resourceVersion has to advance before another edit will be accepted.
      loadYaml(yamlTarget.kind, yamlTarget.namespace, yamlTarget.name)
      setTableRefreshKey((k) => k + 1)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  const rowKey = (row: ResourceRow): string => `${row.namespace ?? ''}/${row.name}`

  const onDeleteRow = async (kind: ResourceKind, row: ResourceRow): Promise<void> => {
    const key = rowKey(row)
    setDeletingKeys((prev) => new Set(prev).add(key))
    const res = await window.api.deleteResource(contextName, kind, row.namespace, row.name)
    setDeletingKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    if (res.ok) setTableRefreshKey((k) => k + 1)
    else window.alert(`Could not delete ${row.name}: ${res.error}`)
  }

  const onScaleRow = async (kind: ResourceKind, row: ResourceRow, replicas: number): Promise<void> => {
    if (!row.namespace) return
    const res = await window.api.scaleResource(contextName, kind, row.namespace, row.name, replicas)
    if (res.ok) setTableRefreshKey((k) => k + 1)
    else window.alert(`Could not scale ${row.name}: ${res.error}`)
  }

  const onRestartRow = async (kind: ResourceKind, row: ResourceRow): Promise<void> => {
    if (!row.namespace) return
    const res = await window.api.restartResource(contextName, kind, row.namespace, row.name)
    if (res.ok) setTableRefreshKey((k) => k + 1)
    else window.alert(`Could not restart ${row.name}: ${res.error}`)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar contextName={contextName} view={view} onSelectView={onSelectView} readOnly={readOnly} />

      <div className="flex-1 overflow-hidden">
        {view === 'overview' ? (
          <Overview
            contextName={contextName}
            overview={overview}
            loading={overviewLoading}
            error={overviewError}
            onRefresh={() => setOverviewRefreshKey((k) => k + 1)}
          />
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
            onRefresh={() => setTableRefreshKey((k) => k + 1)}
            readOnly={readOnly}
            deletingKeys={deletingKeys}
            onDeleteRow={(row) => onDeleteRow(view, row)}
            onScaleRow={(row, replicas) => onScaleRow(view, row, replicas)}
            onRestartRow={(row) => onRestartRow(view, row)}
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
          editable={readOnly ? false : Boolean(yamlTarget && RESOURCE_KIND_EDITABLE_SET.has(yamlTarget.kind))}
          onApply={onApplyYaml}
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
