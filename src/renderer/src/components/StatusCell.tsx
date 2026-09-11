const BAD = new Set([
  'crashloopbackoff',
  'error',
  'failed',
  'errimagepull',
  'imagepullbackoff',
  'oomkilled',
  'unknown',
  'notready',
  'invalidimagename',
  'createcontainerconfigerror',
  'evicted',
  'false'
])
const WARN = new Set(['pending', 'terminating', 'containercreating', 'podinitializing', 'progressing', 'degraded'])
const GOOD = new Set(['running', 'succeeded', 'complete', 'active', 'bound', 'deployed', 'ready', 'true'])

// Shared health-coloring for any "status"-like cell -- covers Pod phases, Job/Helm/Namespace
// status strings, and CRD printer columns like cert-manager's Ready/Status (case-insensitive
// since CRD-provided column names come capitalized while our own are lowercase keys).
export function StatusValue({ value }: { value: string }): React.JSX.Element {
  const norm = value.toLowerCase()
  let cls: string | null = null
  if (BAD.has(norm)) cls = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
  else if (WARN.has(norm)) cls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
  else if (GOOD.has(norm)) cls = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
  if (!cls) return <>{value}</>
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{value}</span>
}

// "x/y" ready-count cells -- only flagged when not fully ready, so a healthy "2/2" stays plain
// text instead of adding a green badge to every single row.
export function ReadyValue({ value }: { value: string }): React.JSX.Element {
  const match = value.match(/^(\d+)\/(\d+)$/)
  if (!match) return <>{value}</>
  const current = Number(match[1])
  const total = Number(match[2])
  if (total === 0 || current >= total) return <>{value}</>
  const cls = current === 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'font-semibold text-amber-600 dark:text-amber-400'
  return <span className={cls}>{value}</span>
}

export function renderCellValue(key: string, value: string): React.JSX.Element {
  const k = key.toLowerCase()
  if (k === 'status') return <StatusValue value={value} />
  if (k === 'ready') return <ReadyValue value={value} />
  return <>{value}</>
}
