---
title: "Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🐳💀"
date: "2026-03-09"
excerpt: "Your cluster looked fine at 9 AM, then at 2 PM everything went down. No code changes. No deploys. Just one rogue pod that ate all the memory and took everything else with it. Here's how to set resource limits and never experience that panic again."
tags: ["kubernetes", "devops", "docker", "deployment", "performance"]
featured: true
---

# Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🐳💀

**Real story, 2 PM on a Tuesday:**

My phone buzzes. Slack explodes. Our entire staging cluster is down. I frantically check the dashboard and see this:

```
Node memory usage: 97%
Pod: image-processor    Status: OOMKilled
Pod: api-server         Status: Pending (Insufficient memory)
Pod: auth-service       Status: Pending (Insufficient memory)
Pod: payment-service    Status: CrashLoopBackOff
```

One image-processing job decided it needed ALL the RAM. Kubernetes obliged. And then every other pod on that node got evicted because there was no memory left for them.

**The culprit?** Zero resource limits. Every pod was allowed to eat as much CPU and memory as it wanted. And one of them was HUNGRY. 😤

Welcome to Kubernetes resource management — the thing everyone skips in tutorials and then learns about the hard way in production.

## Why Resource Limits Matter (The Boring but True Explanation) 🤔

Kubernetes schedules pods onto nodes. Without resource requests and limits:

- **Scheduler is flying blind** — it doesn't know how much a pod actually needs
- **One noisy neighbor ruins everything** — a memory leak or spike can take down an entire node
- **You get random evictions** — Kubernetes starts killing pods when memory gets tight, and it picks ones without resource requests first (yours!)
- **Autoscaling is broken** — HPA can't scale on CPU metrics if pods have no CPU requests set

**Requests vs. Limits — the two concepts that confuse everyone:**

