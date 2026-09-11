import { useEffect, useMemo, useState } from 'react'
import type { ResourceRow, ResourceTableResult } from '@shared/types'
import YamlPanel from './YamlPanel'
import { renderCellValue } from './StatusCell'

interface Props {
  contextName: string
  namespaces: string[]
}

export default function HelmReleases({ contextName, namespaces }: Props): React.JSX.Element {
  const [namespace, setNamespace] = useState('all')
  const [table, setTable] = useState<ResourceTableResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [yamlTarget, setYamlTarget] = useState<ResourceRow | null>(null)
  const [yamlText, setYamlText] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.api.listHelmReleases(contextName, namespace).then((res) => {
      setLoading(false)
      if (res.ok) setTable(res.data)
      else setError(res.error)
    })
  }, [contextName, namespace])

  const rows = useMemo(() => {
    if (!table) return []
    if (!search.trim()) return table.rows
    const q = search.toLowerCase()
    return table.rows.filter((r) => r.name.toLowerCase().includes(q))
  }, [table, search])

  const openYaml = (row: ResourceRow): void => {
    setYamlTarget(row)
    setYamlText(null)
    setYamlError(null)
    setYamlLoading(true)
    window.api.getHelmReleaseYaml(contextName, row.namespace ?? '', row.name).then((res) => {
      setYamlLoading(false)
      if (res.ok) setYamlText(res.data)
      else setYamlError(res.error)
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Helm Releases</h2>
        <select
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="all">All namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name..."
          className="ml-auto w-64 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {table && (
          <span className="text-xs text-slate-400">
            {rows.length} / {table.rows.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-3">
        {loading && <div className="text-sm text-slate-500">Loading...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!loading && !error && table && rows.length === 0 && (
          <div className="text-sm text-slate-500">No Helm releases found.</div>
        )}
        {!loading && !error && table && rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                {namespace === 'all' && <th className="px-3 py-2 font-medium">Namespace</th>}
                {table.columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.namespace ?? ''}/${r.name}`}
                  className="cursor-pointer border-t border-slate-100 hover:bg-accent-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  onClick={() => openYaml(r)}
                >
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  {namespace === 'all' && <td className="px-3 py-2">{r.namespace}</td>}
                  {table.columns.map((c) => (
                    <td key={c.key} className="max-w-[280px] truncate px-3 py-2" title={r.cells[c.key]}>
                      {renderCellValue(c.key, r.cells[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {yamlTarget && (
        <YamlPanel
          title={`${yamlTarget.namespace ? yamlTarget.namespace + '/' : ''}${yamlTarget.name}`}
          yaml={yamlText}
          loading={yamlLoading}
          error={yamlError}
          onClose={() => setYamlTarget(null)}
        />
      )}
    </div>
  )
}

