// Contexts hidden from the catalog grid -- a purely local, reversible "remove" that never
// touches the real kubeconfig file (unlike a real `kubectl config delete-context`).
const HIDDEN_CONTEXTS_KEY = 'kll-hidden-contexts'

export function loadHiddenContexts(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_CONTEXTS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function saveHiddenContexts(hidden: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_CONTEXTS_KEY, JSON.stringify([...hidden]))
  } catch {
    // best-effort; a private window or blocked storage just means it doesn't persist
  }
}
