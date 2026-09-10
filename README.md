# Kube Lens Lite

A small, read-only Kubernetes cluster viewer for Windows. Works against **any** cluster in your
kubeconfig — AKS, EKS, GKE, or a bare-metal `kubeadm` install — since it talks to the standard
Kubernetes API via whatever auth your kubeconfig context already uses (including `exec`-based
plugins like `kubelogin`).

Built as a lightweight alternative to Lens/Freelens for a single use case: quickly browsing what's
running on a cluster and tailing pod logs, without the weight of a full IDE.

## Features (read-only)

- Cluster catalog — every context in `~/.kube/config` as a searchable, favoritable card grid
- Multi-cluster tabs — open several clusters at once, each with its own independent connection;
  open tabs and favorites persist across restarts
- Cluster overview — node list (status, roles, version, CPU/memory), Kubernetes version, pod/namespace counts
- Resource browser — Pods, Deployments, StatefulSets, DaemonSets, Services, Ingresses, ConfigMaps,
  Secrets (metadata only), Events — per-namespace or across all namespaces, with name filtering
- YAML detail view for any resource (managed-fields stripped for readability; Secret values are
  always redacted — keys are shown, values never are)
- Live pod log viewer — container picker, tail length, follow/stream toggle

Nothing here mutates the cluster — no edit, no delete, no exec, no scale. It only ever issues
`get`/`list` calls against the Kubernetes API. (Mutating actions and an exec terminal are on the
roadmap, gated behind an explicit read-only-mode toggle and a confirmation dialog per action.)

## Stack

Electron + Vite + React + TypeScript + Tailwind CSS, using
[`@kubernetes/client-node`](https://github.com/kubernetes-client/javascript) as the API client.

## Development

```bash
npm install
npm run dev        # launch in dev mode
npm run typecheck   # type-check main + renderer
npm run dist:win    # build a Windows installer + portable exe
```

## License

MIT
