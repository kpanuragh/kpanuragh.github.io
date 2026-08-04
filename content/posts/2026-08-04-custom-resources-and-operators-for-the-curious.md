---
title: "🎛️ Custom Resources and Operators for the Curious"
date: "2026-08-04"
excerpt: "kubectl get postgresqlcluster feels like magic until you realize it's just a controller watching etcd in a loop and yelling reconcile at itself. Here's what a CRD and an operator actually are, why you'd build one, and the footguns that only show up after you do."
tags: ["kubernetes", "operators", "custom-resources", "devops", "platform-engineering"]
featured: true
---

The first time I ran `kubectl get postgresqlcluster` and got back a real object with a `STATUS` column and everything, I had two reactions in quick succession. First: "wait, that's not a built-in Kubernetes thing?" Second: "okay but how does `kubectl` even know what columns to print for something I've never heard of." Turns out the answer to both is the same feature, and once you see it, you start noticing it everywhere — cert-manager's `Certificate`, Prometheus Operator's `ServiceMonitor`, Crossplane's entire existence. Kubernetes isn't just a container scheduler. It's a general-purpose API machine that happens to ship with containers as the first app built on top of it, and Custom Resource Definitions are how you write the second app.

## The part that's just a database with opinions

A CRD registers a new resource type with the Kubernetes API server. Once registered, `PostgreSQLCluster` objects behave exactly like `Pod` or `Deployment` objects as far as the API is concerned — they get validated against a schema, stored in etcd, versioned, watchable, and subject to RBAC. None of that requires a single line of custom code. You could register a CRD, `kubectl apply` instances of it, and never write a controller — you'd just have a fancy, schema-validated key-value store with a REST API. Kind of useless on its own, but it's worth internalizing that this half is "free":

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: postgresqlclusters.db.example.com
spec:
  group: db.example.com
  names:
    kind: PostgreSQLCluster
    plural: postgresqlclusters
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
                storageGB:
                  type: integer
```

Apply that, and `kubectl get postgresqlclusters` works. Nothing actually provisions a database yet. That's the second half.

## The operator is a while-loop with a job title

An operator is just a controller that watches your CRD and does something about it. Strip away the ceremony and the entire pattern is: read desired state, read actual state, make actual state look more like desired state, repeat forever. That's it. That's the whole trick that gets marketed as "operational knowledge encoded in software."

```go
func (r *PostgreSQLClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var cluster dbv1.PostgreSQLCluster
    if err := r.Get(ctx, req.NamespacedName, &cluster); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    var sts appsv1.StatefulSet
    err := r.Get(ctx, req.NamespacedName, &sts)
    if apierrors.IsNotFound(err) {
        desired := buildStatefulSet(&cluster)
        return ctrl.Result{}, r.Create(ctx, desired)
    }

    if *sts.Spec.Replicas != int32(cluster.Spec.Replicas) {
        sts.Spec.Replicas = ptr.To(int32(cluster.Spec.Replicas))
        return ctrl.Result{}, r.Update(ctx, &sts)
    }

    return ctrl.Result{}, nil
}
```

You bump `replicas` in the CRD, the controller notices on its next reconcile, and it patches the underlying StatefulSet. Nobody ran a runbook. Nobody SSH'd anywhere. The "operational knowledge" — how to scale this database safely, in what order, with what preconditions — lives in Go code that runs forever instead of in a wiki page that goes stale six months after whoever wrote it changes teams.

## Where it actually pays for itself

At Cubet, we had a recurring pattern where every new service needed the same bundle: a namespace, a couple of NetworkPolicies, a default ResourceQuota, and an entry in the internal service catalog. For a while that was a checklist in Confluence, which meant it was also a checklist that got skipped under deadline pressure — someone would spin up a namespace by hand, forget the quota, and three weeks later a runaway job would eat the node.

We turned it into a `ServiceScaffold` CRD backed by a small operator. Create one object with a service name and a team label, and the controller fans it out into the namespace, policies, quota, and catalog registration, then keeps them in sync if the CRD spec changes later. The checklist didn't get more thorough — it stopped being a checklist and became a reconcile loop, which means it can't be half-done. That's the actual value proposition of operators: not "automation" in the abstract, but converting a sequence of steps a human can forget into a state a controller can't stop enforcing.

## The footguns nobody puts on the conference slide

**Reconcile has to be idempotent, always.** It will run more times than you expect — on startup, on resync intervals, on every unrelated field change to a watched object. If your reconcile logic does something non-idempotent, like appending to a list or incrementing a counter based on a side effect, you'll get duplicate work or drift that's maddening to debug because it only shows up under specific event timing.

**Status subresources exist for a reason — use them.** Writing to `.status` through the same update path as `.spec` creates a resource-version race between your controller and anyone editing the spec. Split spec and status updates, or you'll eventually chase a bug where a user's edit gets silently clobbered by a controller reconcile that fired half a second later.

**Finalizers are easy to add and easy to forget you added.** A finalizer blocks deletion until your controller removes it. If your controller crashes, gets deleted, or has a bug in its cleanup path before it strips the finalizer, that object is stuck in `Terminating` forever and `kubectl delete` will lie to you about why nothing's happening. I've had to manually patch out a stuck finalizer more than once, and it's never a good afternoon.

**CRD schema changes need a migration story.** Once real objects exist under `v1`, changing the schema isn't free — you need conversion webhooks or a deliberate multi-version rollout, the same way you'd think about a database migration. Treat it with the same caution, not as "just edit the YAML."

## Where to start if you're curious

You don't need to write a full operator to get the intuition — [kubebuilder](https://book.kubebuilder.io/) or Operator SDK will scaffold a CRD and a reconcile loop in about five minutes, and running it against a local `kind` cluster is the fastest way to watch the loop fire in real time with `kubectl get events -w` open in a second terminal. Start with something trivial — an object that just creates a ConfigMap with a timestamp — before you reach for anything stateful. The pattern clicks a lot faster once you've watched your own reconcile function get called for reasons you didn't expect.
