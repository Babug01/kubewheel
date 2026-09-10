import { useMemo, useState } from 'react'
import type { ResourceKind, ResourceRow, ResourceTableResult } from '@shared/types'
import { RESOURCE_KIND_LABELS } from '@shared/types'

interface Props {
  kind: ResourceKind
  table: ResourceTableResult | null
  loading: boolean
  error: string | null
  namespaces: string[]
  namespace: string
  onNamespaceChange: (ns: string) => void
  onSelectRow: (row: ResourceRow) => void
  onViewLogs?: (row: ResourceRow) => void
}

export default function ResourceView({
  kind,
  table,
  loading,
  error,
  namespaces,
  namespace,
  onNamespaceChange,
  onSelectRow,
  onViewLogs
}: Props): React.JSX.Element {
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    if (!table) return []
    if (!search.trim()) return table.rows
    const q = search.toLowerCase()
    return table.rows.filter((r) => r.name.toLowerCase().includes(q))
  }, [table, search])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {RESOURCE_KIND_LABELS[kind]}
        </h2>
        <select
          value={namespace}
          onChange={(e) => onNamespaceChange(e.target.value)}
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
          <div className="text-sm text-slate-500">No resources found.</div>
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
                {kind === 'pods' && <th className="px-3 py-2 font-medium">Logs</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.namespace ?? ''}/${row.name}`}
                  className="cursor-pointer border-t border-slate-100 hover:bg-accent-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  onClick={() => onSelectRow(row)}
                >
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  {namespace === 'all' && <td className="px-3 py-2">{row.namespace}</td>}
                  {table.columns.map((c) => (
                    <td key={c.key} className="max-w-[280px] truncate px-3 py-2" title={row.cells[c.key]}>
                      {row.cells[c.key]}
                    </td>
                  ))}
                  {kind === 'pods' && (
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewLogs?.(row)
                        }}
                        className="rounded bg-accent-600 px-2 py-0.5 text-xs text-white hover:bg-accent-500"
                      >
                        Logs
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
