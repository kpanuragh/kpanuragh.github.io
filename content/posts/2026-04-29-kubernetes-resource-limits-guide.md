---
title: "⚖️ Kubernetes Resource Limits: Stop Letting Your Pods Eat Each Other's Lunch"
date: "2026-04-29"
excerpt: "Ever had a Kubernetes node go dark because one rogue pod decided it deserved ALL the memory? Resource requests and limits are the seatbelts of K8s — boring until they save your life. Here's how to actually set them correctly."
tags: ["kubernetes", "devops", "docker", "cloud", "infrastructure"]
featured: true
---

# ⚖️ Kubernetes Resource Limits: Stop Letting Your Pods Eat Each Other's Lunch

Picture this: it's 2 AM, your phone is buzzing with alerts, and your entire production cluster is down. You blearily open your laptop, run `kubectl get pods`, and discover that one microservice — the one Dave pushed on Friday afternoon "just a tiny update" — has consumed every byte of memory on three nodes. Every other pod on those nodes is dead. Your cluster has become a ghost town, and it's all because nobody set resource limits.

Resource requests and limits are the most ignored feature in Kubernetes. They're also the most important. Let's fix that.

## The Two Numbers You Need to Understand

Kubernetes gives you two knobs per container:

- **Requests**: "I need *at least* this much to run properly." The scheduler uses this to decide which node to place your pod on.
- **Limits**: "I am *not allowed* to use more than this." The kubelet enforces this at runtime.

Think of requests as the reservation you make at a restaurant, and limits as the maximum number of dishes you're allowed to order. The scheduler won't seat you (schedule your pod) if the restaurant (node) doesn't have enough reserved capacity. And if you try to order more than your limit allows, the waiter (kubelet) will cut you off — or in memory's case, the OOM killer will simply end your pod's evening.

The common mistake? Setting one without the other, or worse, setting neither. Neither approach ends well.

## What Happens When You Get It Wrong

**No limits set**: Your pod is a free-range consumer. It will eat as much CPU and memory as the node has available. One memory leak later, your node is OOM-killed into silence and everything else on it dies with it. Classic "noisy neighbor" problem.

**Limits too low**: Your pod gets CPU-throttled even when the node has idle capacity, making your service inexplicably slow. Or it gets OOM-killed constantly because you gave it 128Mi for a JVM-based service. (JVM laughs at 128Mi.)

**Requests higher than limits**: Kubernetes won't even let you do this. Good.

**Requests much lower than actual usage**: The scheduler thinks your pod is lightweight and packs too many onto one node. When they all actually run, the node becomes overcommitted and things get chaotic.

## A Sane Starting Configuration

Here's a real-world example for a Node.js API service:

```yaml
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

The `100m` CPU means 100 millicores — one-tenth of a CPU core. `500m` as the limit means the pod can burst up to half a core when capacity is available, but never more. For memory, we're giving it breathing room: the request is what it needs at idle, the limit is a hard ceiling at double that.

**The golden rule**: set your limit to roughly 2x your request for memory. This allows for spikes without letting a runaway process destroy the node.

## How to Find the Right Numbers (Don't Guess)

The worst thing you can do is guess. The second worst is copying numbers from a blog post (including this one). Here's the right way:

Deploy your service with generous limits first, then observe actual usage with `kubectl top`:

```bash
# Watch pod resource usage in real time
kubectl top pods --namespace=production --sort-by=memory

# Check node-level pressure
kubectl top nodes

# Describe a pod to see its current requests/limits
kubectl describe pod my-api-7d8f9b-xk2pq | grep -A 10 "Limits\|Requests"
```

Run this during normal load, during peak load, and during your worst-case scenario (bulk imports, report generation, whatever hammers your service). The highest memory usage you observe during peak load should be well under your limit — aim for a 30-40% headroom above your p99 observed usage.

For CPU, it's more forgiving: CPU limits throttle rather than kill, so err on the side of generosity unless you're on a tight budget.

## The LimitRange Safety Net

If you manage a shared cluster and can't trust every team to set limits on their deployments, `LimitRange` is your friend. It enforces defaults at the namespace level:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: team-foo
spec:
  limits:
    - default:
        memory: "512Mi"
        cpu: "500m"
      defaultRequest:
        memory: "128Mi"
        cpu: "100m"
      type: Container
```

Now any container deployed into `team-foo` without explicit resource specs automatically gets these defaults. No more rogue pods, no more Dave-on-Friday incidents.

## Real Lessons Learned (The Hard Way)

A few patterns that have burned teams I've talked to:

**Lesson 1: Java/JVM services lie.** The JVM allocates memory eagerly at startup and holds onto it. Set your requests based on what it uses *after warmup*, not at startup. And always add heap headroom above your `-Xmx` setting for native memory.

**Lesson 2: CPU throttling is silent and deadly.** A pod that's CPU-throttled doesn't crash, it just gets slow. Mysteriously slow. Inexplicably slow. "Why is this endpoint timing out when the server shows low CPU usage?" slow. Always check `container_cpu_throttled_seconds_total` in your metrics if latency looks odd.

**Lesson 3: Set up alerts for OOMKilled pods.** `kubectl get events | grep OOMKilled` is not a sustainable monitoring strategy. Wire up an alert on the `OOMKilled` pod condition. You want to know about this before users do.

**Lesson 4: ResourceQuota at the namespace level prevents budget surprises.** Without it, one overzealous team can scale their deployment to 50 replicas and consume your entire cluster capacity. `ResourceQuota` caps total resource consumption per namespace.

## The Payoff

Once you have sane resource configuration across your cluster, you get:

- **Predictable scheduling**: the Kubernetes scheduler can make smart placement decisions
- **Isolation**: one bad pod can't take down its neighbors
- **Autoscaling that works**: the HorizontalPodAutoscaler uses CPU/memory requests to calculate utilization percentages correctly — without requests, HPA is flying blind
- **Cost visibility**: resource requests map directly to what you're paying cloud providers for

It takes maybe 30 minutes to audit your deployments and add sensible limits. That's 30 minutes well spent compared to a 2 AM incident that costs hours.

---

**Your move**: Run `kubectl top pods -A` right now on your cluster. If you see pods without resource limits — or pods consistently hitting 80%+ of their memory limit — you've got homework to do. Start with your highest-traffic services and work down. Future-you will be grateful, and Dave's Friday deploys will no longer be a team-wide anxiety event.

Have a war story about resource limits gone wrong (or finally right)? Share it — the DevOps community runs on cautionary tales and hard-won lessons.
