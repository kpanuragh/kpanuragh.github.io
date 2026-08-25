---
title: "🎛️ Custom Resources and Operators: Teaching Kubernetes New Tricks"
date: "2026-08-25"
excerpt: "kubectl get pods is table stakes. The moment you write kubectl get postgresclusters and mean it, you've crossed into operator territory — and it's less magic and more a very patient control loop than you'd think."
tags:
  - kubernetes
  - devops
  - operators
  - platform-engineering
  - crd
featured: true
---

# 🎛️ Custom Resources and Operators: Teaching Kubernetes New Tricks

Every Kubernetes engineer has a moment where they type `kubectl get pods`, get a nice table back, and think "neat, it's just a database with a REST API and some YAML." Then a few months later they type `kubectl get postgresclusters` or `kubectl get certificates` and get an equally nice table back — except `PostgresCluster` and `Certificate` aren't things Kubernetes ships with. That's the moment you realize the API server was never hardcoded to know about Pods and Deployments specifically. It's a generic resource store with opinions, and you can teach it new nouns.

That's what a Custom Resource Definition (CRD) is: a new noun. And an Operator is the verb — the thing that actually does something when you create one.

## The part everyone skips: CRDs are just schemas

A CRD doesn't run any code. It's a declaration that tells the API server "here's a new resource type, here's its shape, please store it and validate it for me." That's it. If you `kubectl apply` a CRD and nothing else, you get a working CRUD API for free, backed by etcd, with kubectl support, RBAC, and audit logging — and absolutely zero behavior.

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: coffeemachines.snacks.example.com
spec:
  group: snacks.example.com
  names:
    kind: CoffeeMachine
    plural: coffeemachines
    singular: coffeemachine
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
                beansKg:
                  type: number
                grindLevel:
                  type: string
                  enum: ["coarse", "medium", "fine"]
```

Apply that, and `kubectl get coffeemachines` works. Create a `CoffeeMachine` object, and it just... sits there in etcd, fully validated, doing nothing. This is the part I wish someone had told me earlier — the schema and the behavior are two completely separate concerns. A lot of engineers assume a CRD is inherently "smart," and get confused when their shiny new resource doesn't actually provision anything until they write the controller for it.

## The Operator is the reconciliation loop, nothing more

An Operator is just a piece of software (usually running as a Deployment, in-cluster or out) that watches a resource type and drives the real world toward whatever the spec says. The core loop — reconciliation — is embarrassingly simple in concept:

1. Watch for changes to `CoffeeMachine` objects.
2. For each one, look at `spec` (desired state) and compare against the actual state of the world.
3. Take action to close the gap.
4. Write the result back to `status`.
5. Repeat forever, on a timer and on every change event.

No callbacks, no imperative "do this when that happens" — just a loop that keeps asking "is reality what the spec says it should be?" This is why operators are resilient to crashes and restarts in a way ad-hoc automation scripts aren't: if the operator pod dies mid-reconcile, it comes back, re-reads the spec, re-reads the actual state, and picks up exactly where an outside observer would expect. There's no "step 3 of 5" state to lose because there was never a linear script to begin with.

This is also why the good operators (cert-manager, the Postgres operators, Crossplane providers) are boring in the best way — they don't try to be clever, they just reconcile relentlessly and idempotently.

## Where teams actually get burned

At Cubet, we adopted an operator for managing ephemeral preview-environment databases — spin up a Postgres instance per pull request, tear it down on merge. It worked beautifully until someone manually ran `kubectl edit` on a database object to bump the storage size "just for testing." The operator's next reconcile loop saw that as drift from a stale desired state stored elsewhere in our GitOps pipeline, and quietly reverted it. Nobody could figure out why their manual change kept disappearing every 30 seconds.

The lesson: once something is operator-managed, treat the operator as the only writer, full stop. Manual `kubectl edit` on operator-owned resources is basically arm-wrestling a very persistent robot — you will lose, and it will not explain why.

```yaml
# The right way to change it: through the source of truth
apiVersion: postgres.example.com/v1
kind: PostgresCluster
metadata:
  name: pr-4821-preview
spec:
  storageGB: 20   # bump here, commit, let GitOps + operator do the rest
  instances: 1
```

The other classic gotcha is status subresources. If your CRD doesn't split `spec` and `status` into separate subresources, every controller that updates status also triggers a spec-watch event, and if you're not careful you get a reconcile loop that reconciles itself into existence — burning API server quota over nothing. Enabling the `status` subresource (`subresources: {status: {}}` in the CRD) is a one-line fix that a shocking number of first-time operator authors skip.

## Do you actually need to build one?

Almost certainly not from scratch. Before reaching for kubebuilder or the Operator SDK, ask whether a CRD-plus-controller pattern that already exists covers you — Crossplane for cloud resource provisioning, cert-manager for certificates, or even a simpler tool like a Helm chart with a post-render hook. Writing a correct, idempotent, crash-safe reconciliation loop is deceptively hard to get right the first three times. Operators are the right tool when you have a genuinely recurring lifecycle to manage (databases, certificates, multi-step provisioning) — not for "I wanted an excuse to write a controller."

If you do build one, start by reading the source of a well-regarded existing operator before writing your own reconcile function. You'll steal more good habits — status conditions, finalizers for cleanup, exponential backoff on requeue — than you'd invent on your own in a month.

Got a CRD/operator war story, or a "why did my resource keep reverting" mystery of your own? I'd genuinely like to hear it — drop it in the comments or find me on the socials linked below.
