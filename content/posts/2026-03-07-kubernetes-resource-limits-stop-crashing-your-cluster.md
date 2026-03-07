---
title: "Kubernetes Resource Limits: Stop Letting One Pod Crash Your Entire Cluster 🚀💥"
date: "2026-03-07"
excerpt: "One greedy pod. No resource limits. A cluster brought to its knees at 2 AM. Sound familiar? Here's everything I learned the hard way about Kubernetes requests and limits — and why skipping them is playing Russian roulette with production."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting One Pod Crash Your Entire Cluster 🚀💥

**Story time.** It's 2 AM. Your phone is screaming. Every service in your Kubernetes cluster is down. Not one service — ALL of them. You SSH in, start investigating, and eventually find the culprit: one single pod that decided it would like ALL the CPU on the node. Forever. Without asking.

**The fix?** A two-line change you should have made before deploying.

Welcome to the world of Kubernetes resource requests and limits — the feature everyone skips, the thing that bites everyone eventually, and the topic nobody talks about until it's too late.

Let's fix that. Right now.

## What Are Requests and Limits, Really? 🤔

Kubernetes gives you two knobs for controlling how much CPU and memory a container can use:

- **Requests** — what your pod is *guaranteed* to get. Kubernetes uses this to decide *which node* to schedule your pod on.
- **Limits** — the *maximum* your pod can consume. Go over this, and Kubernetes steps in with a firm "no."

Think of requests as reserving a seat at a restaurant, and limits as the restaurant refusing to let you order a 17-course meal when you only reserved a table for two.

Without them, your pods are unsupervised children at a buffet. Every single pod on the node competes for the same resources, and whoever grabs first wins. Spoiler: your most important services usually lose.

## The Cluster Carnage I Witnessed 💀

Here's what a production cluster looks like with zero resource configuration:

```yaml
# The "I'll add limits later" deployment (DANGER ZONE)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: data-processor
  template:
    spec:
      containers:
        - name: processor
          image: myapp:latest
          # No resources block at all
          # This pod will take EVERYTHING it can get 😱
```

What actually happened: a scheduled batch job kicked off, consumed 14 of 16 available CPUs on the node, and every other pod on that node — including the API gateway — went completely unresponsive. Kubernetes saw healthy pods (they were running!) but they were CPU-starved and couldn't serve traffic.

Incident report duration: 3 hours. Root cause: 0 lines of resource configuration. Never again.

## The Right Way: Requests + Limits Together 🛡️

Here's the corrected deployment with proper resource management:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: data-processor
  template:
    spec:
      containers:
        - name: processor
          image: myapp:latest
          resources:
            requests:
              memory: "256Mi"   # Guaranteed minimum
              cpu: "250m"       # 250 millicores = 0.25 CPU
            limits:
              memory: "512Mi"   # Hard ceiling on memory
              cpu: "1000m"      # Hard ceiling = 1 full CPU core
```

**What this actually means in practice:**

- The pod is guaranteed 0.25 CPU and 256MB RAM — the scheduler won't place it on a node that can't provide this
- The pod can *burst* up to 1 CPU if the node has spare capacity
- If it tries to use more than 512MB of memory, Kubernetes OOMKills it (and restarts it)
- If it tries to use more than 1 CPU, it just gets throttled — no kill, just slowdown

**The CPU vs. Memory difference is critical:** CPU throttling is invisible — your pod slows down but keeps running. Memory OOMKill is visible — your pod crashes and restarts. This is why memory limits are even more important to get right.

## Setting Sane Defaults with LimitRange 🎯

Running a team where developers forget to add resource limits? Use `LimitRange` to set defaults at the namespace level:

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
      min:
        memory: "64Mi"
        cpu: "50m"
```

Now every container in the `production` namespace gets default limits applied automatically. Developers who forget get sane defaults instead of resource anarchy. And if someone tries to request 32GB of RAM for a hello-world app, the `max` field stops that conversation before it starts.

**Real team lesson:** This single YAML file eliminated 90% of our "why is the cluster slow?" incidents. Ops teams: deploy this before giving developers cluster access. You're welcome.

## ResourceQuota: Protecting the Cluster from One Team 🚧

