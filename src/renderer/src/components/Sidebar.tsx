import type { ContextInfo, ResourceKind } from '@shared/types'
import { RESOURCE_KIND_LABELS } from '@shared/types'

const KINDS: ResourceKind[] = [
  'pods',
  'deployments',
  'statefulsets',
  'daemonsets',
  'services',
  'ingresses',
  'configmaps',
  'secrets',
  'events'
]

export type ViewKind = 'overview' | ResourceKind

interface Props {
  contexts: ContextInfo[]
  currentContext: string | null
  onSwitchContext: (name: string) => void
  view: ViewKind
  onSelectView: (view: ViewKind) => void
  dark: boolean
  onToggleDark: () => void
}

export default function Sidebar({
  contexts,
  currentContext,
  onSwitchContext,
  view,
  onSelectView,
  dark,
  onToggleDark
}: Props): React.JSX.Element {
  return (
    <div className="flex h-full w-60 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          Kube Lens Lite
        </span>
        <button
          onClick={onToggleDark}
          className="rounded p-1 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
          title="Toggle theme"
        >
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>

      <div className="px-3 pb-2">
        <label className="mb-1 block text-[11px] font-medium uppercase text-gray-400">
          Context
        </label>
        <select
          value={currentContext ?? ''}
          onChange={(e) => onSwitchContext(e.target.value)}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {contexts.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <nav className="mt-2 flex-1 overflow-y-auto px-2">
        <NavItem label="Overview" active={view === 'overview'} onClick={() => onSelectView('overview')} />
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-gray-400">
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
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-gray-400">
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
        <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase text-gray-400">
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

      <div className="px-3 py-2 text-[11px] text-gray-400">Read-only viewer &middot; {KINDS.length + 1} views</div>
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
          ? 'bg-indigo-600 text-white'
          : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  )
}
