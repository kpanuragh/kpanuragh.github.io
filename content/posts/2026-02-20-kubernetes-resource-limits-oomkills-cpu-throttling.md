---
title: "Kubernetes Resource Limits: Stop Letting OOMKills Ruin Your Friday Night 💀🔪"
date: "2026-02-20"
excerpt: "Your pod randomly dies at 2 AM and you have no idea why? After getting paged at 3 AM more times than I care to admit, I finally learned how Kubernetes resource requests and limits work - and why getting them wrong will destroy your cluster (and your sleep)."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting OOMKills Ruin Your Friday Night 💀🔪

**True story:** I once had a Node.js service that worked perfectly for months. Then one random Tuesday at 2:47 AM, PagerDuty went off. Pod dead. Restarted. Dead again. I stared at the logs bleary-eyed and saw:

```
OOMKilled
Exit Code: 137
Last State: Terminated (OOMKilled)
```

I Googled "OOMKilled" half-asleep. Found out my pod was eating more RAM than Kubernetes had allocated for it, so the kernel just... murdered it. Like a bouncer throwing out a drunk at closing time. 🪓

**The culprit?** I had set `memory: "128Mi"` on a Node.js app that needed at least 512Mi to breathe. I'd guessed the limit. I was wrong. My users got errors. I lost sleep.

Welcome to the most underrated topic in Kubernetes: **resource requests and limits**.

## Requests vs. Limits: The Crucial Difference 🤔

This trips up almost everyone. They sound similar but work completely differently:

- **Request**: "I need *at least* this much to start." — Used for scheduling (where Kubernetes places your pod)
- **Limit**: "I am *not allowed* to exceed this." — Enforced at runtime (what happens if you try)

```yaml
resources:
  requests:
    memory: "256Mi"   # Kubernetes reserves this on the node
    cpu: "250m"       # 250 millicores = 0.25 CPU cores
  limits:
    memory: "512Mi"   # Kill the pod if it goes over this
    cpu: "500m"       # Throttle the pod if it goes over this
```

The sneaky detail: **CPU and memory behave completely differently when you hit the limit.**

- **Hit CPU limit?** Your pod gets *throttled*. It slows down, like a car with the governor kicking in. It keeps running, just slower.
- **Hit memory limit?** Your pod gets *killed*. OOMKill. No warning. No grace period. Just dead. 💀

This is why memory limits are the 2 AM pager call and CPU limits are the "why is my API so slow today" ticket.

## The OOMKill Horror Story (And How to Fix It) 🔥

Here's a real scenario. You deploy a Spring Boot app with whatever limits you guessed:

```yaml
# The "I just copied this from Stack Overflow" config
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "200m"
```

Spring Boot's JVM alone wants ~300MB before your app even loads. The pod starts, gets to 256Mi, and the kernel drops it like a hot potato. Kubernetes restarts it. It gets to 256Mi again. Restart. Repeat. Forever.

This is a **CrashLoopBackOff** — Kubernetes' way of saying "I keep trying but this thing keeps dying, so I'm slowing down my retry attempts."

```bash
$ kubectl get pods
NAME                    READY   STATUS             RESTARTS   AGE
myapp-7d9f6b-xkj2p     0/1     CrashLoopBackOff   8          12m
```

**How to find the right limits:**

Don't guess. Measure.

```bash
# Watch live resource usage for all pods in a namespace
kubectl top pods -n production

# Check what killed your pod
kubectl describe pod myapp-7d9f6b-xkj2p | grep -A5 "Last State"

# Get memory usage over time (if you have metrics-server installed)
kubectl top pod myapp-7d9f6b-xkj2p --containers
```

Run your app under realistic load, observe actual usage, then set limits at ~1.5–2x the observed peak. Leave headroom for spikes — your app doesn't always behave the same way at 2 AM as it does during your load test.

## CPU Throttling: The Silent Performance Killer ⚙️

OOMKills are dramatic and obvious. CPU throttling is the sneaky villain — your pod stays alive but mysteriously gets slow and your latency graphs look like a mountain range.

Here's the problem with CPU limits:

```yaml
resources:
  limits:
    cpu: "200m"  # 0.2 cores — seems reasonable?
```

