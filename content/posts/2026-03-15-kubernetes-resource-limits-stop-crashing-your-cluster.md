---
title: "Kubernetes Resource Limits: Stop Letting One Pod Crash Your Entire Cluster"
date: "2026-03-15"
excerpt: "That one microservice eating all your CPU? Yeah, it's taking down everything else too. Here's how Kubernetes resource limits save your cluster from itself."
tags: ["\"kubernetes\"", "\"devops\"", "\"docker\"", "\"infrastructure\"", "\"cloud\""]
featured: "true"
---

# Kubernetes Resource Limits: Stop Letting One Pod Crash Your Entire Cluster

Picture this: it's 2 AM, your phone is exploding with PagerDuty alerts, and your entire Kubernetes cluster is on its knees. You scramble to check the dashboard and discover... it was the image-resizing microservice. The one that "just processes a few thumbnails." It somehow consumed every CPU core on a 16-node cluster and took down your payment service, your API gateway, and your database connection pool along with it.

This is a story as old as Kubernetes itself. And it's entirely preventable.

## Why Your Pods Are Terrible Neighbors

In a Kubernetes cluster, pods share physical resources on the same nodes. Without limits, any pod can consume as much CPU and memory as it wants — which means one rogue service can starve every other workload running alongside it.

It's like living in an apartment with no rules, and your roommate decides to run a cryptocurrency mining rig. In the kitchen. Using all the outlets.

Kubernetes gives you two levers to prevent this: **requests** and **limits**.

- **Requests**: The amount of CPU/memory Kubernetes *guarantees* your pod. Used for scheduling decisions.
- **Limits**: The hard ceiling your pod can never exceed. Cross it, and Kubernetes gets... firm.

## The Configuration That Will Save You

Here's a real-world resource spec for a Node.js API service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: user-api
          image: myapp/user-api:v2.1.0
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

What's happening here:
- **100m CPU** requested = 0.1 cores guaranteed for scheduling
- **500m CPU** limit = hard cap at half a core
- **128Mi memory** requested = scheduling guarantee
- **512Mi memory** limit = exceed this and your pod gets OOMKilled (and honestly, it deserves it)

The golden rule: **always set requests lower than limits**, and always set both. A pod without limits is a liability.

## The Sneaky Part: CPU vs Memory Limits Behave Differently

Here's where people get surprised. CPU and memory limits aren't enforced the same way:

**CPU limits** are *throttled*. If your pod tries to use more CPU than its limit, it gets throttled — it slows down but keeps running. Annoying, but survivable.

**Memory limits** are *enforced with death*. Exceed your memory limit and Kubernetes will OOMKill your pod without warning. No graceful shutdown. No goodbye. Just `OOMKilled` in your pod events and a very confused developer.

This is why memory leaks in production are extra fun in Kubernetes — you'll see your pod restarting every few hours and wondering why. Check your events:

```bash
kubectl describe pod user-api-7d9f8b-xkq2p | grep -A5 "Last State"
```

If you see `OOMKilled`, your memory limit is too low, or you have a leak. Probably both.

## LimitRange: Enforce Sanity Cluster-Wide

Setting limits on every deployment manually is fine until you have 40 services and a developer who skips the docs. Enter `LimitRange` — a namespace-level policy that sets defaults and enforces min/max constraints:

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
        cpu: "200m"
      defaultRequest:
        memory: "64Mi"
        cpu: "50m"
      max:
        memory: "2Gi"
        cpu: "2000m"
      min:
        memory: "16Mi"
        cpu: "10m"
```

Now even the dev who rage-deployed at 4 PM on a Friday without reading the runbook gets sane defaults. The `max` field is particularly useful — it stops someone from accidentally requesting 64Gi of RAM because they copy-pasted the wrong value.

Apply it once per namespace and sleep better.

## Real Lessons From Painful Incidents

**Lesson 1: Start with generous limits, then tighten.** It's tempting to guess at 50m CPU and call it done. Don't. Run your service under realistic load, check `kubectl top pods`, then set limits at roughly 2-3x your observed peak. Leave room for spiky traffic.

**Lesson 2: Don't set CPU limits on latency-sensitive services.** Controversial opinion: CPU throttling from limits can actually *increase* tail latency. For services where p99 response time matters, consider skipping CPU limits (but still set memory limits, always). Use node autoscaling to handle growth instead.

**Lesson 3: ResourceQuota at the namespace level is your friend.** `LimitRange` handles per-pod limits, but `ResourceQuota` caps the *total* resources a namespace can consume. This is how you stop one team's namespace from eating the whole cluster.

**Lesson 4: Monitor OOMKills proactively.** Don't wait for alerts. Set up a simple query in your metrics stack to alert on `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} > 0`. Make it page. It's always worth investigating.

## The 5-Minute Fix

If you're reading this because something is on fire right now, here's the triage checklist:

1. `kubectl top nodes` — see which nodes are resource-pressured
2. `kubectl top pods -A --sort-by=memory` — find the memory hogs
3. `kubectl describe pod <hungry-pod>` — look for OOMKilled or CPU throttling
4. Add limits to the offending deployment, redeploy
5. Add a `LimitRange` to the namespace so this doesn't happen again

## The Takeaway

Kubernetes resource limits aren't optional configuration — they're the contract between your services and your infrastructure. Without them, you're running a shared cluster on the honor system, and production doesn't care about honor.

Set requests so your scheduler can make good decisions. Set limits so one bad deploy doesn't take down your entire platform. Add a `LimitRange` so future-you doesn't have to rely on past-you having been disciplined.

Your on-call rotation will thank you. Your SLAs will thank you. And the image-resizing microservice, wherever it is now, will be contained to exactly the resources it actually needs.

---

**Start simple:** add resource limits to your three most critical services today. Check `kubectl top pods` after a week of production traffic, then tune from there. Perfection is the enemy of "not getting paged at 2 AM."

What's your worst "pod ate the cluster" story? Drop it in the comments — misery loves company, and we all learn from production incidents.
