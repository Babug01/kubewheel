import { useEffect, useState } from 'react'
import type { ResourceKind } from '@shared/types'
import { RESOURCE_KIND_LABELS } from '@shared/types'

export type ViewKind = 'overview' | 'customresources' | 'helmreleases' | ResourceKind

interface Props {
  contextName: string
  view: ViewKind
  onSelectView: (view: ViewKind) => void
}

interface NavGroup {
  label: string
  items: { key: ViewKind; label: string }[]
}

const kindItems = (kinds: ResourceKind[]): { key: ViewKind; label: string }[] =>
  kinds.map((k) => ({ key: k, label: RESOURCE_KIND_LABELS[k] }))

const GROUPS: NavGroup[] = [
  {
    label: 'Cluster',
    items: [
      { key: 'overview', label: 'Overview' },
      { key: 'namespaces', label: 'Namespaces' },
      { key: 'events', label: 'Events' }
    ]
  },
  {
    label: 'Workloads',
    items: kindItems(['pods', 'deployments', 'replicasets', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs'])
  },
  {
    label: 'Config',
    items: kindItems([
      'configmaps',
      'secrets',
      'resourcequotas',
      'limitranges',
      'hpas',
      'poddisruptionbudgets',
      'priorityclasses',
      'leases'
    ])
  },
  {
    label: 'Network',
    items: kindItems(['services', 'endpoints', 'endpointslices', 'ingresses', 'ingressclasses', 'networkpolicies'])
  },
  {
    label: 'Storage',
    items: kindItems(['persistentvolumeclaims', 'persistentvolumes', 'storageclasses'])
  },
  {
    label: 'Access Control',
    items: kindItems(['serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings'])
  },
  { label: 'Helm', items: [{ key: 'helmreleases', label: 'Releases' }] },
  { label: 'Custom Resources', items: [{ key: 'customresources', label: 'Browse' }] }
]

const OPEN_GROUPS_KEY = 'kll-open-sidebar-groups'

function loadOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [GROUPS[0].label])
  } catch {
    return new Set([GROUPS[0].label])
  }
}

function groupLabelFor(view: ViewKind): string | null {
  return GROUPS.find((g) => g.items.some((i) => i.key === view))?.label ?? null
}

export default function Sidebar({ contextName, view, onSelectView }: Props): React.JSX.Element {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => loadOpenGroups())

  // Whichever group holds the active view should always be visibly expanded.
  useEffect(() => {
    const activeGroup = groupLabelFor(view)
    if (activeGroup && !openGroups.has(activeGroup)) {
      setOpenGroups((prev) => new Set(prev).add(activeGroup))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...openGroups]))
    } catch {
      // best-effort; losing remembered sidebar state on a private/blocked-storage window is fine
    }
  }, [openGroups])

  const toggleGroup = (label: string): void => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div className="flex h-full w-60 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="px-4 py-3">
        <div
          className="truncate text-base font-bold tracking-tight text-accent-600 dark:text-accent-400"
          title={contextName}
        >
          {contextName}
        </div>
      </div>

      <nav className="mt-1 flex-1 overflow-y-auto px-2">
        {GROUPS.map((group) => {
          const isOpen = openGroups.has(group.label)
          const hasActive = groupLabelFor(view) === group.label
          return (
            <div key={group.label} className="mt-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className={`flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${
                  hasActive
                    ? 'text-accent-600 dark:text-accent-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <span>{group.label}</span>
                <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>&rsaquo;</span>
              </button>
              {isOpen && (
                <div className="mt-0.5 mb-1">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.key}
                      label={item.label}
                      active={view === item.key}
                      onClick={() => onSelectView(item.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-3 py-2 text-[11px] text-slate-400">Read-only viewer</div>
    </div>
  )
}

function NavItem({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 block w-full rounded px-2 py-1.5 text-left text-[13px] font-normal ${
        active
          ? 'bg-accent-600 text-white'
          : 'text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}
