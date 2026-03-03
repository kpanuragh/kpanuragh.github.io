---
title: "Kubernetes Resource Limits: Stop Letting Your Pods Starve (or Eat Everything) 🐳⚖️"
date: "2026-03-03"
excerpt: "Forgot to set resource limits and your whole cluster crashed because one rogue pod ate all the CPU? Been there. Here's the definitive guide to Kubernetes requests and limits so your cluster stays healthy and your pager stays silent."
tags: ["kubernetes", "devops", "docker", "deployment", "cloud"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting Your Pods Starve (or Eat Everything) 🐳⚖️

Picture this: It's 2 AM. Your on-call phone is screaming. You log into the cluster and see the most terrifying Kubernetes output imaginable:

```
OOMKilled   Exit Code: 137
```

Your payment service is dead. Not because of a code bug — but because a reporting job you deployed "temporarily" decided to gorge on every megabyte of RAM in the node. Every other pod got evicted. Chaos. Carnage. One very grumpy engineering manager at breakfast.

Welcome to the world of Kubernetes resource management. Get it wrong and your cluster is a lawless free-for-all. Get it right and you'll sleep through the night like a baby. 😴

Let me show you how to get it right.

## The Two Things Kubernetes Needs to Know 🤔

Kubernetes schedules your pods across nodes based on one question: **"Where can this pod fit?"**

To answer that, it needs two values per container:

- **Requests**: "This is the minimum I need to run." (Used for scheduling decisions)
- **Limits**: "This is the maximum I'm allowed to use." (Hard cap — enforced at runtime)

Think of it like booking a hotel room:
- **Request** = the room you reserved
- **Limit** = the physical size of the room (you can't knock down walls)

No reservation? Good luck. The scheduler will cram your pod onto whatever node has space — even a node that's already overwhelmed. And no limit? Your pod can eat the entire buffet while other guests starve. 🍽️

## A Dead-Simple Example Before the Brain Melts 🧠

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
    metadata:
      labels:
        app: api-server
    spec:
      containers:
        - name: api
          image: myapp:latest
          resources:
            requests:
              memory: "128Mi"
              cpu: "250m"
            limits:
              memory: "256Mi"
              cpu: "500m"
```

**Breaking down the numbers:**

- `250m` CPU = 250 millicores = 0.25 of a CPU core
- `128Mi` memory = 128 mebibytes (roughly 134 MB)
- The pod is **guaranteed** 250m CPU and 128Mi RAM on whatever node it lands on
- The pod **cannot exceed** 500m CPU or 256Mi RAM — ever

CPU limits: the pod gets throttled (slowed down) if it tries to go over.
Memory limits: the pod gets **killed** (OOMKilled) if it exceeds. No mercy. 💀

## The Horror Story That Made This Click 😱

We had a microservices setup on AWS EKS — about 12 services. Everything was humming along. Then one Friday afternoon a developer deployed a "quick analytics job" with no resource limits:

```yaml
# The original deployment (a crime against clusters)
containers:
  - name: analytics-job
    image: analytics:latest
    # No resources block. Completely naked. YOLO.
```

What happened over the next two hours:
1. Analytics job started, decided it wanted ALL the memory
2. Kubernetes didn't care — no limits, no problem (apparently)
3. The node hit 95% memory pressure
4. Kubernetes started evicting lower-priority pods to make space
5. Our auth service got evicted
6. Users couldn't log in
7. 404s cascading everywhere
8. One very expensive emergency rollback

**Root cause:** One pod, no limits, total cluster chaos.

**Fix:** Namespace-level `LimitRange` objects so no pod can ever be deployed without sensible defaults again. More on that in a second.

## Setting Limits That Actually Make Sense 🎯

The hardest part isn't the YAML — it's knowing **what numbers to put**. Here's my practical approach:

### Step 1: Profile first, guess never

Deploy your app **without** limits initially in a staging environment and watch it:

```bash
# Watch resource usage in real time
kubectl top pods -n your-namespace --sort-by=memory

# Get detailed metrics
kubectl top pods -n your-namespace --containers
```

Or use a quick Prometheus query if you have monitoring set up:

```promql
# 95th percentile memory usage for your pod over 7 days
histogram_quantile(0.95,
  rate(container_memory_working_set_bytes{pod=~"api-server-.*"}[5m])
)
```

Run realistic load tests. See what the pod actually uses at P95 traffic. **That's your request.** Set your limit at 2x the request to give breathing room without enabling runaway consumption.

### Step 2: Set namespace defaults so nobody can forget

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
      min:
        memory: "32Mi"
        cpu: "50m"
```

**What this does:**
- Every container that doesn't specify resources gets `128Mi/100m` requests and `256Mi/500m` limits automatically
- No container can request more than `2Gi` memory or `2` CPUs
- Prevents the "I'll just not set limits" shortcut that ends careers at 2 AM 😅

### Step 3: Use ResourceQuota to cap the whole namespace

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "50"
```

This is your circuit breaker. Even if someone tries to deploy 200 replicas of their analytics job, Kubernetes will refuse. The namespace simply can't exceed the quota. No more cluster-eating rogue deployments. 🛡️

## Quality of Service Classes: Kubernetes' Priority System 🏆

Here's a thing most people don't know: Kubernetes automatically assigns a **QoS class** to every pod based on its resource settings. This determines who gets evicted first when the node runs out of resources.

| QoS Class | When Assigned | Eviction Priority |
|-----------|--------------|------------------|
| **Guaranteed** | requests == limits for ALL containers | Evicted last (the VIPs) |
| **Burstable** | requests < limits (or only some set) | Middle of the pack |
| **BestEffort** | No requests or limits set | Evicted FIRST (the sacrificial lambs) |

**Your payment service?** Should be `Guaranteed`. Same request and limit values.

```yaml
# QoS: Guaranteed — won't be evicted under pressure
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "512Mi"  # Same as request!
    cpu: "500m"      # Same as request!
```

**Your background batch job?** `BestEffort` is fine — it can be killed and retried. But for anything customer-facing, you want `Burstable` at minimum, `Guaranteed` for critical paths.

## The Gotchas That Will Bite You 🪤

**Gotcha #1: CPU throttling is silent.**

If a pod hits its CPU limit, it doesn't crash — it just slows down. Your latency creeps up, P99 response times spike, and you spend two hours looking at application code before someone notices the CPU throttle metric. Always watch `container_cpu_throttled_seconds_total` in your dashboards.

**Gotcha #2: Memory limits kill without warning.**

Unlike CPU, hitting the memory limit is instant death (`OOMKilled`). JVM apps are especially sneaky here — the JVM doesn't respect container limits by default in older versions. Always set `-XX:MaxRAMPercentage=75` or similar to keep the JVM honest inside the container.

**Gotcha #3: Requests too high = wasted capacity.**

If you set `requests.memory: "2Gi"` but your app only uses 200Mi, you've reserved 2GB on a node that other pods could have used. Requests that are too high are just as harmful as no limits at all — you're wasting cluster capacity and paying for nodes you don't need.

## Your Action Plan (Do This Today) 🚀

**Right now:**
1. Run `kubectl top pods -A` and find pods using more than 500Mi RAM with no limits
2. Add a `LimitRange` to every namespace that doesn't have one
3. Identify your most critical pods and set them to `Guaranteed` QoS

**This week:**
1. Set up Prometheus alerts for `OOMKilled` pods and CPU throttling > 25%
2. Review all deployments and add sensible resource blocks based on observed usage
3. Apply `ResourceQuota` to production and staging namespaces

**This month:**
1. Run load tests against staging to establish accurate baselines
2. Consider Vertical Pod Autoscaler (VPA) in recommendation mode — it watches your pods and suggests better values automatically
3. Document your resource sizing philosophy so the whole team is on the same page

---

The cluster is a shared resource. Treat it like one. When you set requests and limits thoughtfully, every service gets a fair shot, evictions become rare, and your on-call rotations stop being a nightmare fuel factory.

Your future self (and your teammates) will thank you. 🙏

---

**Struggling with Kubernetes resource tuning?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — happy to talk through your cluster setup.

**Want to see real-world resource configs?** Check out my [GitHub](https://github.com/kpanuragh) for production-tested Kubernetes manifests.

*Now go set those limits before the analytics job strikes again.* ⚖️🐳
