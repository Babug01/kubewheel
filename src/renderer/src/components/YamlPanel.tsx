import { useEffect, useState } from 'react'

interface Props {
  title: string
  yaml: string | null
  loading: boolean
  error: string | null
  onClose: () => void
  editable?: boolean
  onApply?: (newYaml: string) => Promise<{ ok: boolean; error?: string }>
}

export default function YamlPanel({
  title,
  yaml,
  loading,
  error,
  onClose,
  editable = false,
  onApply
}: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The panel is reused across row selections (same component instance) -- drop any leftover
  // edit-in-progress state whenever a fresh YAML fetch lands for a newly selected resource.
  useEffect(() => {
    setEditing(false)
    setSaveError(null)
  }, [yaml])

  const copy = async (): Promise<void> => {
    if (!yaml) return
    await navigator.clipboard.writeText(yaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const startEdit = (): void => {
    setDraft(yaml ?? '')
    setSaveError(null)
    setEditing(true)
  }

  const save = async (): Promise<void> => {
    if (!onApply) return
    setSaving(true)
    setSaveError(null)
    const res = await onApply(draft)
    setSaving(false)
    if (res.ok) setEditing(false)
    else setSaveError(res.error ?? 'Save failed')
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[720px] max-w-full flex-col bg-white shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded bg-accent-600 px-2 py-1 text-xs text-white hover:bg-accent-500 disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {editable && (
                  <button
                    onClick={startEdit}
                    disabled={!yaml}
                    className="rounded bg-accent-600 px-2 py-1 text-xs text-white hover:bg-accent-500 disabled:opacity-40"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={copy}
                  disabled={!yaml}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={onClose}
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && <div className="text-sm text-slate-500">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && editing ? (
            <div className="flex h-full flex-col gap-2">
              {saveError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {saveError}
                </div>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="mono h-full w-full flex-1 resize-none rounded border border-slate-300 bg-white p-3 text-xs text-slate-800 outline-none focus:border-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          ) : (
            !loading &&
            !error && (
              <pre className="mono whitespace-pre-wrap text-xs text-slate-800 dark:text-slate-200">{yaml}</pre>
            )
          )}
        </div>
      </div>
    </div>
  )
}
