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
- Live metrics — per-node and cluster-wide CPU/memory usage bars plus a rolling 2-minute sparkline,
  read directly from `metrics.k8s.io` (no Prometheus needed, unlike Lens/Freelens' metrics — so it
  works on clusters that have metrics-server but not a Prometheus stack). Degrades to a plain
  "unavailable" note if metrics-server isn't installed, rather than breaking the rest of the view
- Resource browser covering 31 kinds across Workloads (Pods, Deployments, ReplicaSets, StatefulSets,
  DaemonSets, Jobs, CronJobs), Config (ConfigMaps, Secrets, Resource Quotas, Limit Ranges, HPAs, Pod
  Disruption Budgets, Priority Classes, Leases), Network (Services, Endpoints, Endpoint Slices,
  Ingresses, Ingress Classes, Network Policies), Storage (PVCs, PVs, Storage Classes), Access Control
  (Service Accounts, Roles, RoleBindings, ClusterRoles, ClusterRoleBindings), plus Namespaces and
  Events — per-namespace or across all namespaces (cluster-scoped kinds skip the namespace filter),
  with name filtering
- Custom Resources — every CRD on the cluster, grouped by API group like `kubectl api-resources`.
  Instance tables use the CRD's own `additionalPrinterColumns` (the same schema `kubectl get`
  reads), including the common `conditions[?(@.type=="X")]` filter pattern used by cert-manager,
  ArgoCD, and most controllers for their Ready/Status columns — not a generic Name/Age table
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
