---
title: "🤖 Kubernetes Operators: Teaching Your Cluster to Run Itself"
date: "2026-05-19"
excerpt: "Custom Resources and Operators let you encode operational knowledge into Kubernetes itself — so your cluster does the boring human toil, and you get to sleep through the night."
tags:
  - kubernetes
  - operators
  - platform-engineering
  - devops
  - cloud-native
featured: true
---

There's a moment every platform engineer reaches: you're paged at 2 AM because someone forgot to scale up a StatefulSet before a data migration, and you stare at the ceiling wondering — *why am I doing manually what a computer could have done automatically?*

The answer, at least in Kubernetes land, is **Operators**. And once you get them, you'll wonder how you ever lived without them.

## What Even Is a Custom Resource?

Kubernetes ships with a solid set of built-in resources: Pods, Deployments, Services, ConfigMaps. But the real power move? Kubernetes lets you *invent your own resource types* using **Custom Resource Definitions (CRDs)**.

A CRD is just a schema you register with the API server that says: "Hey Kubernetes, I'd like to have a new kind called `MySQLCluster`." After that, you can `kubectl get mysqlclusters` like it's always been there.

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: mysqlclusters.db.example.com
spec:
  group: db.example.com
  names:
    kind: MySQLCluster
    plural: mysqlclusters
    singular: mysqlcluster
    shortNames:
      - myc
  scope: Namespaced
  versions:
    - name: v1alpha1
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
                version:
                  type: string
```

Register this, and suddenly `kubectl apply -f mysqlcluster.yaml` is a thing. Kubernetes will store your custom objects, validate them against the schema, and expose them via the API — exactly like first-class citizens.

The catch: Kubernetes stores the object, but it has absolutely no idea what to *do* with it. That's where Operators come in.

## Operators: Controllers With a Brain

An Operator is just a Kubernetes controller that watches your custom resources and acts on them. The pattern is dead simple:

1. **Observe** — watch for Custom Resource changes (create, update, delete)
2. **Analyze** — compare *desired state* (the CR spec) with *current state* (what's actually running)
3. **Act** — reconcile the difference

This is the same reconciliation loop every built-in controller uses. The Deployment controller does it for Pods. The ReplicaSet controller does it for replicas. You're just plugging your own operational knowledge into the same machinery.

At Cubet, we built an operator for managing ephemeral preview environments. Each pull request would create a `PreviewEnvironment` CR, and the operator would spin up the full stack — namespace, ingress, database seed, secrets, the works — then tear it down when the PR closed. What used to be a 15-minute manual ritual became a sub-two-minute automated flow. The on-call rotation got noticeably quieter.

## Writing One (Without Losing Your Mind)

You *could* write an operator from scratch using `client-go`. You could also sharpen your own knife from ore. Most people use a framework.

**[controller-runtime](https://github.com/kubernetes-sigs/controller-runtime)** (Go) is the industry standard. **Operator SDK** wraps it with scaffolding. **Kubebuilder** is similar and excellent. If Go isn't your thing, **kopf** (Python) and **kube-rs** (Rust) are legitimate alternatives.

Here's a minimal reconciler in Go using controller-runtime — the part that actually does the work:

```go
func (r *MySQLClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    // 1. Fetch the Custom Resource
    cluster := &dbv1alpha1.MySQLCluster{}
    if err := r.Get(ctx, req.NamespacedName, cluster); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. Find existing StatefulSet
    sts := &appsv1.StatefulSet{}
    err := r.Get(ctx, types.NamespacedName{
        Name:      cluster.Name,
        Namespace: cluster.Namespace,
    }, sts)

    if errors.IsNotFound(err) {
        // 3a. Desired state: StatefulSet should exist — create it
        newSts := r.buildStatefulSet(cluster)
        if err := r.Create(ctx, newSts); err != nil {
            return ctrl.Result{}, err
        }
        log.Info("Created StatefulSet", "name", cluster.Name)
        return ctrl.Result{}, nil
    }

    // 3b. StatefulSet exists — sync replica count
    if *sts.Spec.Replicas != int32(cluster.Spec.Replicas) {
        sts.Spec.Replicas = ptr(int32(cluster.Spec.Replicas))
        if err := r.Update(ctx, sts); err != nil {
            return ctrl.Result{}, err
        }
        log.Info("Updated replicas", "count", cluster.Spec.Replicas)
    }

    return ctrl.Result{}, nil
}
```

That's it. The reconciler runs every time the CR changes, every time the StatefulSet changes, and on a periodic resync. It's *eventually consistent* — if something drifts, the next reconcile loop fixes it. This is why operators are so resilient: they don't react to events, they react to *state*.

## Real-World Lessons Learned

After shipping operators in production, here's what I'd tell past-me:

**Make your reconciler idempotent.** It will run more than you expect — network blips, leader re-election, just because. If running it twice causes problems, you've got bugs.

**Use status subresources.** Update `cluster.Status.Phase = "Ready"` so users can `kubectl get mysqlcluster -o wide` and actually see what's happening. Operators without good status fields are black boxes of frustration.

**Set owner references.** When your operator creates child resources (Pods, Services, Secrets), set the CR as the owner. Kubernetes will automatically garbage-collect them when the CR is deleted. Miss this, and you'll have orphaned resources haunting you in `kubectl get all --all-namespaces`.

**Return `ctrl.Result{RequeueAfter: time.Minute}` sparingly.** Every unnecessary requeue is noise. Only requeue when you genuinely need to check back — like polling an external API that doesn't emit events.

**Test with envtest.** The controller-runtime test suite spins up a real API server in memory. Tests that validate actual reconcile behavior are worth their weight in gold.

## When Should You Actually Write One?

Not everything needs an operator. The pattern shines when:

- You have **stateful workloads** with complex lifecycle management (databases, message brokers, caches)
- You need to **react to Kubernetes events** and drive external systems (provisioning cloud resources, updating DNS)
- You want to **encode runbook steps** into code that runs automatically — the "day-2 operations" that are currently someone's tribal knowledge

If you're just packaging a stateless app, a Helm chart is probably enough. Operators are for when the operational complexity is the whole point.

## The Ecosystem Is Already Rich

Before you write your own, check if one already exists. **OperatorHub.io** lists hundreds of production-grade operators — Postgres (CloudNativePG is excellent), Redis, Kafka, cert-manager, external-secrets-operator. These represent thousands of engineering hours of operational knowledge you can install with a single `kubectl apply`.

Standing on the shoulders of giants is fine. Writing your own when a domain-specific problem demands it? Even better.

## Go Make Your Cluster Smarter

The Kubernetes API isn't just a deployment engine — it's an extensible platform for encoding operational expertise. CRDs give you the vocabulary. Operators give you the grammar. Together, they let you teach your cluster to do exactly what a skilled human would do, but at 3 AM without complaining.

Start small: pick one repetitive operational task your team handles manually, write a CRD that describes the desired state, and build a reconciler that closes the gap. You'll delete more runbook entries than you write code.

Your future on-call self will be grateful.

**What operational toil are you still doing manually that an operator could handle?** Drop it in the comments — I'm always curious what operational knowledge is still trapped in people's heads instead of running as code.
