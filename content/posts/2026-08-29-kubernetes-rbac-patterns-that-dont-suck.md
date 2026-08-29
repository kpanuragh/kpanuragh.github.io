---
title: "🔐 Kubernetes RBAC Patterns That Don't Suck"
date: "2026-08-29"
excerpt: "cluster-admin for everyone is not a permissions strategy, it's a incident waiting for a calendar invite. Here's how to build Kubernetes RBAC that's actually least-privilege without making your team file a ticket to read a log."
tags: ["kubernetes", "security", "rbac", "cloud", "devops"]
featured: true
---

Every Kubernetes cluster starts the same way. Someone runs `kubectl create clusterrolebinding yolo --clusterrole=cluster-admin --user=everyone` (not literally, but emotionally), ships to prod, and RBAC becomes something you'll "clean up later." Later arrives the day a junior dev's laptop gets phished and the attacker discovers their kubeconfig can delete every namespace in the cluster, including the one running payments. Ask me how I know — actually don't, it's a whole story involving a 2am Slack thread and a very apologetic engineer.

RBAC in Kubernetes isn't hard. It's just tedious enough that people skip it, and permissive enough by default that skipping it doesn't page anyone until it's too late. Let's fix that with patterns that hold up under actual team growth, not just the "hello world" RBAC tutorial you copy-pasted once.

## Roles vs ClusterRoles: Pick the Smallest Blast Radius

The single most common mistake is reaching for `ClusterRole` when a namespaced `Role` would do. A `ClusterRole` bound cluster-wide means "this permission everywhere, forever, including namespaces that don't exist yet." That's rarely what you actually want.

```yaml
# Namespaced Role — scoped to one team's playground
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: checkout-service
  name: deploy-manager
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
```

That grants exactly what a deploy pipeline for `checkout-service` needs — nothing about secrets, nothing about other namespaces, no `delete` on anything. Compare that to the ClusterRole version most teams actually ship, which silently grants the same rights in `payments`, `auth`, and whatever namespace gets created next quarter. `ClusterRole` still has its place — for genuinely cluster-scoped resources like `nodes` or `persistentvolumes`, or when you deliberately want a role reusable across many namespaces via repeated `RoleBinding`s — but "I was too lazy to scope it" isn't one of those reasons.

## The Verb List Is Where Least-Privilege Goes to Die

People get the resource list right and then YOLO the verbs with `["*"]` because enumerating `get, list, watch, create, update, patch, delete` feels like busywork. It isn't — `delete` and `create` are categorically different risks than `get` and `list`. A CI service account that only ever needs to roll out deployments should never hold `delete` on `secrets`, even if nobody's written the exploit yet.

A pattern that's saved me repeatedly at Cubet: split roles by verb intent, not by resource convenience.

- **viewer** — `get, list, watch` only, safe to hand to anyone debugging
- **operator** — adds `update, patch` on the specific resources a deploy needs to touch
- **admin** — adds `create, delete`, reserved for platform team service accounts, never humans

Three roles, composed via multiple `RoleBinding`s on the same subject when someone genuinely needs two tiers, beats one mega-role that grants everything because defining three felt like overkill on day one.

## Aggregated ClusterRoles for Sane Fan-Out

If you're maintaining custom resources (CRDs) and want them to show up automatically in the built-in `view`/`edit`/`admin` ClusterRoles that ship with the cluster, don't hand-edit those — use aggregation labels instead:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: crd-widgets-viewer
  labels:
    rbac.authorization.k8s.io/aggregate-to-view: "true"
rules:
  - apiGroups: ["widgets.example.com"]
    resources: ["widgets"]
    verbs: ["get", "list", "watch"]
```

Kubernetes stitches this into the default `view` ClusterRole automatically. It's a small mechanism but it means your CRD permissions stay in sync with the built-in tiers instead of drifting into "oh nobody remembered to add widgets to the ops role" territory.

## Audit What You Actually Grant, Not What You Meant To

The gap between "the YAML I wrote" and "the permissions that exist" grows fast once bindings pile up across namespaces. `kubectl auth can-i` is your friend, and `--as` lets you impersonate to check:

```bash
kubectl auth can-i delete secrets \
  --namespace payments \
  --as=system:serviceaccount:checkout-service:deploy-bot
```

If that returns `yes` and you can't immediately explain why a checkout deploy bot needs to delete secrets in payments, you've found a real finding — not a theoretical one. Tools like `rbac-lookup` or `kubectl-who-can` make this sweep faster across a whole cluster, but the underlying discipline is the same one that catches SQL injection or an open S3 bucket: assume every permission you didn't deliberately reason about is a permission an attacker gets for free.

## Bindings Expire, Even If Kubernetes Doesn't Enforce It

RBAC has no native TTL. A `RoleBinding` created for a two-week migration project is just as valid two years later unless someone deletes it. If your org does access reviews for cloud IAM, extend the same review to RBAC bindings — they're the same category of risk wearing a different YAML schema, and they're a lot easier to forget because nobody gets a Slack reminder that a Kubernetes binding exists.

Least-privilege RBAC isn't glamorous work. It's a dozen small, boring YAML files instead of one exciting one. But the boring version is the one that turns "attacker got a phished laptop" into "attacker got read access to one team's logs" instead of "attacker got the whole cluster." That trade is always worth the extra fifteen minutes.

Got a Kubernetes RBAC horror story or a pattern I missed? Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — I collect these the way some people collect vinyl.
