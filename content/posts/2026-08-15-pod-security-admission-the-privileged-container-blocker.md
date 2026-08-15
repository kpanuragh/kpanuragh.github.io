---
title: "🛂 Pod Security Admission: The Bouncer Who Actually Reads the YAML"
date: "2026-08-15"
excerpt: "PodSecurityPolicy is gone, and its replacement, Pod Security Admission, doesn't work like people expect — it's a namespace label, not a policy engine, and that difference has quietly let privileged containers slip into 'secure' clusters for years. Here's how PSA actually enforces things, where the three levels stop protecting you, and the mistakes that make it a no-op."
tags: ["kubernetes", "cloud-security", "devops", "platform-engineering", "container-security"]
featured: true
---

Here's a fun exercise: go find a Kubernetes cluster you didn't build yourself — a client's, a coworker's, whatever — and run `kubectl get ns -o json | jq '.items[].metadata.labels'`. Odds are decent you'll find namespaces with zero `pod-security.kubernetes.io/*` labels at all. Not "set to baseline," not "set to restricted" — just absent, which means the enforcement level is `privileged`, which means a pod can mount `/var/run/docker.sock`, request `hostPID`, or run as root with every capability Linux has to offer, and the cluster will wave it through without a word.

That's not a bug. That's the actual default behavior of Pod Security Admission (PSA), the thing that replaced PodSecurityPolicy (PSP) when PSP got deprecated in 1.21 and yanked out entirely in 1.25. And the gap between what people assume PSA does and what it actually does is where a lot of "secure" clusters quietly aren't.

## PSP is dead. Long live... a label?

PSP was a cluster-scoped object with its own RBAC binding logic, which made it flexible and also nearly impossible to reason about — figuring out which policy applied to which pod meant tracing through `ClusterRoleBindings` tied to service accounts, and two people on the same team would draw you two different diagrams. It got killed for exactly this reason.

PSA's replacement idea is aggressively simple: security level is a **namespace label**, evaluated against three built-in [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/) — `privileged`, `baseline`, and `restricted`. No custom policy objects, no RBAC indirection, no CRDs. You label the namespace, the admission controller (built into the API server since 1.25, no extra install) checks incoming pod specs against that level, and it either admits, warns, or rejects.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: checkout-service
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Three modes, one per label, and they're not aliases of each other:

- `enforce` — actually blocks the pod at admission time.
- `audit` — lets it through, but logs a violation to the audit trail.
- `warn` — lets it through, but the user gets a `kubectl` warning in their terminal.

That last point trips people constantly. Setting only `pod-security.kubernetes.io/warn: restricted` feels like you did the security thing — CI even shows a scary yellow message — but nothing is actually stopped. I've seen teams treat `warn` labels as coverage during an audit, right up until someone points out the deployment still succeeded.

## The three levels aren't a smooth gradient

`baseline` blocks the obviously catastrophic stuff: privileged containers, host namespaces (`hostNetwork`, `hostPID`, `hostIPC`), most dangerous capabilities. It does **not** require running as non-root, does **not** enforce a read-only root filesystem, and does **not** restrict `seccomp` profiles. A container running as UID 0 with a writable filesystem sails through `baseline` without a single complaint.

`restricted` is the one that actually resembles a hardened posture — non-root enforced, privilege escalation disallowed, capabilities dropped to `ALL` with only `NET_BIND_SERVICE` addable back, seccomp required. It's also the level that breaks the most existing workloads on day one, because a shocking number of base images (older Postgres, some Bitnami charts, half of Helm's default templates circa a few years ago) assume root by default.

```yaml
# This gets admitted under baseline, rejected under restricted
apiVersion: v1
kind: Pod
metadata:
  name: legacy-worker
spec:
  containers:
  - name: app
    image: internal/worker:3.2
    securityContext:
      runAsUser: 0        # restricted requires runAsNonRoot: true
      # no seccompProfile set -> restricted also rejects this
```

The practical rollout at Cubet was: `audit` + `warn` at `restricted` everywhere first, let it run for a sprint, grep the audit logs and warning output for what would actually break, fix the base images that assumed root, *then* flip to `enforce`. Going straight to `enforce: restricted` on an existing cluster is a great way to find out which cron job nobody has looked at since 2023.

## Where it stops being a security boundary

The part that surprises people most: PSA only ever looks at the **pod spec fields covered by the Pod Security Standards** — security contexts, capabilities, host namespace usage, volume types. It has no opinion on RBAC, network policy, image provenance, resource limits, or anything running inside the container once it's scheduled. A pod can pass `restricted` cleanly and still pull an unscanned image with a known CVE, still talk to every other pod in the cluster because there's no `NetworkPolicy`, and still have a service account with a bound token that has cluster-admin. PSA closes exactly one door — "can this pod ask for dangerous kernel-level access" — and it's a door worth closing, but treating it as a general-purpose policy engine is how OPA/Gatekeeper and Kyverno still exist as products: PSA covers the fixed built-in standards, not arbitrary org-specific rules like "images must come from our registry" or "no `:latest` tags."

If you need custom rules, PSA and an admission policy engine aren't competitors — run PSA for the baseline pod-security floor (it's free, built-in, zero extra components) and layer Kyverno or ValidatingAdmissionPolicy on top for anything org-specific.

## The one-line check worth running today

```bash
kubectl get ns -o custom-columns=\
'NAME:.metadata.name,ENFORCE:.metadata.labels.pod-security\.kubernetes\.io/enforce'
```

If that comes back with a wall of `<none>`, you've got a cluster running on the implicit `privileged` default, and every namespace on that list is one misconfigured Helm chart away from a pod with `hostPID: true` sitting next to your production workloads. It's a five-minute fix per namespace and it's the kind of gap that doesn't show up until someone goes looking for it — usually during an incident, not before one.

Got a cluster with a different PSA horror story, or a migration-from-PSP war story of your own? Come argue with me about it — I'm [@anuragh_kp](https://twitter.com/anuragh_kp) on Twitter/X, [kpanuragh](https://github.com/kpanuragh) on GitHub, and [anuraghkp](https://linkedin.com/in/anuraghkp) on LinkedIn.
