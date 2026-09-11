interface Props {
  onBrowseCatalog: () => void
}

export default function Home({ onBrowseCatalog }: Props): React.JSX.Element {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-white p-6 dark:bg-slate-950">
      <div className="max-w-md text-center">
        <div
          aria-hidden
          className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent-50 text-4xl text-accent-600 dark:bg-accent-900/40 dark:text-accent-400"
        >
          &#9784;
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Welcome to Kubewheel
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          A fast, read-only viewer for any cluster in your kubeconfig. Browse workloads, Custom
          Resources, and Helm releases, watch live CPU/memory usage, and tail pod logs &mdash; all
          without the weight of a full IDE, and without anything here ever mutating your cluster.
        </p>
        <button
          onClick={onBrowseCatalog}
          className="mt-6 rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
        >
          Browse Clusters in Catalog &rarr;
        </button>
        <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
          <a
            onClick={(e) => {
              e.preventDefault()
              window.api.openExternal('https://github.com/Babug01/kubewheel')
            }}
            href="https://github.com/Babug01/kubewheel"
            className="cursor-pointer hover:underline"
          >
            Source and releases on GitHub
          </a>
        </p>
      </div>
    </div>
  )
}
