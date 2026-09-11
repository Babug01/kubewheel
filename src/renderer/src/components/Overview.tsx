import type { ClusterOverview } from '@shared/types'
import MetricsChart from './MetricsChart'

interface Props {
  contextName: string
  overview: ClusterOverview | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function Overview({ contextName, overview, loading, error, onRefresh }: Props): React.JSX.Element {
  if (loading) return <div className="p-6 text-sm text-slate-500">Loading cluster overview...</div>
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>
  if (!overview) return <div className="p-6 text-sm text-slate-500">No data.</div>

  return (
    <div className="overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onRefresh}
          title="Refresh"
          className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          &#8635;
        </button>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-4">
        <StatCard label="Context" value={overview.contextName} />
        <StatCard label="Kubernetes version" value={overview.version} />
        <StatCard label="Namespaces" value={String(overview.namespaceCount)} />
        <StatCard label="Pods" value={String(overview.podCount)} />
      </div>

      <div className="mb-6">
        <MetricsChart contextName={contextName} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        Nodes ({overview.nodes.length})
      </h2>
      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {['Name', 'Status', 'Roles', 'Version', 'Internal IP', 'CPU', 'CPU Usage', 'Memory', 'Mem Usage', 'OS', 'Age'].map(
                (h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {overview.nodes.map((n) => (
              <tr key={n.name} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium">{n.name}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      n.status === 'Ready'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}
                  >
                    {n.status}
                  </span>
                </td>
                <td className="px-3 py-2">{n.roles}</td>
                <td className="px-3 py-2">{n.version}</td>
                <td className="px-3 py-2">{n.internalIP}</td>
                <td className="px-3 py-2">{n.cpu}</td>
                <td className="px-3 py-2">
                  <UsageBar percent={n.cpuUsagePercent} />
                </td>
                <td className="px-3 py-2">{n.memory}</td>
                <td className="px-3 py-2">
                  <UsageBar percent={n.memUsagePercent} />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2" title={n.os}>
                  {n.os}
                </td>
                <td className="px-3 py-2">{n.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UsageBar({ percent }: { percent: number | null }): React.JSX.Element {
  if (percent === null) return <span className="text-slate-400">-</span>
  const clamped = Math.min(100, Math.max(0, percent))
  const color = clamped >= 90 ? 'bg-red-500' : clamped >= 75 ? 'bg-amber-500' : 'bg-accent-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-10 text-xs text-slate-500 dark:text-slate-400">{percent.toFixed(0)}%</span>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] uppercase text-slate-400">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-800 dark:text-slate-100" title={value}>
        {value}
      </div>
    </div>
  )
}
