import { useMemo, useState } from 'react'
import type { ResourceKind, ResourceRow, ResourceTableResult } from '@shared/types'
import {
  RESOURCE_KIND_DELETABLE,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_NAMESPACED,
  RESOURCE_KIND_RESTARTABLE,
  RESOURCE_KIND_SCALABLE
} from '@shared/types'
import { renderCellValue } from './StatusCell'

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
  onRefresh: () => void
  readOnly: boolean
  deletingKeys: Set<string>
  onDeleteRow: (row: ResourceRow) => void
  onScaleRow: (row: ResourceRow, replicas: number) => void
  onRestartRow: (row: ResourceRow) => void
}

// "2/3" (ready/desired) -> 3. Falls back to 1 if the Ready column isn't in that shape.
function currentReplicas(row: ResourceRow): number {
  const parsed = Number.parseInt(row.cells.ready?.split('/')[1] ?? '', 10)
  return Number.isFinite(parsed) ? parsed : 1
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
  onViewLogs,
  onRefresh,
  readOnly,
  deletingKeys,
  onDeleteRow,
  onScaleRow,
  onRestartRow
}: Props): React.JSX.Element {
  const [search, setSearch] = useState('')
  const namespaced = RESOURCE_KIND_NAMESPACED[kind]
  const deletable = !readOnly && Boolean(RESOURCE_KIND_DELETABLE[kind])
  const scalable = !readOnly && Boolean(RESOURCE_KIND_SCALABLE[kind])
  const restartable = !readOnly && Boolean(RESOURCE_KIND_RESTARTABLE[kind])
  const showActionsColumn = kind === 'pods' || deletable || scalable || restartable

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
        <button
          onClick={onRefresh}
          title="Refresh"
          className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          &#8635;
        </button>
        {namespaced && (
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
        )}
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
                {namespaced && namespace === 'all' && <th className="px-3 py-2 font-medium">Namespace</th>}
                {table.columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                {showActionsColumn && <th className="px-3 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.namespace ?? ''}/${row.name}`
                const deleting = deletingKeys.has(key)
                return (
                  <tr
                    key={key}
                    onClick={() => !deleting && onSelectRow(row)}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      deleting
                        ? 'opacity-40'
                        : 'cursor-pointer hover:bg-accent-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    {namespaced && namespace === 'all' && <td className="px-3 py-2">{row.namespace}</td>}
                    {table.columns.map((c) => (
                      <td key={c.key} className="max-w-[280px] truncate px-3 py-2" title={row.cells[c.key]}>
                        {renderCellValue(c.key, row.cells[c.key])}
                      </td>
                    ))}
                    {showActionsColumn && (
                      <td className="px-3 py-2">
                        {deleting ? (
                          <span className="text-xs text-slate-400">Deleting...</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {kind === 'pods' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onViewLogs?.(row)
                                }}
                                className="rounded bg-accent-600 px-2 py-0.5 text-xs text-white hover:bg-accent-500"
                              >
                                Logs
                              </button>
                            )}
                            {restartable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRestartRow(row)
                                }}
                                title="Rollout restart"
                                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Restart
                              </button>
                            )}
                            {scalable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const input = window.prompt(
                                    `New replica count for ${row.name}:`,
                                    String(currentReplicas(row))
                                  )
                                  if (input === null) return
                                  const replicas = Number.parseInt(input, 10)
                                  if (Number.isFinite(replicas) && replicas >= 0) onScaleRow(row, replicas)
                                  else window.alert('Enter a non-negative whole number.')
                                }}
                                title="Scale"
                                className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Scale
                              </button>
                            )}
                            {deletable && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (window.confirm(`Delete ${RESOURCE_KIND_LABELS[kind]} "${row.name}"?`)) {
                                    onDeleteRow(row)
                                  }
                                }}
                                title="Delete"
                                className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
