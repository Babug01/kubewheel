export interface WebLink {
  name: string
  url: string
}

const WEB_LINKS_KEY = 'kll-web-links'

export function loadWebLinks(): WebLink[] {
  try {
    const raw = localStorage.getItem(WEB_LINKS_KEY)
    return raw ? (JSON.parse(raw) as WebLink[]) : []
  } catch {
    return []
  }
}

export function saveWebLinks(links: WebLink[]): void {
  try {
    localStorage.setItem(WEB_LINKS_KEY, JSON.stringify(links))
  } catch {
    // best-effort; a private window or blocked storage just means it doesn't persist
  }
}
