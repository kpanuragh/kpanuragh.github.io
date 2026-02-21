---
title: "Kubernetes Resource Limits: Stop Crashing Your Nodes at 3 AM 💥🐳"
date: "2026-02-21"
excerpt: "Your pods keep getting OOMKilled and nodes go NotReady at the worst possible moment? After debugging too many production meltdowns, I learned that resource requests and limits aren't optional - they're survival skills."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Crashing Your Nodes at 3 AM 💥🐳

**True story:** It was 3:17 AM. My phone was buzzing off the nightstand. PagerDuty. Again.

I stumbled to my laptop, bleary-eyed, to find half our Kubernetes cluster in a death spiral. Pods evicted. Nodes NotReady. The monitoring dashboard looked like a Jackson Pollock painting — red everywhere.

Root cause? Our shiny new data-processing service had **no resource limits**. A traffic spike caused it to eat every byte of memory on three nodes, which then took down every OTHER service on those nodes too. One greedy pod. Thirty minutes of downtime. My dignity: gone. ☠️

Welcome to Kubernetes resource management — the thing nobody explains properly until you've already wrecked production.

## The Problem: Kubernetes Is Sharing Economy Gone Wrong 🏠

Kubernetes nodes are like shared apartments. Multiple pods (tenants) live on each node (apartment building). Without rules, that one loud neighbor will blast music at 3 AM, run the AC at full blast, and hog all the parking spots.

Resource requests and limits are your apartment rules:
- **Requests** = minimum resources your pod *needs* (used for scheduling)
- **Limits** = maximum resources your pod *can use* (enforced at runtime)

```yaml
resources:
  requests:
    memory: "256Mi"  # "I need at least this much"
    cpu: "250m"      # "Schedule me somewhere with this available"
  limits:
    memory: "512Mi"  # "Cut me off here, no exceptions"
    cpu: "500m"      # "Throttle me if I go over this"
```

**Without these?** Your pod is that nightmare tenant who just moves in and takes whatever they want. The cluster scheduler is basically flying blind.

## CPU vs Memory: They're Not the Same Beast 🧠

Here's something that trips up everyone:

**CPU is compressible.** If your pod hits its CPU limit, Kubernetes *throttles* it — slows it down. Annoying, but survivable. Your pod keeps running, just slower.

**Memory is NOT compressible.** If your pod hits its memory limit, Kubernetes sends it to the shadow realm — **OOMKilled**. Instant death. No warning. Exit code 137. Your logs end mid-sentence.

```bash
# The most dreaded kubectl output
kubectl get pods
NAME                    READY   STATUS      RESTARTS   AGE
api-server-7d9f8b-xkp2  0/1     OOMKilled   14         2h

# 14 restarts. Pod is in a death loop.
# Someone's getting paged tonight.
```

**Lesson I learned the hard way:** Set memory limits conservatively, then tune upward. Set CPU limits generously (or skip them on some workloads). Getting OOMKilled is always worse than CPU throttling.

## Setting Requests and Limits: The Real Numbers Game 📊

Here's a battle-tested configuration for a Node.js API service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    spec:
      containers:
        - name: api-server
          image: myapp:latest
          resources:
            requests:
              # Scheduler needs this much FREE on a node to place the pod
              memory: "256Mi"
              cpu: "250m"      # 250 millicores = 0.25 CPU core
            limits:
              # Pod gets killed (memory) or throttled (CPU) above this
              memory: "512Mi"  # 2x the request = safe headroom
              cpu: "1000m"     # 1 full CPU core max
          # ALWAYS add liveness and readiness probes!
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

**The golden ratio that saved me:** Set `limits.memory` to roughly **2x your `requests.memory`**. Enough headroom for traffic spikes, but a hard ceiling before you hurt your neighbors.

## The Quality of Service Classes Nobody Tells You About 🎖️

Here's the sneaky part: Kubernetes uses your resource config to assign a **QoS class** to every pod, which determines who gets evicted first when a node runs low.

```
Guaranteed  →  requests == limits (for ALL containers)
Burstable   →  requests < limits (or only some resources set)
BestEffort  →  NO resources set at all (naked pod)
```

**Eviction order when the node panics:** BestEffort goes first, then Burstable, then Guaranteed (last resort).

```yaml
# BestEffort - First to die 💀
spec:
  containers:
    - name: app
      image: myapp:latest
      # No resources = "please evict me first"

---
# Guaranteed - Last to die 🛡️
spec:
  containers:
    - name: app
      image: myapp:latest
      resources:
        requests:
          memory: "512Mi"
          cpu: "500m"
        limits:
          memory: "512Mi"  # Exact same as request
          cpu: "500m"       # Exact same as request
```

**Production rule:** Critical services (databases, auth, payment processors) should be `Guaranteed`. Background workers and batch jobs? Let them be `Burstable` or `BestEffort` — they're fine to evict under pressure.

## LimitRange: The Safety Net for Lazy Developers 🥅

What happens when a developer deploys a pod with NO resource spec? (Spoiler: BestEffort class. First to die.)

Enter **LimitRange** — a namespace-level policy that sets defaults so even naked pods get sensible limits:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:           # Applied when limits not specified
        memory: "512Mi"
        cpu: "500m"
      defaultRequest:    # Applied when requests not specified
        memory: "256Mi"
        cpu: "250m"
      max:               # Nobody can exceed this
        memory: "2Gi"
        cpu: "2000m"
      min:               # Nobody can go below this
        memory: "64Mi"
        cpu: "50m"