| | Requests | Limits |
|---|---|---|
| **Purpose** | What the pod is *guaranteed* | What the pod is *allowed* |
| **Affects scheduling** | Yes — scheduler uses this | No |
| **What happens if exceeded** | Nothing (it's a floor) | CPU throttled / Pod OOMKilled |
| **Think of it as** | "I need at least this much" | "I can't have more than this" |

Set requests too low → your pod gets scheduled on a full node and starves.
Set limits too low → your pod crashes even under normal load.
Set no limits at all → your pod becomes a RAM goblin. 👹

## The Right Way to Set Resource Limits 🎯

Here's the pattern I use for every production deployment:

```yaml
# deployment.yaml
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
        - name: api-server
          image: myapp/api-server:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"   # Guaranteed minimum
              cpu: "100m"       # 0.1 CPU core guaranteed
            limits:
              memory: "512Mi"   # Max allowed (OOMKill if exceeded)
              cpu: "500m"       # 0.5 CPU core max (throttled if exceeded)
          # Liveness and readiness probes are friends of resource limits!
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

**Decoding the numbers:**
- `100m` CPU = 100 millicores = 0.1 of one CPU core
- `500m` CPU = 0.5 of one CPU core
- `128Mi` = 128 mebibytes of RAM (not megabytes — Kubernetes is pedantic like that)
- `512Mi` = 512 mebibytes of RAM

**My rule of thumb:** Set the limit to 4x the request. Enough headroom for spikes, tight enough to contain runaway processes.

## The Namespace-Level Safety Net: LimitRange 🛡️

Here's the thing — you can't trust developers (including yourself at 2 AM) to always set resource limits. Kubernetes has a solution: **LimitRange**.

Set it once per namespace, and pods without explicit limits get sensible defaults automatically:

```yaml
# limitrange.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-resource-limits
  namespace: production
spec:
  limits:
    # Container-level defaults
    - type: Container
      default:             # Applied when no limits are set
        memory: "256Mi"
        cpu: "200m"
      defaultRequest:      # Applied when no requests are set
        memory: "64Mi"
        cpu: "50m"
      max:                 # No single container can exceed this
        memory: "2Gi"
        cpu: "2000m"
      min:                 # Every container must request at least this
        memory: "32Mi"
        cpu: "10m"

    # Pod-level ceiling (sum of all containers)
    - type: Pod
      max:
        memory: "4Gi"
        cpu: "4000m"
```

Apply it with `kubectl apply -f limitrange.yaml` and you've got a safety net for the whole namespace. Now when a junior dev deploys without resource specs, they get sensible defaults instead of a free-for-all.

**Verify it's working:**

```bash
kubectl describe limitrange default-resource-limits -n production

# Then deploy a pod without limits and check what got applied:
kubectl get pod my-pod -n production -o jsonpath='{.spec.containers[*].resources}'
```

## Finding the Right Numbers: VPA to the Rescue 📊

Okay, but HOW do you know what numbers to put? Wild guessing leads to either starving pods or wasting resources.

**Enter the Vertical Pod Autoscaler (VPA) in recommendation mode** — it watches your pods and tells you what they actually need:

```yaml
# vpa-recommender.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-server-vpa
spec:
  targetRef:
    apiVersion: "apps/v1"
    kind: Deployment
    name: api-server
  updatePolicy:
    updateMode: "Off"   # Recommendation only - DON'T auto-apply in prod!
  resourcePolicy:
    containerPolicies:
      - containerName: "api-server"
        minAllowed:
          cpu: "10m"
          memory: "32Mi"
        maxAllowed:
          cpu: "2"
          memory: "2Gi"
```

After running for a day or two, check recommendations:

```bash
kubectl describe vpa api-server-vpa

# You'll see something like:
# Recommendation:
#   Container Recommendations:
#     Container Name: api-server
#     Lower Bound:
#       Cpu:     25m
#       Memory:  100Mi
#     Target:
#       Cpu:     80m       <-- Use this for your request
#       Memory:  250Mi     <-- Use this for your request
#     Upper Bound:
#       Cpu:     300m      <-- Use this for your limit
#       Memory:  800Mi     <-- Use this for your limit
```

**This is how I tune resources now.** Deploy with generous limits, run VPA in recommendation mode for a week, then dial in the actual numbers based on real traffic. No more guessing! 🎯

## The Incident Post-Mortem: What I Should Have Done 💡

Back to our 2 PM disaster. Here's what would have saved us:

**1. Resource limits on the image processor:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"    # Allowed to spike but capped
    cpu: "2000m"
```
The pod gets OOMKilled at 2Gi. Other pods? Completely unaffected. ✅

**2. A ResourceQuota on the namespace:**
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"       # Total CPU requests for namespace
    requests.memory: "20Gi"  # Total memory requests for namespace
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "50"               # Max 50 pods in this namespace
```
Even if someone deploys a beefy job, it can't consume more than the namespace quota. The rest of the cluster is protected. ✅

**3. Pod Disruption Budget for critical services:**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-server-pdb
spec:
  minAvailable: 2   # Always keep at least 2 replicas running
  selector:
    matchLabels:
      app: api-server
```
Even during evictions and node pressure, Kubernetes won't take your service below 2 replicas. ✅

## Common Mistakes That Will Bite You 🪤

**Mistake #1: Setting CPU limit too low**

CPU limits cause throttling, not killing. Your pod stays alive but becomes SLOW. A Node.js app with a 50m CPU limit will feel like it's running on a Raspberry Pi from 2012.

**Fix:** Be generous with CPU limits. CPU throttling is silent and hard to debug. Memory limits — be strict (leaks are real).

**Mistake #2: Setting memory request == memory limit**

This is called a **Guaranteed QoS class** and it means Kubernetes will never, ever evict this pod under memory pressure. Great for databases. Terrible for 40 API replicas — you just reserved 40x your RAM and can't actually fit that many pods on your nodes.

**Fix:** Set request to ~25-50% of limit for most workloads. Use `Guaranteed` class only for stateful/critical services.

**Mistake #3: Forgetting init containers**

```yaml
# Init containers need resources too!
initContainers:
  - name: db-migrate
    image: myapp/migrate:latest
    resources:
      requests:
        memory: "64Mi"
        cpu: "50m"
      limits:
        memory: "256Mi"
        cpu: "200m"
```

Init containers run before your main container. If they have no limits and a migration goes wild, guess what happens? (Spoiler: same 2 PM disaster, but before your app even starts.)

**Mistake #4: Never updating limits after your app grows**

You set 128Mi in January when your service was tiny. By August it's handling 10x the traffic. Your pods are hitting the limit and crashing every few hours. Everyone thinks there's a bug.

**Fix:** Review resource usage quarterly. Use `kubectl top pods` and the VPA recommender. Treat resource limits like code — they need maintenance.

## Quick Commands You'll Actually Use 🔧

```bash
# See resource usage right now
kubectl top pods -n production
kubectl top nodes

# Check what limits a pod has
kubectl get pod my-pod -o jsonpath='{.spec.containers[*].resources}' | jq

# Find pods with no resource limits (the gremlins)
kubectl get pods -A -o json | jq '.items[] |
  select(.spec.containers[].resources.limits == null) |
  {name: .metadata.name, namespace: .metadata.namespace}'

# Watch eviction events in real time
kubectl get events -n production --field-selector reason=OOMKilling -w

# Describe node pressure
kubectl describe node my-node | grep -A 10 "Allocated resources"
```

## The Bottom Line 💡

Resource requests and limits aren't optional configuration. They're the difference between a cluster that self-heals and one that cascades into a 2 PM meltdown.

The pattern that works:
1. **Always set both requests and limits** — no exceptions
2. **Use LimitRange** as a safety net for the whole namespace
3. **Use VPA in recommendation mode** to tune numbers from real data
4. **Use ResourceQuota** to protect namespaces from each other
5. **Add PodDisruptionBudgets** for anything customer-facing

Your cluster is a shared resource. One unconstrained pod can ruin everyone's day. Don't be that pod.

## Your Action Plan 🚀

**Right now (5 minutes):**
```bash
# Find your pods with no resource limits
kubectl get pods -A -o json | jq -r '.items[] |
  select(.spec.containers[].resources == {}) |
  "\(.metadata.namespace)/\(.metadata.name)"'
```
If that list is long, you have work to do.

**This week:**
1. Add resource requests and limits to your 3 most critical deployments
2. Deploy a LimitRange to your production namespace
3. Install VPA in recommendation mode and let it observe

**This month:**
1. Set ResourceQuotas on all namespaces
2. Add PodDisruptionBudgets to customer-facing services
3. Set up alerts for OOMKilled events in your monitoring stack
4. Review VPA recommendations and tune your limits

The cluster you save might be your own. 🎯

---

**Still flying without resource limits?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — let's talk about how to harden your Kubernetes setup before production teaches you the hard way!

**Want to see real production manifests?** Check out my [GitHub](https://github.com/kpanuragh) for battle-tested Kubernetes configs.

*Now go forth and constrain those pods!* 🐳✂️

---

**P.S.** `kubectl top pods` showing a pod at 98% of its memory limit? Go fix it NOW. That's not a warning — that's a countdown. ⏳

**P.P.S.** The image processor that killed our cluster? It was processing a 4K video someone uploaded. With no memory limit, it grabbed 14GB of RAM. On a 16GB node. With 20 other pods. Never again. 😅
