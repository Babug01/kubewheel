const EXTRA_KUBECONFIGS_KEY = 'kll-extra-kubeconfigs'

export function loadExtraKubeconfigs(): string[] {
  try {
    const raw = localStorage.getItem(EXTRA_KUBECONFIGS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveExtraKubeconfigs(paths: string[]): void {
  try {
    localStorage.setItem(EXTRA_KUBECONFIGS_KEY, JSON.stringify(paths))
  } catch {
    // best-effort; a private window or blocked storage just means it doesn't persist
  }
}
