import { useEffect, useState } from 'react'
import type { SecretDetail } from '@shared/types'

interface Props {
  contextName: string
  namespace: string
  name: string
  onClose: () => void
}

const MASK = '•'.repeat(24)

export default function SecretPanel({ contextName, namespace, name, onClose }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<SecretDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setRevealed(new Set())
    window.api.getSecretDetail(contextName, namespace, name).then((res) => {
      setLoading(false)
      if (res.ok) setDetail(res.data)
      else setError(res.error)
    })
  }, [contextName, namespace, name])

  const toggle = (key: string): void => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const copy = async (key: string, value: string): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500)
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[720px] max-w-full flex-col bg-white shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            Secret: {namespace}/{name}
          </h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading && <div className="text-sm text-slate-500">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {detail && (
            <>
              <dl className="mb-4 grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-400">Name</dt>
                <dd className="text-slate-800 dark:text-slate-100">{detail.name}</dd>
                <dt className="text-slate-400">Namespace</dt>
                <dd className="text-slate-800 dark:text-slate-100">{detail.namespace}</dd>
                <dt className="text-slate-400">Type</dt>
                <dd className="text-slate-800 dark:text-slate-100">{detail.type}</dd>
                <dt className="text-slate-400">Age</dt>
                <dd className="text-slate-800 dark:text-slate-100">{detail.age}</dd>
              </dl>

              {Object.keys(detail.labels).length > 0 && (
                <ChipGroup title="Labels" items={detail.labels} />
              )}
              {Object.keys(detail.annotations).length > 0 && (
                <ChipGroup title="Annotations" items={detail.annotations} />
              )}

              <h4 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                Data ({detail.data.length})
              </h4>
              <p className="mb-3 text-xs text-slate-400">
                Values are masked by default. Anyone who can view this Secret through kubectl or the API
                already has equivalent access to these values.
              </p>
              <div className="space-y-3">
                {detail.data.map((d) => (
                  <div key={d.key}>
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{d.key}</div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={revealed.has(d.key) ? d.value : MASK}
                        className="mono flex-1 truncate rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                      <button
                        onClick={() => toggle(d.key)}
                        disabled={d.binary}
                        className="shrink-0 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {revealed.has(d.key) ? 'Hide' : 'Show'}
                      </button>
                      {revealed.has(d.key) && !d.binary && (
                        <button
                          onClick={() => copy(d.key, d.value)}
                          className="shrink-0 rounded bg-accent-600 px-2 py-1.5 text-xs text-white hover:bg-accent-500"
                        >
                          {copiedKey === d.key ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ChipGroup({ title, items }: { title: string; items: Record<string, string> }): React.JSX.Element {
  return (
    <div className="mb-3">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(items).map(([k, v]) => (
          <span
            key={k}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            title={`${k}=${v}`}
          >
            {k}={v}
          </span>
        ))}
      </div>
    </div>
  )
}
