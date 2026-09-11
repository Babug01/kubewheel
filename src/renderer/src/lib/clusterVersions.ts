// Caches Kubernetes version lookups for the catalog grid. Fetching a version means opening a
// real connection to that cluster (auth plugin and all), so a TTL cache keeps a catalog with many
// clusters -- some of them unreachable without a VPN -- from re-connecting to all of them on
// every visit to the page.
const VERSIONS_KEY = 'kll-cluster-versions'
const TTL_MS = 6 * 60 * 60 * 1000

interface CachedVersion {
  version: string
  fetchedAt: number
}

function loadCache(): Record<string, CachedVersion> {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, CachedVersion>) : {}
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, CachedVersion>): void {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(cache))
  } catch {
    // best-effort; a private window or blocked storage just means it doesn't persist
  }
}

export function getCachedVersion(contextName: string): string | null {
  const entry = loadCache()[contextName]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > TTL_MS) return null
  return entry.version
}

export function setCachedVersion(contextName: string, version: string): void {
  const cache = loadCache()
  cache[contextName] = { version, fetchedAt: Date.now() }
  saveCache(cache)
}
