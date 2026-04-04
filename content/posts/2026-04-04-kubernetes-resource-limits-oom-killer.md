---
title: "🔪 Why Kubernetes Keeps Killing Your Pods (And How to Stop It)"
date: 2026-04-04
excerpt: "Your pods are vanishing into thin air, your logs say OOMKilled, and your on-call rotation is a nightmare. Let's fix that — with resource limits you'll actually understand."
tags: ["kubernetes", "devops", "docker", "containers", "k8s"]
featured: true
---

# 🔪 Why Kubernetes Keeps Killing Your Pods (And How to Stop It)

You push a new deployment. Everything looks fine. You grab coffee. You come back and half your pods are gone — replaced by fresh ones still pulling their images. You check the events log and see the two words that haunt every backend engineer's dreams:

**OOMKilled.**

The OOM (Out of Memory) Killer is the Linux kernel's nuclear option: when memory gets tight, it picks a process and terminates it with extreme prejudice. In Kubernetes, that process is your pod. And if you haven't set resource limits properly, you're basically inviting the OOM Killer over for dinner every night.

Let's fix this, once and for all.

---

## The Crime Scene: What OOMKilled Actually Means

When Kubernetes schedules a pod onto a node, it makes a deal: "you can use up to *this much* memory." If your container exceeds that limit, the kernel drops the hammer. No warnings, no graceful shutdown — just gone.

The frustrating part? The default behavior in many clusters is to set **no limits at all**, which means your noisy Node.js app from 2019 can quietly hoover up all available RAM on a node and take down everything else running beside it. Fun times.

Here's what a typical OOM event looks like in `kubectl describe pod`:

```
Last State:     Terminated
  Reason:       OOMKilled
  Exit Code:    137
  Started:      Fri, 04 Apr 2026 09:12:03 +0000
  Finished:     Fri, 04 Apr 2026 09:14:47 +0000
```

Exit code 137 is your smoking gun: `128 + 9` (SIGKILL). The kernel didn't ask permission.

---

## The Fix: Setting Requests and Limits (And Understanding the Difference)

This is where most tutorials lose people, so let's be clear:

- **Requests** = what Kubernetes *reserves* for your pod during scheduling. The node must have at least this much free.
- **Limits** = the hard ceiling. Cross it and you get killed (memory) or throttled (CPU).

Here's a sane baseline for a typical Node.js or Python API service:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: my-api
          image: my-api:latest
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
```

A few things to notice:
- CPU is measured in millicores (`100m` = 0.1 of a CPU core)
- Memory uses binary suffixes: `Mi` (mebibytes) not `MB` (megabytes) — yes, these are different, yes, it matters
- The limit is set to 2× the request here — a common starting ratio that gives headroom without letting a single pod go rogue

**Real lesson learned the hard way:** Setting requests too low causes your pod to get scheduled onto nodes that don't actually have the resources it needs. Setting limits too low causes constant OOMKills. You want requests to reflect your *steady-state* usage and limits to cover your *peak* usage. Profile first, configure second.

---

## Vertical Pod Autoscaler: Let Kubernetes Figure It Out

If you genuinely don't know what your app needs (and that's okay — you can't always know without production traffic), the **Vertical Pod Autoscaler (VPA)** can recommend or automatically set resource values based on real usage.

Run it in recommendation mode first — it watches your pods and suggests values without touching anything:

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-api
  updatePolicy:
    updateMode: "Off"  # "Off" = recommendations only, no auto-updates
```

After a few hours of traffic, check the recommendations:

```bash
kubectl describe vpa my-api-vpa
```

You'll see something like:

```
  Recommendation:
    Container Recommendations:
      Container Name:  my-api
        Lower Bound:
          Cpu:     50m
          Memory:  105728Ki
        Target:
          Cpu:     100m
          Memory:  131072Ki
        Upper Bound:
          Cpu:     300m
          Memory:  262144Ki
```

Now you have real data to set your limits. No more guessing.

---

## LimitRange: The Safety Net You Forgot to Set

Even if *you* remember to set resource limits, what about the junior dev who just joined last week? Or the Helm chart you grabbed from GitHub without reading every line?

`LimitRange` lets you define defaults and maximums at the namespace level. Any pod without explicit limits gets the defaults automatically:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:
        memory: "256Mi"
        cpu: "250m"
      defaultRequest:
        memory: "128Mi"
        cpu: "100m"
      max:
        memory: "1Gi"
        cpu: "2"
```

This is the kind of thing you set once and forget about — until it silently saves you from a runaway pod eating your entire node's memory at 3 AM.

---

## Lessons From the Trenches

After running production Kubernetes clusters for a while, a few hard-won lessons stick around:

**1. OOMKilled is often a memory leak, not a limit problem.** If your app keeps getting killed even with generous limits, profile it. `kubectl top pod` and memory profiling tools are your friends. Throwing more memory at a leak just delays the inevitable.

**2. CPU throttling is the sneaky villain.** Unlike OOMKills, CPU throttling doesn't terminate your pod — it just makes it slower. Your latency p99 goes up, users notice, and nothing in your logs explains why. Use `container_cpu_throttled_seconds_total` in Prometheus to catch it.

**3. Namespace-level ResourceQuota is your budget.** Set a `ResourceQuota` on production namespaces so one team's memory-hungry service can't accidentally starve another's. Treat it like a spending cap on a corporate card.

---

## Your Next Steps

The OOM Killer doesn't have to be your enemy. With the right resource configuration, it becomes a last-resort failsafe you never actually trigger.

**This week:**
1. Run `kubectl top pods --all-namespaces` and find your top memory consumers
2. Check which pods have no resource limits (`kubectl get pods -o json | jq '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'`)
3. Add a `LimitRange` to your most critical namespaces

The goal isn't to perfectly predict your app's resource usage from day one. It's to have guardrails so that when something goes wrong, the blast radius is contained to one pod — not your entire node.

Now go forth and configure. Your on-call rotation will thank you. 🎉