```

Deploy this to your namespace and sleep soundly knowing that even the most resource-oblivious developer on your team can't accidentally nuke the cluster. You're welcome. 😴

## ResourceQuota: Keeping Teams from Eating the Cluster 🍕

Multi-team clusters are a potluck dinner where someone always takes all the pizza. **ResourceQuota** is the rule that says each team only gets two slices:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-frontend-quota
  namespace: team-frontend
spec:
  hard:
    # Total resource budget for this namespace
    requests.cpu: "4"         # 4 cores total requests
    requests.memory: "8Gi"    # 8GB total requests
    limits.cpu: "8"           # 8 cores max usage
    limits.memory: "16Gi"     # 16GB max usage
    # Also cap object counts
    pods: "20"                # Max 20 pods
    services: "10"
    persistentvolumeclaims: "5"
```

**Real-world win:** After our platform team deployed ResourceQuotas per team namespace, a runaway deployment in the data-science namespace could no longer starve the payment service. Compartmentalization saves lives (and SLAs). 🎯

## Finding the Right Numbers: Don't Just Guess 🔍

The most common mistake? Setting limits based on vibes. Here's how to actually find the right values:

```bash
# Check what pods are actually consuming RIGHT NOW
kubectl top pods -n production

# NAME                    CPU(cores)   MEMORY(bytes)
# api-server-7d9f8b-xkp2  187m         203Mi
# api-server-7d9f8b-r8n4  201m         198Mi
# worker-5c9f7d-p2q1       45m          89Mi

# Check node pressure
kubectl top nodes

# NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-1         2341m        58%    11Gi             72%  ← getting full!
# node-2         890m         22%    4Gi              26%
# node-3         1120m        28%    5Gi              33%
```

**My workflow after an OOMKill incident:**
1. Check `kubectl top pods` under normal load (get baseline)
2. Check during peak traffic (find the spike)
3. Set `requests` = normal load, `limits` = peak load × 1.5
4. Enable Vertical Pod Autoscaler (VPA) in recommendation mode to validate

**Pro tip:** If you're on AWS/GKE/AKE, the VPA recommendation mode will watch your pods for a few days and suggest better values without touching anything. Trust but verify. 📈

## The 3 AM Incident That Changed Everything 🌙

Back to that fateful night. After the cluster recovered, we did a post-mortem. The fix was embarrassingly simple:

**Before (the chaos configuration):**
```yaml
containers:
  - name: data-processor
    image: processor:latest
    # No resources. Just vibes. 🤡
```

**After (the production-ready configuration):**
```yaml
containers:
  - name: data-processor
    image: processor:latest
    resources:
      requests:
        memory: "512Mi"
        cpu: "500m"
      limits:
        memory: "1Gi"    # Enough headroom for big batches
        cpu: "2000m"     # CPU-intensive work, be generous
    env:
      - name: NODE_OPTIONS
        value: "--max-old-space-size=900"  # Keep Node.js heap UNDER memory limit!
```

**That last line is critical.** If Node.js doesn't know about its memory limit, it'll happily grow past it, get OOMKilled, restart, grow again, restart... death loop forever. Tell your runtime about the limit! Python, JVM, and .NET all have equivalent flags.

**Result:** No more 3 AM pages from that service. The data processor now gets capped cleanly, other pods on the node survive, and the on-call engineer (me) actually sleeps through the night. 🎉

## Your Kubernetes Resource Checklist 📋

Before you ship anything to production:

- [ ] Every container has `resources.requests` AND `resources.limits`
- [ ] Memory limit is at least 1.5x the request (headroom for spikes)
- [ ] Runtime memory flags match your container limit (`--max-old-space-size`, `-Xmx`, etc.)
- [ ] LimitRange deployed to every namespace (catches lazy deploys)
- [ ] ResourceQuota set per team/namespace (prevents noisy neighbors)
- [ ] Liveness and readiness probes configured (so Kubernetes knows when to restart)
- [ ] `kubectl top pods` running clean (no pod near its limit)
- [ ] Critical services are `Guaranteed` QoS class

**The 30-second audit for your cluster:**
```bash
# Find pods with NO resource requests set (danger zone!)
kubectl get pods --all-namespaces -o json | \
  jq '.items[] | select(.spec.containers[].resources.requests == null) | .metadata.name'

# Any results? Go add limits. Now. Before 3 AM finds you.
```

## The Bottom Line 💡

Resource requests and limits aren't DevOps gatekeeping or premature optimization. They're the difference between a cluster that runs itself and one that pages you at 3 AM.

Every pod without limits is a loaded gun pointed at your uptime. Every namespace without a LimitRange is trusting everyone on your team to always do the right thing. (They won't. We're human.)

**The good news:** This is a one-time fix. Set it up properly once, add LimitRanges as guardrails, and the cluster basically babysits itself.

Go check your production namespace right now. I'll wait.

```bash
kubectl get pods -n production -o custom-columns=\
"NAME:.metadata.name,\
MEM_REQ:.spec.containers[0].resources.requests.memory,\
MEM_LIM:.spec.containers[0].resources.limits.memory"
```

If you see a lot of `<none>` in those columns — you have homework to do before your pager does it for you. 🚨

---

**Survived a Kubernetes meltdown?** Share your war story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company, and we can all learn from the 3 AM incidents we'd rather forget.

**More Kubernetes content?** Check out my [GitHub](https://github.com/kpanuragh) for real production configurations that have been through the fire.

*Now go add those resource limits. Your future self at 3 AM will thank you.* 💤
