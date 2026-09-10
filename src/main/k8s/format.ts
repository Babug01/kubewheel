export function formatAge(timestamp?: Date | string): string {
  if (!timestamp) return '-'
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return '-'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 365) return `${days}d`
  const years = Math.floor(days / 365)
  return `${years}y`
}

// Kubernetes memory quantities: Ki/Mi/Gi/Ti (binary) or k/M/G/T (decimal), or a bare byte count.
export function formatMemory(qty?: string): string {
  if (!qty) return '-'
  const match = qty.match(/^(\d+(?:\.\d+)?)([EPTGMK]i?)?$/)
  if (!match) return qty
  const value = parseFloat(match[1])
  const unit = match[2] ?? ''
  const binary: Record<string, number> = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 }
  const decimal: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, T: 1e12 }
  const bytes = value * (binary[unit] ?? decimal[unit] ?? 1)
  const gib = bytes / 1024 ** 3
  if (gib >= 1) return `${gib.toFixed(1)}Gi`
  const mib = bytes / 1024 ** 2
  return `${mib.toFixed(0)}Mi`
}

// Kubernetes CPU quantities: bare cores ("2"), millicores ("500m"), or fractional cores ("0.5").
export function formatCpu(qty?: string): string {
  if (!qty) return '-'
  if (qty.endsWith('m')) return qty
  const cores = parseFloat(qty)
  if (Number.isNaN(cores)) return qty
  return `${cores}`
}

export function nodeRoles(labels?: Record<string, string>): string {
  if (!labels) return 'worker'
  const roles = Object.keys(labels)
    .filter((k) => k.startsWith('node-role.kubernetes.io/'))
    .map((k) => k.replace('node-role.kubernetes.io/', ''))
    .filter(Boolean)
  return roles.length > 0 ? roles.join(',') : 'worker'
}

export function nodeReadyStatus(conditions?: { type?: string; status?: string }[]): string {
  const ready = conditions?.find((c) => c.type === 'Ready')
  if (!ready) return 'Unknown'
  return ready.status === 'True' ? 'Ready' : 'NotReady'
}

export function podStatusPhase(pod: {
  status?: {
    phase?: string
    containerStatuses?: { state?: { waiting?: { reason?: string } } }[]
  }
  metadata?: { deletionTimestamp?: Date | string }
}): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating'
  const waitingReason = pod.status?.containerStatuses?.find((c) => c.state?.waiting)?.state?.waiting
    ?.reason
  if (waitingReason) return waitingReason
  return pod.status?.phase ?? 'Unknown'
}

export function podReadyCount(
  statuses?: { ready?: boolean }[]
): string {
  if (!statuses || statuses.length === 0) return '0/0'
  const ready = statuses.filter((s) => s.ready).length
  return `${ready}/${statuses.length}`
}

export function podRestartCount(statuses?: { restartCount?: number }[]): string {
  if (!statuses || statuses.length === 0) return '0'
  return String(statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0))
}