If your app has a spike — a database query that takes longer than usual, a GC pause, a burst of traffic — it gets throttled hard. Your p99 latency explodes. Users notice. You look at your dashboards confused because CPU usage looks fine (it's being artificially capped).

**The controversial take:** Many experienced Kubernetes operators **don't set CPU limits at all** for most services. They only set CPU *requests* (which control scheduling) and let pods burst freely on CPU.

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"    # Only request — no CPU limit!
  limits:
    memory: "512Mi"  # Keep memory limit (OOMKills are worse than throttling)
```

This is called **Burstable** QoS (Quality of Service). Your pod can use idle CPU from other nodes. If CPU contention is high, Kubernetes will proportion CPU fairly based on requests. It's usually the right call for latency-sensitive services.

**When to set CPU limits:**
- Batch jobs that shouldn't starve other workloads
- Noisy neighbor situations where one service is consuming all available CPU
- Strict multi-tenant environments

## Setting Limits That Don't Suck: A Practical Workflow 🎯

Here's the process I now use before every production deployment:

**Step 1: Deploy without limits first (in staging)**

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "50m"
  # No limits — measure first!
```

**Step 2: Hammer it with realistic load**

```bash
# Using k6 for load testing
k6 run --vus 100 --duration 5m load-test.js
```

**Step 3: Check what it actually used**

```bash
kubectl top pods -n staging --sort-by=memory
```

**Step 4: Set limits with headroom**

```yaml
# Observed peak: 310Mi memory, 180m CPU
resources:
  requests:
    memory: "256Mi"   # Slightly below peak (scheduler hint)
    cpu: "150m"       # Realistic steady-state usage
  limits:
    memory: "512Mi"   # ~1.6x peak (room for spikes)
    # No CPU limit — let it burst
```

**Step 5: Add a Vertical Pod Autoscaler recommendation (if available)**

```bash
kubectl apply -f - <<EOF
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Off"   # Recommendation only, don't auto-apply yet
EOF

# After a day, check what VPA recommends
kubectl describe vpa myapp-vpa
```

VPA watches your actual usage and tells you what the right limits should be. It's like having a DevOps consultant who never sleeps.

## The QoS Classes: Kubernetes' Eviction Priority 🏆

Here's something most people don't know: the combination of your requests and limits determines your pod's **QoS class**, which determines who gets killed first when a node runs out of memory.

**Guaranteed** (safest — last to be evicted):
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "512Mi"   # requests == limits
    cpu: "500m"
```

**Burstable** (middle tier):
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"   # limits > requests
```

**BestEffort** (first to die — no requests or limits set):
```yaml
# No resources block at all
# Kubernetes will evict these first under pressure
```

For your production database or critical API: aim for Guaranteed. For background workers that can restart: Burstable is fine. BestEffort is basically "please kill me whenever convenient" — only use it for truly disposable workloads.

## Real-World Lessons Learned (The Hard Way) 📖

**Lesson 1: JVM apps lie about their memory needs.**

The JVM pre-allocates heap. A Spring Boot app with `-Xmx256m` will actually use 400–500Mi total (heap + metaspace + native memory). Always add 200–300Mi on top of your `-Xmx` setting.

**Lesson 2: Node.js has a default 1.5GB V8 heap limit.**

If you set a memory limit below that, Node.js will happily try to use more than you've allocated and get OOMKilled. Set `--max-old-space-size` explicitly:

```yaml
command: ["node", "--max-old-space-size=400", "dist/index.js"]
resources:
  limits:
    memory: "512Mi"  # Node heap capped at 400Mi, total headroom at 512Mi
```

**Lesson 3: Init containers need their own limits.**

People forget that init containers run before your main container and also consume resources. If your init container (e.g., running database migrations) OOMKills, your pod never starts.

```yaml
initContainers:
  - name: run-migrations
    image: myapp:latest
    command: ["node", "migrate.js"]
    resources:
      requests:
        memory: "128Mi"
      limits:
        memory: "256Mi"
```

**Lesson 4: LimitRange can save your cluster from rogue deployments.**

Set defaults at the namespace level so poorly configured pods don't go wild:

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
        cpu: "500m"
      defaultRequest:
        memory: "128Mi"
        cpu: "100m"
      max:
        memory: "2Gi"
        cpu: "2"
```

Now any container without explicit resources gets sane defaults. No more BestEffort pods sneaking into production.

## The Quick Reference Cheat Sheet 📋

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `OOMKilled` / Exit 137 | Memory limit too low | Raise `limits.memory` |
| `CrashLoopBackOff` | OOMKill on startup | Raise limits + check JVM/Node settings |
| High p99 latency | CPU throttling | Remove CPU limit or raise it |
| Pod pending forever | Requests too high, no node fits | Lower `requests` or add nodes |
| Pod evicted randomly | Node memory pressure, low QoS | Raise requests = limits (Guaranteed) |

## Your Action Plan 🚀

**Today:**
1. Run `kubectl top pods -n production` and see what your pods actually use
2. Find any pod with no resource limits: `kubectl get pods -o json | jq '.items[] | select(.spec.containers[].resources == {})'`
3. Fix the worst offenders

**This week:**
1. Add a `LimitRange` to each namespace
2. Set up Vertical Pod Autoscaler in recommendation mode
3. Document your sizing decisions so future-you isn't debugging blindly at 2 AM

**This month:**
1. Build a runbook: "What to do when OOMKill hits"
2. Add resource metrics to your dashboards (Grafana + kube-state-metrics)
3. Review limits quarterly as your app's usage patterns change

---

Kubernetes won't hold your hand when it comes to resource sizing — but get it right and your cluster hums along beautifully. Get it wrong and you'll be reading "OOMKilled" by flashlight at 3 AM wondering where your Friday night went.

Been there. Set better limits. Slept better. 🛌

**Have a war story about OOMKills or CPU throttling?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company, and I have opinions about JVM memory configuration.

**Want to see production-ready Kubernetes manifests?** Check out my [GitHub](https://github.com/kpanuragh) for real-world examples with proper resource configs.

*Now go check your limits before they check you.* ⚙️💀✨
