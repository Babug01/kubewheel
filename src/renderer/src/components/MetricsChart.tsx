import { useEffect, useRef, useState } from 'react'
import Sparkline from './Sparkline'

const POLL_MS = 5000
const HISTORY_LENGTH = 24 // 24 * 5s = last 2 minutes

interface Props {
  contextName: string
}

export default function MetricsChart({ contextName }: Props): React.JSX.Element | null {
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [available, setAvailable] = useState<boolean | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    setCpuHistory([])
    setMemHistory([])
    setAvailable(null)

    const poll = async (): Promise<void> => {
      const res = await window.api.getClusterMetrics(contextName)
      if (cancelledRef.current) return
      if (!res.ok) return
      setAvailable(res.data.available)
      if (res.data.available) {
        setCpuHistory((prev) => [...prev.slice(-(HISTORY_LENGTH - 1)), res.data.cpuPercent])
        setMemHistory((prev) => [...prev.slice(-(HISTORY_LENGTH - 1)), res.data.memPercent])
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
    }
  }, [contextName])

  if (available === false) {
    return (
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Live metrics unavailable -- metrics-server isn't installed on this cluster.
      </div>
    )
  }

  if (available === null) return null

  const latestCpu = cpuHistory[cpuHistory.length - 1]
  const latestMem = memHistory[memHistory.length - 1]

  return (
    <div className="grid grid-cols-2 gap-4">
      <MetricPanel label="Cluster CPU" percent={latestCpu} points={cpuHistory} />
      <MetricPanel label="Cluster Memory" percent={latestMem} points={memHistory} />
    </div>
  )
}

function MetricPanel({
  label,
  percent,
  points
}: {
  label: string
  percent: number | undefined
  points: number[]
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <div className="text-[11px] uppercase text-slate-400">{label}</div>
        <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {percent !== undefined ? `${percent.toFixed(1)}%` : '...'}
        </div>
        <div className="text-[11px] text-slate-400">last 2 min</div>
      </div>
      <div className="text-accent-500">
        <Sparkline points={points} />
      </div>
    </div>
  )
}
