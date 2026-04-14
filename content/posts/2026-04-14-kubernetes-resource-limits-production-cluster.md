---
title: "Kubernetes Resource Limits: The 3 Lines of YAML That Saved My Production Cluster 🔥"
date: "2026-04-14"
excerpt: "Skipping resource limits in Kubernetes is like driving without a seatbelt — fine until it isn't. I learned this the hard way when one rogue pod starved the entire cluster at 2 AM. Here's what I wish I knew sooner."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: The 3 Lines of YAML That Saved My Production Cluster 🔥

**True story:** It was 2 AM on a Tuesday. My phone was buzzing with PagerDuty alerts. Half our microservices were down. The culprit? One overzealous background job that decided to eat every CPU cycle on the node — starving every other pod into a slow, miserable death.

The fix? Three lines of YAML I had ignored for months.

Welcome to Kubernetes resource limits — the most underrated config you're probably skipping.

## What Even Are Resource Requests and Limits? 🤔

Kubernetes has two separate knobs for controlling how much compute a container can use:

- **Requests** — "I *need* at least this much to run comfortably." The scheduler uses this to decide which node to place the pod on.
- **Limits** — "This is the MAXIMUM you're allowed to use. Not a byte more." The kubelet enforces this at runtime.

Think of requests like a dinner reservation and limits like the restaurant's fire code capacity. The reservation gets you a table; the fire code stops you from cramming in 400 people.

Here's the minimal config everyone should have:

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

That's it. Three lines per resource type. Stick this inside every container spec and you've already avoided 80% of cluster meltdowns.

## The Incident That Cost Me Sleep (and Pride) 💀

Our data-processing worker had no resource limits. During a backlog spike, it spun up four replicas and each one tried to use 100% CPU — on the same node.

```
Node CPU usage: 420% 🚨
Web API pods:   CrashLoopBackOff
Auth service:   OOMKilled
Database proxy: Evicted
On-call eng:    Crying
```

Kubernetes has no way to stop a container from consuming unbounded resources unless you tell it the maximum. Without limits, one bad actor can starve every other tenant on the node.

**The fix took 90 seconds:**

```yaml
# Before (the ticking time bomb)
containers:
  - name: worker
    image: myapp/worker:latest
    # No resources block = no guardrails = chaos

# After (the 2 AM lesson learned)
containers:
  - name: worker
    image: myapp/worker:latest
    resources:
      requests:
        cpu: "500m"
        memory: "512Mi"
      limits:
        cpu: "1000m"
        memory: "1Gi"
```

Deploy took 30 seconds. Cluster stabilized in two minutes. I stared at the screen in disbelief at how long I'd been playing with fire.

## A Real-World Deployment Manifest 🏭

Here's a production-grade Deployment I actually use, with resource config baked in:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
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
          image: myapp/api:v2.1.0
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: "250m"      # 0.25 cores guaranteed
              memory: "256Mi"  # 256MB guaranteed
            limits:
              cpu: "750m"      # 0.75 cores max
              memory: "512Mi"  # 512MB hard cap
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

Notice: requests are set to half of limits. This gives the pod room to burst during traffic spikes without permanently hogging resources.

## The CPU vs Memory Trap 🪤

Here's where people get tripped up: **CPU and memory behave very differently when limits are hit.**

- **CPU over limit?** The container gets *throttled*. It slows down, but keeps running. Users notice latency, not downtime.
- **Memory over limit?** The container gets *killed* instantly. OOMKilled. No warning, no graceful shutdown. Just gone.

```bash
# Check for OOMKilled pods — your memory limits are too tight
kubectl get pods --all-namespaces | grep OOMKilled

# Check throttling — your CPU limits might be too aggressive
kubectl top pods -n production
```

**Lesson:** Set memory limits conservatively and monitor OOMKills. If you see them regularly, bump the limit — don't ignore them. Each OOMKill is a surprise restart your users feel.

## LimitRange: Guardrails for the Whole Namespace 🛡️

Tired of developers deploying without resource configs? Enforce defaults at the namespace level with a `LimitRange`:

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
        cpu: "500m"
        memory: "256Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "2"
        memory: "2Gi"
```

Now any pod deployed without a `resources` block automatically gets the defaults. No more naked deployments sneaking through.

**Pair this with a `ResourceQuota`** to cap total consumption per namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: namespace-quota
  namespace: staging
spec:
  hard:
    requests.cpu: "4"
    requests.memory: "8Gi"
    limits.cpu: "8"
    limits.memory: "16Gi"
    pods: "20"
```

This stops staging environments from accidentally consuming your entire cluster budget. Learned this after a junior dev ran a load test in staging that took down production. Fun times.

## Real-World Sizing Cheatsheet 📊

Not sure where to start? Here are ballpark values that work for common workloads:

| Service Type | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---|---|---|---|---|
| Lightweight API | 100m | 500m | 128Mi | 256Mi |
| Node.js/Python API | 250m | 750m | 256Mi | 512Mi |
| Background worker | 500m | 1000m | 512Mi | 1Gi |
| Data processing job | 1000m | 2000m | 1Gi | 2Gi |
| Database sidecar | 100m | 250m | 64Mi | 128Mi |

These are starting points — not gospel. Always monitor and tune based on actual `kubectl top pods` data.

## The Bottom Line 💡

Resource limits are one of those things that feel optional until they're desperately urgent. They're not configuration overhead — they're the difference between a self-healing cluster and a 2 AM war room.

**The three rules I now follow religiously:**

1. **Every container gets a `resources` block.** No exceptions. Zero tolerance for naked deployments.
2. **Set memory limits tighter than CPU.** OOMKills are scarier than throttling.
3. **Use LimitRange so defaults ship automatically.** Don't rely on developers to remember.

## Your Action Plan 🚀

**Today:**
1. Run `kubectl get pods -o json | jq '.items[].spec.containers[].resources'` — count how many are empty
2. Add `resources` blocks to your most critical deployments first
3. Deploy a `LimitRange` to your production namespace

**This week:**
1. Review `kubectl top pods` data and tune your limits
2. Set up alerts for OOMKilled pods in your monitoring stack
3. Add resource configs to your Helm chart defaults or Kustomize base

**Bonus:** Add a CI lint step with `kubeval` or `kube-score` to reject manifests without resource configs before they even reach the cluster.

Your future 2 AM self will thank you. Go add those three lines of YAML. Right now. I'll wait. 🙏

---

**Battling Kubernetes configs?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've made enough cluster mistakes to write a book.

**Want to see more production K8s patterns?** Check out my [GitHub](https://github.com/kpanuragh) for real manifests from real deployments.

*Now go forth and limit those resources!* ⚙️🚀
