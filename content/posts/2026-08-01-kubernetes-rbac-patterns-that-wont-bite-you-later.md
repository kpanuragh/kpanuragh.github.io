---
title: "🔑 Kubernetes RBAC Patterns That Won't Bite You Later"
date: "2026-08-01"
excerpt: "cluster-admin for everyone is not a permissions model, it's a liability with YAML syntax. Here's how to design Kubernetes RBAC that actually scopes access, survives an audit, and doesn't turn every incident into a game of 'who could have done this.'"
tags: ["kubernetes", "rbac", "cloud-security", "devops", "platform-engineering"]
featured: true
---

Every Kubernetes cluster starts the same way. Someone runs `kubectl create clusterrolebinding temp-admin --clusterrole=cluster-admin --user=me` to get unblocked during setup, promises to fix it later, and then eighteen months later that binding is still there, except now "me" is a service account that half the CI pipeline depends on and nobody remembers why.

RBAC is one of those Kubernetes features that's simple to explain and shockingly easy to get wrong in a way that looks correct in a demo and falls apart during an actual incident. Roles bind to subjects, subjects get permissions, permissions get scoped by namespace or cluster-wide. Four moving parts. And yet almost every cluster I've audited has at least one RoleBinding that grants far more than the workload actually needs, because "grant more, debug less" is the path of least resistance under a deadline.

## The default that gets everyone: `verbs: ["*"]`

The fastest way to unblock a stuck deployment is to widen the Role until the error goes away. It works every time, which is exactly the problem — it trains people to reach for wildcards instead of finding the actual missing verb.

```yaml
# what gets written under deadline pressure
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-deployer
  namespace: payments
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
```

That Role technically "solves" whatever permission error someone hit. It also means any pod running under a ServiceAccount bound to it can read every Secret in the `payments` namespace, delete other teams' Deployments if they happen to share the namespace, and modify RBAC objects themselves — including granting itself more permissions later. A single compromised container with this binding isn't a contained incident anymore, it's a namespace-wide one.

The fix isn't heroic, it's just tedious: figure out the actual verbs the workload calls. If your deploy pipeline does `get`, `list`, `watch`, `create`, `update` on `deployments` and nothing else, write exactly that.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-deployer
  namespace: payments
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "create", "update"]
```

No `delete`, no `patch` on RBAC objects, no `secrets`. When someone tries to do something outside that list, they get a clear 403 instead of the pipeline silently having god-mode it never needed.

## `kubectl auth can-i --list` is the tool nobody runs until the audit

Most teams write RBAC once and never look at it again — not because they don't care, but because there's no natural trigger to revisit it. The audit that eventually happens (compliance review, post-incident, new security hire) is usually the first time anyone actually enumerates what a ServiceAccount can do.

```bash
kubectl auth can-i --list --as=system:serviceaccount:payments:app-deployer -n payments
```

Run this against every ServiceAccount that has meaningful blast radius — anything with `secrets` access, anything that can `create` pods (which is effectively arbitrary code execution in the namespace via a crafted pod spec), anything bound cluster-wide. Do it quarterly, not just when someone asks. The output is often the fastest way to find a stale wildcard grant from a "temporary" fix that never got cleaned up.

At Cubet, we added this check as a scheduled job that diffs the output against a checked-in baseline and flags new permissions in a PR comment — not to block deploys, just so a widened grant shows up as a visible diff instead of disappearing silently into a YAML file nobody re-reads.

## RoleBinding vs ClusterRoleBinding: the mistake is usually the second one

`Role` + `RoleBinding` scopes to a namespace. `ClusterRole` + `ClusterRoleBinding` scopes cluster-wide. Both are legitimate — you genuinely need cluster-scoped roles for things like node-level controllers or CRDs that span namespaces. The mistake is defaulting to `ClusterRoleBinding` because it's one less namespace field to think about, for a workload that only ever touches its own namespace.

```yaml
# cluster-wide access for a namespace-scoped need — the common mistake
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: payments-deployer-binding
subjects:
  - kind: ServiceAccount
    name: app-deployer
    namespace: payments
roleRef:
  kind: ClusterRole
  name: deployer-role
  apiGroup: rbac.authorization.k8s.io
```

If `app-deployer` only ever needs to touch `Deployments` in `payments`, this binding just handed it the same access in every other namespace on the cluster, `kube-system` included. Use `ClusterRole` + `RoleBinding` when you want a reusable role definition applied only within one namespace — that combination is underused and solves the "I want consistency without cluster-wide blast radius" problem cleanly:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: payments-deployer-binding
  namespace: payments
subjects:
  - kind: ServiceAccount
    name: app-deployer
    namespace: payments
roleRef:
  kind: ClusterRole
  name: deployer-role   # cluster-scoped definition, namespace-scoped grant
  apiGroup: rbac.authorization.k8s.io
```

Same reusable `ClusterRole`, but the binding confines its reach to one namespace. This is the pattern to reach for by default; reserve `ClusterRoleBinding` for the roles that genuinely need every namespace, and make that list short enough that someone could name every entry on it from memory.

## The escalation path nobody checks: RBAC-on-RBAC

The permission that gets missed most often isn't a dangerous verb on a workload resource — it's `create` or `update` on `roles`, `rolebindings`, `clusterroles`, or `clusterrolebindings` themselves. Any subject with that permission can grant itself additional access, which means its "effective" permissions are whatever it wants them to be, regardless of what the original Role said.

```bash
kubectl auth can-i create rolebindings --as=system:serviceaccount:payments:app-deployer -n payments
kubectl auth can-i create clusterrolebindings --as=system:serviceaccount:payments:app-deployer
```

If either comes back `yes` for a workload ServiceAccount that isn't your platform team's own tooling, that's a finding, not a footnote. It's the RBAC equivalent of a sudoers entry that lets a low-privilege user edit `/etc/sudoers`.

## The takeaway

RBAC misconfiguration doesn't announce itself the way an exposed dashboard or a public S3 bucket does — there's no scanner banner for it, it just sits there as a wildcard Role quietly widening your blast radius until a compromised pod turns into a compromised namespace, or worse, a compromised cluster. The fix isn't a bigger tool, it's a habit: write the narrowest Role that satisfies the actual verbs a workload calls, prefer namespace-scoped bindings by default, and periodically run `auth can-i --list` against anything with real reach instead of waiting for an audit to ask the question first.

Found a `cluster-admin` binding you can't explain, or have a story about a ServiceAccount that could do more than the whole platform team realized? Find me on [X/Twitter](https://x.com/imanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh).
