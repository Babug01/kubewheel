import type { ResourceKind } from '@shared/types'
import { RESOURCE_KIND_LABELS } from '@shared/types'

export type ViewKind = 'overview' | ResourceKind

interface Props {
  contextName: string
  view: ViewKind
  onSelectView: (view: ViewKind) => void
}

export default function Sidebar({ contextName, view, onSelectView }: Props): React.JSX.Element {
  return (
    <div className="flex h-full w-60 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="px-4 py-3">
        <div className="truncate text-sm font-semibold text-accent-600 dark:text-accent-400" title={contextName}>
          {contextName}
        </div>
      </div>

      <nav className="mt-1 flex-1 overflow-y-auto px-2">
        <NavItem label="Overview" active={view === 'overview'} onClick={() => onSelectView('overview')} />
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-slate-400">
          Workloads
        </div>
        {(['pods', 'deployments', 'statefulsets', 'daemonsets'] as ResourceKind[]).map((k) => (
          <NavItem
            key={k}
            label={RESOURCE_KIND_LABELS[k]}
            active={view === k}
            onClick={() => onSelectView(k)}
          />
        ))}
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-slate-400">
          Network
        </div>
        {(['services', 'ingresses'] as ResourceKind[]).map((k) => (
          <NavItem
            key={k}
            label={RESOURCE_KIND_LABELS[k]}
            active={view === k}
            onClick={() => onSelectView(k)}
          />
        ))}
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-slate-400">
          Config
        </div>
        {(['configmaps', 'secrets', 'events'] as ResourceKind[]).map((k) => (
          <NavItem
            key={k}
            label={RESOURCE_KIND_LABELS[k]}
            active={view === k}
            onClick={() => onSelectView(k)}
          />
        ))}
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
      className={`mb-0.5 block w-full rounded px-2 py-1.5 text-left text-sm ${
        active
          ? 'bg-accent-600 text-white'
          : 'text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}
