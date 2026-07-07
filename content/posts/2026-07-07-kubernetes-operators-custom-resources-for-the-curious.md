---
title: "🤖 Custom Resources and Operators: Teaching Kubernetes New Tricks"
date: 2026-07-07
excerpt: "kubectl get postgresclusters works because someone taught Kubernetes what a PostgresCluster is. Here's what actually happens under the hood when you write a CRD and an operator, and why it's less magic than it looks."
tags:
  - kubernetes
  - devops
  - platform-engineering
  - operators
  - crd
featured: true
---

The first time you run `kubectl get postgresclusters` and it just *works*, something in your brain short-circuits a little. Postgres isn't a built-in Kubernetes concept. There's no `kind: PostgresCluster` in the upstream API docs. And yet there it is, listed right alongside Pods and Deployments like it's always belonged there.

It has, sort of. That's the entire premise of Custom Resource Definitions and the operators that bring them to life: Kubernetes doesn't actually know what a database is, but it's very good at storing structured YAML and telling *something* whenever that YAML changes. Operators are the "something."

## The API server is just a very opinionated database

Strip away the Kubernetes mythology and the control plane is a REST API in front of etcd, with a scheduler and a bunch of controllers watching for changes and reacting. A CRD is you registering a new table in that database and asking the API server to validate, version, and serve it exactly like it does Pods.

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: postgresclusters.db.cubet.dev
spec:
  group: db.cubet.dev
  names:
    kind: PostgresCluster
    plural: postgresclusters
    shortNames: [pgc]
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                replicas:
                  type: integer
                  minimum: 1
                storageSize:
                  type: string
```

Apply that, and `kubectl get postgresclusters` starts working immediately — you get a real resource with API validation, RBAC, `kubectl describe`, the works. What you *don't* get is a database. Creating a `PostgresCluster` object right now just... sits there. It's a row in etcd that nothing is reading. That's the part people skip past in the "look how easy CRDs are" blog posts, and it's also the entire point: the CRD is the interface, the operator is the implementation.

## The operator is a very patient loop

An operator is a controller — code that runs a reconcile loop watching for a resource type and doing whatever work is needed to make reality match the spec. No polling on a timer waiting for divergence, no imperative "provision a database now" script. Just: watch, compare, act, repeat.

```go
func (r *PostgresClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var cluster dbv1.PostgresCluster
    if err := r.Get(ctx, req.NamespacedName, &cluster); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    sts := desiredStatefulSet(&cluster)
    if err := r.reconcileStatefulSet(ctx, sts); err != nil {
        return ctrl.Result{}, err
    }

    cluster.Status.ReadyReplicas = currentReadyReplicas(ctx, r.Client, &cluster)
    return ctrl.Result{}, r.Status().Update(ctx, &cluster)
}
```

That's the whole mental model, and it's the same one Deployments use internally to manage ReplicaSets, which use it to manage Pods. You're not learning a new paradigm when you write an operator — you're just extending the pattern that already runs the entire cluster, one level up the stack.

The genuinely underappreciated part is the `Status` subresource. A well-behaved CRD splits `spec` (what you want) from `status` (what the operator observed), and that separation is what makes `kubectl get postgresclusters` show useful columns like `READY` and `PRIMARY` instead of just echoing your YAML back at you. If your operator writes application state into `spec`, you'll eventually get a very confusing bug where a `kubectl apply` from CI silently reverts status the controller just set.

## Where this actually pays off (and where it doesn't)

At Cubet, we run an internal operator that owns tenant provisioning — a `Tenant` CRD that fans out into a namespace, resource quotas, a Postgres schema, and a set of default NetworkPolicies. Before the operator existed, this was a 40-step runbook that a human executed by hand, and it drifted constantly because step 23 ("update the quota when the plan changes") was the kind of thing that got forgotten under deadline pressure. Now it's declarative: change the `plan` field on the `Tenant` object, the reconcile loop notices, the quota gets patched. The runbook became a diff.

But operators are not free, and I've seen teams reach for one when a Helm chart with a cron job would've been fine. The tell is usually: does this actually need a *continuous* reconcile loop reacting to drift, or does it just need to run once when someone changes a value? If nothing external can drift out from under your resource — no pod gets OOM-killed and needs recreating, no external API state needs reconciling — you're just writing a slower, more complicated Helm chart with extra RBAC and a controller binary to keep patched. Operators earn their complexity when the thing they manage has a lifecycle that outlives a single `apply`.

The other trap is CRD versioning. Once real objects exist in etcd under `v1`, you can't just rename a field — you need conversion webhooks or a `v1beta1` → `v1` migration path, and I promise you will forget this exists until the day you need it. Design your schema like it's a public API on day one, because the moment someone's production `PostgresCluster` depends on a field name, it effectively is one.

## Start smaller than you think

You don't need Go, controller-runtime, and a full operator SDK setup to get a feel for this. Tools like `kubebuilder` scaffold the boilerplate in minutes, and if you want to skip code entirely, Kubernetes' own `admission webhooks` plus a CRD can get you 80% of the way for simple validation-and-defaulting use cases. Pick one internal pain point that's currently a runbook — the kind of thing an engineer does by hand and occasionally gets wrong — and try modeling it as a CRD before you reach for a whole operator framework. You'll learn more from watching your own reconcile loop misbehave once than from any tutorial.

What's the most over-engineered CRD you've ever seen — or written? I'd genuinely like to know I'm not the only one who's shipped a `Tenant` operator to avoid updating a spreadsheet.
