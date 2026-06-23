---
title: "⚖️ Kubernetes Resource Requests & Limits: Stop Guessing, Start Right-Sizing"
date: "2026-06-23"
excerpt: "OOMKilled at 2 AM, throttled CPUs at peak traffic, and a cluster that won't schedule new pods — all because of two YAML fields most teams set by gut feel. Here's how to stop guessing your resource requests and limits."
tags:
  - kubernetes
  - devops
  - platform-engineering
  - reliability
  - cloud-cost
featured: true
---

There are two kinds of Kubernetes engineers: those who have been woken up by an `OOMKilled` alert at 2 AM, and those who will be.

The culprit is almost always the same pair of YAML fields that every team sets once, never revisits, and treats as cargo cult configuration.

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

Looks reasonable. Could be catastrophically wrong. Let me explain why — and how to fix it without a spreadsheet and a prayer.

## What requests and limits actually do (they're not the same thing)

This is the part most tutorials skim over, and it's why teams get bitten.

**Requests** are promises you make to the Kubernetes scheduler. When you say `cpu: "250m"`, you're telling the scheduler "find me a node with at least 250 millicores free." The scheduler uses this to place your pod. **The kubelet does not enforce requests at runtime.** Your pod can use more CPU than it requested — right up until the node gets noisy.

**Limits** are enforced at runtime by the kubelet via cgroups. CPU limits cause **throttling** (your process gets rate-limited, but keeps running). Memory limits cause **OOMKill** (your process gets killed, full stop, no warning).

This asymmetry matters enormously:

- A pod with a CPU limit of `500m` but a workload that briefly needs `800m` will be throttled silently. Your latency spikes, your P99 explodes, and nothing in your logs explains why.
- A pod with a memory limit of `512Mi` that suddenly needs `600Mi` gets killed. Kubernetes restarts it. If this happens repeatedly, you get `CrashLoopBackOff` and an on-call nightmare.

At Cubet, we had a Node.js service that handled image processing. The team had set a `512Mi` memory limit "to be safe." During a batch job that ran on weekends, the service would briefly buffer several large images in memory, hit the limit, get OOMKilled, and crash mid-processing. It took us two weekends to connect the dots because the pod restart looked like a flaky deploy, not a resource issue.

## The three failure modes

### 1. Over-requesting CPU (waste money, starve the scheduler)

If your pods each request `500m` CPU but typically use `50m`, your cluster is mostly empty on paper. The scheduler sees allocated capacity and refuses to place new pods, even though the nodes are idle. You buy more nodes. Your cloud bill grows. Your utilization metrics look terrible.

### 2. Under-requesting memory (get evicted at the worst time)

When a node runs out of memory, the kubelet's eviction manager starts killing pods. It picks **pods using significantly more than they requested** first. If you set `requests.memory: "64Mi"` but your pod uses `400Mi` at runtime, you're a prime eviction target — even if you have a `512Mi` limit set. Your pod gets evicted during a traffic spike, exactly when you can't afford it.

### 3. Setting CPU limits (almost always a mistake)

This one is controversial but increasingly backed by data. CPU limits cause **CPU throttling** even when the node has plenty of spare capacity. A pod limited to `500m` on a quiet node with 8 spare cores will still get throttled if it wants `600m`. This is pure artificial scarcity. Netflix, Shopify, and several cloud providers now recommend running **without CPU limits** and relying on CPU requests alone for scheduling. Set limits only if you have strict multi-tenant isolation requirements.

## How to actually right-size your pods

### Step 1: Measure before you guess

```bash
# See what your pods are actually using right now
kubectl top pods -n production --sort-by=memory

# For a specific deployment, watch over time
kubectl top pods -n production -l app=api-server --containers
```

`kubectl top` gives you a point-in-time snapshot. Useful for a quick check, but you need time-series data to find peaks.

### Step 2: Use VPA in recommendation mode

The Vertical Pod Autoscaler (VPA) in `Off` mode is a free consultant that watches your pods and tells you what they should be set to. It won't change anything — it just logs recommendations.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-server-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: api-server
  updatePolicy:
    updateMode: "Off"   # Recommend only, don't touch anything
```

After a few days:

```bash
kubectl describe vpa api-server-vpa -n production
```

You'll see `Recommendation` sections with `lowerBound`, `target`, and `upperBound` for both CPU and memory. The `target` is VPA's best estimate. Use it as a starting point — not gospel.

### Step 3: Apply the rule of thumb

Once you have real usage data, here's a simple framework:

```yaml
resources:
  requests:
    # Set to P95 of observed usage — scheduler needs realistic numbers
    memory: "380Mi"
    cpu: "120m"
  limits:
    # Memory limit: 1.5x–2x the request (headroom for spikes without OOMKill)
    memory: "768Mi"
    # CPU limit: omit or set very high — throttling hurts latency more than it protects you
    # cpu: intentionally omitted
```

The memory `limits` exist because memory leaks are real and you don't want one runaway pod to take down a node. The CPU limit is omitted because the cost of throttling (silent latency) is worse than the risk of one pod briefly using extra CPU on a shared node.

## The namespace-level safety net

Even with sane per-pod settings, new deployments by junior engineers or automated tools can land with no resources set at all. That's where `LimitRange` saves you:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
  - type: Container
    defaultRequest:
      cpu: "100m"
      memory: "128Mi"
    default:
      memory: "256Mi"
      # No default CPU limit — deliberate
    max:
      memory: "4Gi"   # No container gets more than this without explicit override
```

This gives every container sane defaults so unset fields don't become "unbounded" in practice, while the `max` field acts as a guardrail against typos (`memory: "4000Gi"` has happened).

## What we changed at Cubet

After the image-processing OOMKill incident, we ran VPA in recommendation mode across all our production namespaces for two weeks. The results were humbling:

- Our API services were **over-requesting CPU by 4x on average** (paying for capacity the scheduler reserved but pods never used)
- Three services had **memory requests so low they were eviction candidates** — they'd just been lucky about when evictions happened
- Two services had CPU limits that were **silently throttling them on every afternoon traffic spike** — explaining the mysterious P99 degradation we'd been blaming on the database

After retuning, our cluster utilization went from ~18% to ~41% without adding nodes. We actually decommissioned two worker nodes. The P99 latency issue on those throttled services disappeared.

Resources aren't glamorous. There's no Kubernetes feature flag called "stop getting paged at 2 AM." But right-sizing your pods is probably the highest-leverage 30 minutes you can spend on your cluster — lower bill, better reliability, faster scheduling. The data is all there; you just have to look at it.

---

**Action items for this week:**
1. Run `kubectl top pods` across your production namespaces and see what surprises you
2. Deploy VPA in `Off` mode for your top 5 services and let it watch for 72 hours
3. Add a `LimitRange` to any namespace that doesn't have one
4. Check your CPU-limited services for throttling in Prometheus: `rate(container_cpu_cfs_throttled_seconds_total[5m]) > 0`

You'll find at least one service being silently strangled. Guaranteed.
