import { useEffect, useRef, useState } from 'react'

interface Props {
  namespace: string
  pod: string
  onClose: () => void
}

export default function LogPanel({ namespace, pod, onClose }: Props): React.JSX.Element {
  const [containers, setContainers] = useState<string[]>([])
  const [container, setContainer] = useState<string>('')
  const [follow, setFollow] = useState(true)
  const [tailLines, setTailLines] = useState(200)
  const [lines, setLines] = useState('')
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef<string>('')
  const logBoxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.listPodContainers(namespace, pod).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setContainers(res.data)
        setContainer(res.data[0] ?? '')
      } else {
        setError(res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [namespace, pod])

  useEffect(() => {
    if (!container) return

    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    setLines('')
    setError(null)

    const offData = window.api.onLogData(({ requestId: id, chunk }) => {
      if (id !== requestId) return
      setLines((prev) => prev + chunk)
    })
    const offEnd = window.api.onLogEnd(({ requestId: id }) => {
      if (id !== requestId) return
    })
    const offError = window.api.onLogError(({ requestId: id, message }) => {
      if (id !== requestId) return
      setError(message)
    })

    window.api.startLogStream({ requestId, namespace, pod, container, follow, tailLines })

    return () => {
      offData()
      offEnd()
      offError()
      window.api.stopLogStream(requestId)
    }
  }, [namespace, pod, container, follow, tailLines])

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }, [lines])

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[820px] max-w-full flex-col bg-white shadow-xl dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
            {namespace}/{pod}
          </h3>
          <select
            value={container}
            onChange={(e) => setContainer(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {containers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Follow
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            Tail
            <input
              type="number"
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value) || 0)}
              className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-950 p-4">
          {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
          <pre ref={logBoxRef} className="mono h-full overflow-auto whitespace-pre-wrap text-xs text-gray-100">
            {lines || 'Waiting for logs...'}
          </pre>
        </div>
      </div>
    </div>
  )
}
