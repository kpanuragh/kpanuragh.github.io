---
title: "Kubernetes Resource Limits: Stop One Greedy Pod From Eating Your Entire Cluster 🐳💀"
date: "2026-03-13"
excerpt: "No resource limits in Kubernetes? One memory leak will take down your entire cluster. I learned this the hard way at 2 AM. Here's how to set requests and limits so your pods play nice with each other."
tags: ["\\\"devops\\\"", "\\\"kubernetes\\\"", "\\\"docker\\\"", "\\\"deployment\\\""]
featured: "true"
---

# Kubernetes Resource Limits: Stop One Greedy Pod From Eating Your Entire Cluster 🐳💀

**2:17 AM. PagerDuty fires.**

```
ALERT: Production cluster is unresponsive
ALERT: 14 pods in CrashLoopBackOff
ALERT: API response time > 30s
ALERT: Users screaming on Twitter
```

I open my laptop in bed, still half asleep. SSH into the cluster. Run `kubectl top nodes`. Every node is at **100% memory**.

The culprit? One tiny background job with a memory leak. No resource limits set. It ate all available RAM across 3 nodes, starving every other pod until they OOM-killed themselves.

**Cost: 47 minutes of downtime. Root cause: 4 missing lines of YAML.**

Welcome to Kubernetes resource management — the thing nobody teaches you until your cluster is on fire.

## The Problem: Kubernetes Is Optimistic by Default 🙃

When you create a pod without resource specs, Kubernetes thinks:

> "Sure, this container can use whatever resources it wants! I trust you bro!"

Which sounds fine until that container has a bug, a traffic spike, or just is Java.

```yaml
# The "YOLO" deployment (don't do this)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          # No resources defined = unlimited appetite 🍕🍕🍕
```

That `my-app` container? It can consume every byte of RAM on the node. All 64GB. Then the next pod tries to start, finds nothing, and crashes. Then Kubernetes tries to reschedule it. It crashes again. Repeat forever. 🔄

**This is called a noisy neighbor problem**, and it will ruin your weekend.

## Requests vs. Limits: The Crucial Difference 🎯

Before we fix it, let's understand the two knobs:

