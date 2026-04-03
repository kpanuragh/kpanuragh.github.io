---
title: "🐳 Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM"
date: 2026-04-03
excerpt: "Your cluster is running slow, nodes are OOMKilled at 3am, and nobody knows why. Spoiler: it's your pods with no resource limits set. Here's how to fix it before your on-call rotation turns into a nightmare."
tags: ["kubernetes", "devops", "docker", "cloud", "best-practices"]
featured: true
---

So there you are, proudly watching your shiny new Kubernetes cluster humming along in production. Everything looks great. Your deploy pipeline is green, the CEO is happy, and you're thinking about leaving early on a Friday.

Then it happens.

One pod decides it's hungry. Really hungry. It starts gobbling up memory like it hasn't eaten in weeks — because technically, *nobody told it not to*. Before you know it, the entire node is out of memory, the kubelet starts killing things indiscriminately, and you're getting paged at 3am wondering why the checkout service is down.

Welcome to the wild world of **Kubernetes resource limits** — the thing nobody tells you about until it's too late.

---

## Why Resource Limits Exist (And Why You're Probably Ignoring Them)

Kubernetes scheduling is smart. It places pods on nodes based on available resources. But here's the catch: by default, if you don't specify resource requests and limits, **Kubernetes assumes your pod needs nothing and can use everything**.

That's not a typo. Zero requests. Unlimited ceiling. Your pod is officially a resource anarchist.

This creates two separate problems:

1. **Scheduling chaos** — The scheduler has no idea where to put your pod, so it just... guesses.
2. **The noisy neighbor problem** — One misbehaving service can starve every other pod on the same node.

The good news? Fixing this is straightforward. The bad news? You have to actually do it for every workload.

---

## Requests vs. Limits: The Critical Distinction

Before diving into code, let's get the terminology straight — because mixing these up is how senior engineers end up debugging at midnight.

**Requests** = what Kubernetes *guarantees* your pod. The scheduler uses this to decide which node gets the pod.

**Limits** = the *maximum* your pod can consume. If it tries to go over the CPU limit, it gets throttled. If it exceeds the memory limit, it gets OOMKilled (killed by the Out Of Memory manager).

Think of it like a restaurant: requests are the table reservation, limits are the fire code capacity.

Here's a solid, production-ready deployment example:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
        - name: api-service
          image: my-org/api-service:v1.2.3
          resources:
            requests:
              memory: "128Mi"
              cpu: "250m"
            limits:
              memory: "256Mi"
              cpu: "500m"
```

Notice the `cpu: "250m"` — that's 250 millicores, or 25% of a single CPU core. Kubernetes CPU is measured in millicores where 1000m = 1 full core. Memory uses standard binary units: Mi, Gi, etc.

**Rule of thumb:** set your limit at roughly 2x your request. This gives your pod breathing room during traffic spikes without letting it go completely feral.

---

## LimitRanges: Set Namespace-Wide Defaults So You Don't Forget

Here's a dirty secret: you *will* forget to set resource limits on some deployment. It will happen. The solution is to make the safe thing the default thing.

Enter `LimitRange` — a Kubernetes object that applies default resource constraints to every pod in a namespace that doesn't specify its own:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - default:
        cpu: "500m"
        memory: "256Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      type: Container
```

Drop this into every namespace and sleep easier knowing that even the pod you forgot to configure won't take down your cluster. It's like a speed limiter on a rental car — protects everyone involved.

---

## Real-World Lessons Learned (The Hard Way)

**Lesson 1: Don't set CPU limits too tight.**
CPU throttling is silent and insidious. Your pod won't crash — it'll just run slowly, and your p99 latency will creep up until users start complaining. Monitor CPU throttling with the `container_cpu_cfs_throttled_seconds_total` Prometheus metric. If that number is climbing, your limits are too low.

**Lesson 2: Memory limits, on the other hand, should be tight.**
OOMKilled pods restart automatically. A pod slowly leaking memory and consuming 10x its fair share does not. Set memory limits conservatively, let the OOM killer do its job, and fix your memory leaks like a responsible adult.

**Lesson 3: Your Java apps are lying to you.**
JVM-based services are notorious for this. The JVM heap doesn't reflect the full process memory usage — native memory, metaspace, and thread stacks all add up. A service configured with `-Xmx512m` might actually need 750Mi or more at the container level. Always profile first, then set limits.

**Lesson 4: Vertical Pod Autoscaler is your friend.**
If you're unsure what limits to set, use the [Vertical Pod Autoscaler (VPA)](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) in recommendation mode. It watches your pods and tells you what they actually use. No guessing required.

---

## Quick Checklist Before You Ship

Before your next deployment goes to production, run through this:

- [ ] Every container has `resources.requests` set
- [ ] Every container has `resources.limits` set
- [ ] Your namespace has a `LimitRange` as a safety net
- [ ] You've checked CPU throttling metrics after deploying
- [ ] Memory limits are based on profiling, not vibes

---

## The Takeaway

Resource limits aren't optional in production Kubernetes — they're table stakes. Without them, you're one runaway process away from a full cluster incident. With them, Kubernetes can schedule intelligently, protect your workloads from each other, and let you sleep through the night.

Set your requests. Set your limits. Add a `LimitRange` to your namespaces. Profile before you guess.

Your future on-call self will thank you.

---

**Got burned by a resource limit disaster story?** Drop it in the comments — the community learns best from the war stories we share. And if this post saved your cluster (or your weekend), share it with someone who still doesn't have limits set. You know who they are.
