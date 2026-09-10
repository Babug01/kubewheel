import { useState } from 'react'

interface Props {
  title: string
  yaml: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}

export default function YamlPanel({ title, yaml, loading, error, onClose }: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    if (!yaml) return
    await navigator.clipboard.writeText(yaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[720px] max-w-full flex-col bg-white shadow-xl dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              disabled={!yaml}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && <div className="text-sm text-gray-500">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && (
            <pre className="mono whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
              {yaml}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