LimitRange controls individual containers. `ResourceQuota` controls entire namespaces — perfect for multi-team clusters where one team's runaway deployment shouldn't affect everyone else:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-payments
spec:
  hard:
    requests.cpu: "4"          # Team gets max 4 CPU total
    requests.memory: "8Gi"     # 8GB RAM total across namespace
    limits.cpu: "8"
    limits.memory: "16Gi"
    pods: "20"                 # Max 20 pods in this namespace
    persistentvolumeclaims: "5"
```

When the payments team tries to scale their deployment to 50 replicas and eat the whole cluster, Kubernetes says "nope — you've hit your quota" and the rest of the platform survives. Everyone else stays happy. The payments team has a conversation about capacity planning.

## How to Actually Find the Right Numbers 📊

This is the question nobody answers: *how do I know what numbers to set?*

Here's my process:

**Step 1: Deploy with requests only (no limits) in staging, then observe:**

```bash
# Watch resource usage for your pods
kubectl top pods -n your-namespace --sort-by=memory

# Get per-container breakdown
kubectl top pods -n your-namespace --containers

# Watch a specific pod over time
watch -n 5 kubectl top pod your-pod-name-xyz -n your-namespace
```

**Step 2: Use Vertical Pod Autoscaler (VPA) in recommendation mode:**

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Off"   # Recommendation only — don't auto-apply yet
```

After a few days, VPA collects real usage data and tells you exactly what requests/limits to set based on actual traffic patterns. No guessing required.

**Step 3: Set limits with breathing room:**

| Observed Peak | Recommended Request | Recommended Limit |
|---------------|--------------------|--------------------|
| 100m CPU avg  | 150m               | 400m               |
| 200MB memory  | 256Mi              | 512Mi              |

Requests: ~1.5x average usage. Limits: 2-3x average usage for CPU, closer to 1.5x for memory (memory leaks are real).

## The OOMKill Loop of Shame 🔄

One more real-world lesson: if you set memory limits too tight, you get the OOMKill loop — pod starts, uses slightly more than the limit, gets killed, restarts, repeat forever.

```bash
# You'll see this in kubectl describe pod:
# Last State: Terminated
#   Reason: OOMKilled
#   Exit Code: 137

# And the restart count climbing
kubectl get pods
# NAME                    READY   STATUS      RESTARTS   AGE
# my-app-7d9f8b-xk2p9   0/1     OOMKilled   47         2h
```

**Exit code 137 = OOMKilled.** If you see this, don't just increase the limit blindly — investigate whether the app has a memory leak first. `kubectl logs` before the crash often tells the story.

## The Bottom Line 💡

Resource limits aren't optional configuration you add "later." They're the seatbelts of Kubernetes. You don't notice them until you need them, and by then it's too late to put them on.

**Three rules I now follow for every deployment:**

1. **Always set requests.** Without them, the scheduler is flying blind and your pods land on random nodes with random amounts of available capacity.
2. **Always set limits.** Without them, a single misbehaving pod can take down its entire node — and everything on it.
3. **Deploy a LimitRange in every namespace.** Teams forget. Defaults save clusters.

The two-line fix that would have saved my 2 AM incident took about 45 seconds to write. The incident itself took 3 hours to resolve, woke up 6 people, and cost real money in degraded service.

**Set your resource limits before you deploy. Not after. Before.**

## Your Action Plan 🚀

**Today:**
1. Run `kubectl top pods --all-namespaces` — find pods with no limits
2. Add a `LimitRange` to your most critical namespace
3. Fix the worst offenders first

**This week:**
1. Audit every Deployment manifest for a `resources` block
2. Deploy VPA in recommendation mode to get real numbers
3. Add resource checks to your CI pipeline (`kubeval` or `kube-score` can catch missing limits before merge)

**This month:**
1. Roll out `ResourceQuota` to every team namespace
2. Set up alerts for OOMKilled pods in Prometheus/Grafana
3. Teach your team: no resources block = PR rejected

---

**Still running pods without resource limits?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — let's talk before your next 2 AM incident.

**Want to see real Kubernetes manifests from real projects?** Check out my [GitHub](https://github.com/kpanuragh) for battle-tested configs.

*Now go add those resource limits before your cluster does it for you — the hard way.* 🚀

---

**P.S.** If `kubectl top pods` shows a pod using more CPU than your entire laptop has, you've already waited too long. Set limits. Now. 🎯
