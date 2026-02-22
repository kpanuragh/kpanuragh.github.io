---
title: "Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🐳💀"
date: "2026-02-22"
excerpt: "Your pods keep getting OOMKilled and you have no idea why? After watching production nodes melt down at 3 AM, I learned the hard way that Kubernetes resource requests and limits are not optional - they're survival gear."
tags: ["kubernetes", "devops", "docker", "deployment", "cloud"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🐳💀

**True story:** It was 2 AM. My phone screamed. Half our cluster was down. Pods were getting OOMKilled like it was a horror movie. Nodes were running out of memory, evicting pods at random, and our on-call rotation suddenly had a LOT of opinions about my Kubernetes configs.

The root cause? Every single deployment had NO resource limits. One Node.js service decided it wanted to cache the entire database in-memory (thanks, memory leak), ballooned to 12GB, and took down half the node with it.

**The fix was embarrassingly simple.** Let me save you the 3 AM panic attack.

## What Are Requests and Limits, Anyway? 🤔

Kubernetes has two dials for resource control:

- **Requests**: "I need *at least* this much to function." Used by the scheduler to decide which node to place a pod on.
- **Limits**: "I am *not allowed* to use more than this." The enforced hard ceiling.

Think of it like a hotel:

- **Request** = the room you booked (the scheduler guarantees this capacity exists)
- **Limit** = the maximum minibar bill you're allowed to run up (the node enforces this ceiling)

Without requests, the scheduler plays darts in the dark. Without limits, one greedy pod can evict its neighbors like a nightmare roommate.

## The Two Types of Pain (CPU vs Memory) ⚡

Before diving in, know this: **CPU and memory behave very differently when you exceed limits.**

| Resource | Over Limit Behavior | Symptom |
|----------|---------------------|---------|
| CPU | Throttled (slowed down) | Slow responses, high latency |
| Memory | Pod is killed (OOMKilled) | Random crashes, restarts |

CPU is forgiving. Memory is ruthless. Cross the memory limit and Kubernetes executes your pod without warning. No graceful shutdown. No second chances.

## The Configs That Keep Production Alive 🛡️

Here's a real-world deployment spec with resource management done right:

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
          image: myrepo/api-service:1.4.2
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"   # Scheduler reserves this
              cpu: "100m"       # 0.1 CPU core
            limits:
              memory: "256Mi"   # Hard ceiling - cross it, get killed
              cpu: "500m"       # 0.5 CPU core - throttled if exceeded
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
```

**A few things to notice:**

- Memory limit is 2x the request. This gives headroom for traffic spikes without letting runaway leaks consume the node.
- CPU limit is 5x the request. CPU throttling is preferable to pod death — let it burst when needed.
- Probes are included. Without them, Kubernetes doesn't know if your app is actually serving traffic vs. just sitting there consuming RAM while on fire.

**CPU notation quick guide:**
- `100m` = 100 millicores = 0.1 CPU core
- `500m` = 0.5 CPU core
- `1000m` = 1 = 1 full CPU core

## Set a LimitRange So Your Teammates Can't Shoot Themselves 🎯

Individual deployments are one thing. But what happens when a junior dev pushes a deployment with no resource specs at all? Without a `LimitRange`, Kubernetes will happily schedule it with unlimited memory and you're back to the 3 AM call.

Add a `LimitRange` to your namespace and set sensible defaults:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:           # Applied when no limits are specified
        memory: "256Mi"
        cpu: "500m"
      defaultRequest:    # Applied when no requests are specified
        memory: "64Mi"
        cpu: "50m"
      max:               # Nobody can exceed these (circuit breaker!)
        memory: "2Gi"
        cpu: "2000m"
      min:               # Prevents accidentally tiny requests
        memory: "32Mi"
        cpu: "10m"
```

Now even a deploy with zero resource specs gets sensible defaults applied automatically. The `max` field is the team safety net — no single container can accidentally request 32GB of RAM and crash the node.

**Pair this with a `ResourceQuota` on the namespace** to cap total consumption for the entire team:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"        # Total CPU requests across all pods
    requests.memory: "20Gi"   # Total memory requests
    limits.cpu: "20"          # Total CPU limits
    limits.memory: "40Gi"     # Total memory limits
    pods: "50"                # Max number of pods
```

This keeps one team's runaway service from stealing resources that belong to another team's namespace.

## Real Lessons Learned (aka My Production Scar Tissue) 🩹

**Lesson 1: Always set memory limit = 2x request, never equal.**

When request equals limit, you get a `Guaranteed` QoS class — great in theory, brutal in practice. Any traffic spike or GC pause that briefly spikes past the limit kills the pod instantly. Give yourself breathing room.

**Lesson 2: OOMKilled without limits is the worst postmortem.**

When a pod gets OOMKilled with no limits set, it means a single bad actor took out a shared node. Neighboring pods that did nothing wrong get evicted. Your incident report becomes "everything died because nothing was bounded."

**Lesson 3: Start conservative, then tune with actual data.**

Don't guess. After deploying, run:

```bash
# See actual resource usage for pods in a namespace
kubectl top pods -n production

# See node-level pressure
kubectl top nodes

# Describe a specific pod to see its QoS class and limits
kubectl describe pod <pod-name> -n production | grep -A 10 "Requests\|Limits\|QoS"
```

Watch the `top pods` output for a week under real traffic. Set your limits at roughly 2x the observed peak. Your 95th percentile memory usage is your new best friend.

**Lesson 4: CPU throttling is silent and deadly.**

Your pod won't crash from CPU throttling — it'll just get mysteriously slow. A service with `cpu: "100m"` limit that actually needs `500m` will have its CPU rationed and your response times will balloon. No alerts, no OOMKill, just confused users and vague latency spikes.

Check CPU throttling with:

```bash
kubectl exec -it <pod-name> -- cat /sys/fs/cgroup/cpu/cpu.stat
# Look for: throttled_time - if this is high, raise your CPU limit
```

## The QoS Tiers: Guaranteed, Burstable, BestEffort 🏅

Kubernetes assigns a Quality of Service class to every pod based on how you've configured resources:

| QoS Class | Condition | Eviction Priority |
|-----------|-----------|-------------------|
| Guaranteed | limits == requests (both set) | Last to be evicted |
| Burstable | requests set, limits > requests | Middle |
| BestEffort | No requests or limits | First to die |

**BestEffort pods will be evicted first when a node is under memory pressure.** If you deploy with no resource specs at all, your pod has the same priority as a housefly — it gets swatted the moment things get tight.

For production workloads, aim for **Burstable** at minimum. For critical services, consider **Guaranteed**.

## Your Action Plan 🚀

Start here, today:

1. Run `kubectl top pods -n <your-namespace>` and look at what's actually running.
2. Find any deployment with no resource specs: `kubectl get pods -o json | jq '.items[] | select(.spec.containers[].resources == {}) | .metadata.name'`
3. Add a `LimitRange` to each namespace as your safety net.
4. Add requests and limits to every Deployment, StatefulSet, and DaemonSet.
5. Set up alerts on OOMKilled events — you want to know before your users do.

**This week:** Review your highest-traffic services and set conservative limits based on observed usage.

**This month:** Add a `ResourceQuota` per namespace. Enable Vertical Pod Autoscaler in recommendation mode to get data-driven limit suggestions.

Resource limits aren't premature optimization. They're the difference between a controlled incident and a full cluster meltdown at the worst possible time. Your future 3 AM self will thank you.

---

**Still untangling a Kubernetes mess?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got the postmortem scars and the configs to share.

**Want to dig deeper?** Check out my [GitHub](https://github.com/kpanuragh) for production-ready Kubernetes manifests that won't let you down at 3 AM.

*Set your limits. Don't become the cautionary tale.* 🐳