| | **Requests** | **Limits** |
|---|---|---|
| What it means | "I need AT LEAST this much" | "I must NEVER exceed this much" |
| Used for... | Pod scheduling decisions | Runtime enforcement |
| If exceeded... | N/A (it's a minimum) | Container gets throttled (CPU) or killed (memory) |

**Think of it like a hotel:**
- **Request** = You book a room (the hotel guarantees this space for you)
- **Limit** = The room has a maximum occupancy (you can't bring 50 people into a studio)

```yaml
# The "I am a responsible adult" deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          resources:
            requests:
              memory: "128Mi"   # Schedule me on a node with at least 128MB free
              cpu: "250m"       # Reserve 0.25 cores for me
            limits:
              memory: "256Mi"   # Kill me if I try to use more than 256MB
              cpu: "500m"       # Throttle me if I exceed 0.5 cores
```

Four lines of YAML. Your cluster just became dramatically more stable. You're welcome.

## How Kubernetes Actually Schedules With Requests 🗓️

Here's the part that trips people up: **Kubernetes uses REQUESTS for scheduling, not actual usage**.

Imagine a node with 4GB RAM:

```
Node memory: 4GB

Pod A requests: 1GB   → Scheduled ✅ (3GB remaining)
Pod B requests: 2GB   → Scheduled ✅ (1GB remaining)
Pod C requests: 1GB   → Scheduled ✅ (0GB remaining)
Pod D requests: 512MB → PENDING ❌ (Not enough "reserved" space)
```

Even if Pods A, B, and C are only actually using 500MB combined, Pod D can't schedule because the **reserved** capacity is full.

This is why setting requests TOO HIGH is also a problem — you'll have nodes with 70% free RAM that Kubernetes refuses to use because they're "full" on paper.

**The golden rule:** Set requests to your typical/average usage, set limits to your maximum acceptable usage.

## Real-World Configuration That Doesn't Suck 💪

### For a Node.js API Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-api
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: node-api
  template:
    metadata:
      labels:
        app: node-api
    spec:
      containers:
        - name: node-api
          image: my-node-api:v1.2.3
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"    # Node.js idle usage
              cpu: "100m"        # 0.1 cores at idle
            limits:
              memory: "512Mi"    # OOM kill if exceeded (catches leaks!)
              cpu: "1000m"       # 1 full core max
          # Readiness probe so traffic only hits healthy pods
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          # Liveness probe to restart truly dead pods
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 3
```

**Why these numbers?**
- Requests are conservative (what it needs at baseline)
- Memory limit is 4x the request (room to breathe under load)
- CPU limit is 10x the request (CPU throttling is better than OOMKill)

### Enforce Limits for an Entire Namespace with LimitRange

Tired of developers forgetting to set limits? Force it:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:          # Applied if a container has NO limits defined
        memory: "256Mi"
        cpu: "500m"
      defaultRequest:   # Applied if a container has NO requests defined
        memory: "64Mi"
        cpu: "100m"
      max:              # No container can exceed this
        memory: "2Gi"
        cpu: "2000m"
      min:              # No container can go below this
        memory: "32Mi"
        cpu: "50m"
```

Apply this to your namespace and every container gets sensible defaults. Even the ones that "forgot" to set resources.

**It's like a safety net for your colleagues.** (Or for yourself at 3 AM when you're rushing a hotfix.)

## The Mistake That Took Down My Cluster: A Post-Mortem 🔥

Back to that 2 AM incident. Here's what happened, step by step:

```
Timeline:
22:00 - Background job deployed (no resource limits, had a memory leak)
22:30 - Job using 200MB RAM (normal startup, nobody notices)
23:00 - Job using 800MB RAM (leak growing, still no alerts)
00:30 - Job using 2.1GB RAM (Kubernetes starts evicting OTHER pods to make room)
01:00 - Evicted pods can't reschedule (all nodes filling up)
02:00 - Job using 5.8GB RAM, all 3 nodes at 100% memory
02:17 - PagerDuty fires, everything is dead
02:20 - I add limits to the deployment, job gets OOM-killed
02:24 - Cluster recovers, pods reschedule successfully
02:30 - I add LimitRange to the namespace
02:31 - I question my career choices
```

**The fix was trivial.** The damage was 47 minutes of downtime and one very tired engineer.

If we'd had a memory limit of `512Mi` on that job, Kubernetes would have OOM-killed just that one container at 22:30. Nobody would have noticed. No incident. No pager. Full night of sleep.

**One pod should never be able to take down your entire cluster. Resource limits prevent this.**

## Monitoring: Know When You're About to Run Out 📊

Set limits AND monitor them. Use `kubectl top` to spot problems early:

```bash
# See resource usage by pod
kubectl top pods -n production

# See resource usage by node
kubectl top nodes

# Find pods using more than 80% of their memory limit
kubectl top pods -n production --sort-by=memory | head -20

# Get pods with no resource limits (the chaos agents)
kubectl get pods -n production -o json | \
  jq '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'
```

That last command? **Run it right now.** If it returns pod names, those pods are ticking time bombs. Go add limits.

## CPU vs. Memory: They Behave Very Differently ⚠️

This catches people off guard:

**CPU limits:** Exceeded → Container gets **throttled** (slowed down)
```
Pod requests 500m CPU, uses 800m → Kubernetes throttles it to 500m
Result: App runs slower, but doesn't crash
```

**Memory limits:** Exceeded → Container gets **OOMKilled** (killed immediately)
```
Pod limit is 256Mi, uses 257Mi → Container is killed, restarts
Result: App restarts (potential data loss, dropped requests)
```

This means:
- **Set memory limits conservatively** — a limit that's too low causes crashes
- **Set CPU limits generously** — being throttled is better than being killed
- **Set memory limits, always** — an unbounded memory leak will kill your cluster

A common pattern is to set CPU limits at 4-10x the request, but memory limits at 2-3x the request:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"    # 2x request — tight, catches leaks
    cpu: "1000m"       # 10x request — generous, avoids throttling
```

## ResourceQuota: The Nuclear Option for Namespaces 🚀

Want to prevent a team from accidentally bankrupting your cluster? Set a quota:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-alpha
spec:
  hard:
    requests.cpu: "4"        # Max 4 cores total requested by this namespace
    requests.memory: "8Gi"   # Max 8GB total requested
    limits.cpu: "8"          # Max 8 cores total limits
    limits.memory: "16Gi"    # Max 16GB total limits
    pods: "20"               # Max 20 pods
    persistentvolumeclaims: "5"
```

Now Team Alpha cannot consume more than 16GB of RAM across their entire namespace, no matter what they deploy. **Multi-tenant clusters suddenly become a lot more predictable.**

## The Bottom Line 💡

Kubernetes resource limits are not optional. They are the seatbelt of container orchestration. You might drive for years without needing them, and then one day a memory leak happens, and without limits, you're going through the windshield.

**The checklist before any production deployment:**

1. ✅ Set `resources.requests` on every container
2. ✅ Set `resources.limits` on every container
3. ✅ Apply a `LimitRange` to every namespace (catch forgotten limits)
4. ✅ Set `ResourceQuota` for shared/team namespaces
5. ✅ Monitor with `kubectl top` or Prometheus/Grafana
6. ✅ Set up alerts for pods using >80% of their memory limit

Five minutes of YAML now vs. a 3 AM incident later. The math is simple.

## Your Action Plan 🚀

**Right now (5 minutes):**
```bash
# Find pods with no limits in production
kubectl get pods -n production -o json | \
  jq -r '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'
```

**Today:**
1. Add resource limits to any pods the above command returned
2. Apply a `LimitRange` to your production namespace

**This week:**
1. Review your requests vs. actual usage (`kubectl top pods`)
2. Tune limits based on real data, not guesses
3. Set up memory usage alerts

Your future self, sleeping soundly through the night, will thank you. 🛌

---

**Had a cluster meltdown caused by runaway resources?** Share your horror story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company, and we all learn from each other's 2 AM incidents.

**Want to dive deeper?** Check out my [GitHub](https://github.com/kpanuragh) for real Kubernetes manifests from real production deployments.

*Now go add those limits before PagerDuty adds them for you.* 🐳⚡
