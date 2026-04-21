---
title: "Kubernetes Resource Limits: Stop Letting One Pod Eat Your Entire Cluster 🐳💥"
date: "2026-04-21"
excerpt: "I once deployed a Node.js app with no resource limits to a shared cluster. It leaked memory overnight and took down 12 other services by 9 AM. Here's what I learned so you don't repeat my Monday morning."
tags: ["devops", "kubernetes", "docker", "infrastructure"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting One Pod Eat Your Entire Cluster 🐳💥

**True story.** It was a Sunday night. I pushed a "harmless" Node.js microservice to our shared staging cluster, went to bed, and woke up to 14 Slack DMs, 3 pages, and a very unhappy on-call engineer named Dave.

My app had a memory leak. Without resource limits, Kubernetes happily let it consume every gigabyte of RAM on the node — and then the node went down, and with it, 12 other services that had nothing to do with my code. Production was down for 40 minutes on a Monday morning.

I have never forgotten to set resource limits since.

Let's make sure you don't have your own "Dave incident."

## The Two Things Kubernetes Cares About: Requests vs. Limits 🎯

Kubernetes has two resource knobs you need to understand:

- **Requests**: "I promise I'll need *at least* this much." Kubernetes uses this for scheduling — it finds a node with enough headroom.
- **Limits**: "I swear I won't use more than this." Kubernetes enforces this at runtime. Exceed it and your pod gets throttled (CPU) or killed (memory).

Think of requests as the RSVP you send to a party, and limits as the bouncer at the door.

## What Bad Looks Like (aka My Sunday Night) 😬

```yaml
# This is the config that got me paged at 7 AM
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-harmless-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: my-app:latest
          # No resources block at all. Living dangerously.
```

Without a `resources` block, the pod has unlimited access to the node's CPU and memory. One memory leak + three replicas = your node is toast.

## What Good Looks Like ✅

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-responsible-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: my-app:latest
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
```

Breaking this down:
- **100m CPU** = 0.1 of a CPU core (1000m = 1 full core). Your app is asking for a tenth of a core at scheduling time.
- **500m CPU limit** = it can burst up to half a core but no more.
- **128Mi memory request** = Kubernetes picks a node with at least 128MB free.
- **256Mi memory limit** = hit this and the container gets OOMKilled. That's actually *good* — it fails fast and Kubernetes restarts it, instead of dragging down the whole node.

## The "Right Sizing" Problem (and How to Solve It) 📊

"Okay, but how do I know what numbers to use?"

Great question. Here's the pragmatic approach:

1. **Start with a guess** — for a typical Node.js or Python service, `100m`/`256Mi` requests and `500m`/`512Mi` limits are reasonable starting points.
2. **Deploy and watch** — use `kubectl top pods` to see actual usage in real time.
3. **Tune after a week** — look at your metrics dashboard (Datadog, Grafana, whatever you have) and find the P95 usage. Set your requests to roughly that value and limits to 2x.

```bash
# See what your pods are actually using right now
kubectl top pods -n your-namespace

# Describes resource usage over time for a specific pod
kubectl describe pod <pod-name> | grep -A 5 "Limits\|Requests"
```

Don't set limits too tight. A pod that gets OOMKilled every few hours is just as bad as one with no limits. Set them tight enough to protect the cluster, but loose enough that normal traffic doesn't trigger kills.

## LimitRange: The Safety Net You Set and Forget 🛡️

Here's the real pro move: enforce defaults at the namespace level so rogue deployments (like Sunday-night me) can't skip resource specs.

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
        cpu: "2000m"
```

Apply this to your namespace and any container deployed *without* explicit resource specs automatically gets the defaults. The `max` field is the hard ceiling — nobody can request more than 2Gi of memory, period.

This saved Dave from ever having to page me again. (Dave still pages me for other reasons, but at least not this one.)

## Real-World Lessons Learned 🏥

**Lesson 1: Memory limits save clusters, CPU limits hurt latency.**
An OOMKill restarts your pod cleanly. CPU throttling is invisible and insidious — it just makes your app slow, and you'll spend hours wondering why your P99 latency spiked before realizing your CPU limit is 100m and your app is doing crypto. Set CPU limits generously or not at all for latency-sensitive services.

**Lesson 2: Requests affect scheduling, not just limits.**
If you set a 4Gi memory request on a pod and your nodes only have 3Gi free, the pod will be stuck in `Pending` forever. Many "why won't my pod start?" questions are just over-provisioned requests.

**Lesson 3: Vertical Pod Autoscaler (VPA) exists.**
For mature clusters, VPA can automatically recommend (or even apply) right-sized resource values based on actual usage history. It's overkill for early-stage projects but worth knowing about.

**Lesson 4: Set them even in development.**
The instinct is to only care about limits in production. Don't. Shared dev/staging clusters are exactly where one engineer's runaway process ruins everyone else's afternoon.

## The Quick Checklist Before You Deploy 📋

Before any `kubectl apply`, ask yourself:
- [ ] Does every container have a `resources.requests` block?
- [ ] Does every container have a `resources.limits` block?
- [ ] Is the memory limit at least 2x the request?
- [ ] Have I applied a `LimitRange` to this namespace?

Four questions. Fifteen seconds. Zero Daves paged.

## Go Fix Your Deployments

Right now, run this against your cluster:

```bash
kubectl get pods -A -o json | \
  jq -r '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'
```

That command lists every pod currently running without resource limits. If that list is long, you have some homework. If it's empty, you're already ahead of most teams I've worked with.

Resource limits aren't glamorous. They won't make it into your performance review. But they're the difference between a 2-minute pod restart and a 40-minute production outage with Dave's name all over the incident report.

Set your limits. Your cluster — and your on-call rotation — will thank you. 🙏

---

*Got a war story about a pod eating your cluster? I'd love to hear it. Drop a comment below or find me on [GitHub](https://github.com/kpanuragh).*
