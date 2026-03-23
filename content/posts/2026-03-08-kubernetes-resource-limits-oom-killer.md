---
title: "Kubernetes Resource Limits: Stop Letting Your Pods Eat All the Memory 🍽️💥"
date: "2026-03-08"
excerpt: "Your pod is OOMKilled at 3 AM and you have no idea why. After getting paged one too many times, I learned the hard truth about Kubernetes resource limits and requests — and why ignoring them is basically leaving a buffet open for your worst-behaved microservice."
tags: ["\\\"devops\\\"", "\\\"kubernetes\\\"", "\\\"docker\\\"", "\\\"deployment\\\""]
featured: "true"
---

# Kubernetes Resource Limits: Stop Letting Your Pods Eat All the Memory 🍽️💥

**Real story:** It was a Tuesday night. My phone buzzed. PagerDuty. I squinted at the screen:

```
ALERT: payment-service CrashLoopBackOff
Reason: OOMKilled
Restarts: 47
```

**47 restarts.** The pod had been silently dying and restarting all night while I slept peacefully. Users were getting 502 errors on checkout. Somewhere, a shopping cart full of items was giving up on life.

The root cause? I had deployed a pod with **no resource limits**. It quietly ate all the memory on the node, the kernel's OOM killer swooped in like a bouncer at closing time, and the cycle repeated. Forever.

Welcome to the Kubernetes resource limits talk you needed six months ago. 🤝

## What Are Requests and Limits? (They're Not the Same Thing) 🤔

This trips up almost everyone. Kubernetes has **two separate knobs** for resources:

| Concept | What it means | Analogy |
|---------|--------------|---------|
| **Request** | "I need at least this much" | Reserving a table at a restaurant |
| **Limit** | "I cannot use more than this" | Your credit card limit |

```yaml
resources:
  requests:
    memory: "128Mi"   # Scheduler guarantees this much is available
    cpu: "250m"       # 250 millicores = 0.25 CPU cores
  limits:
    memory: "512Mi"   # Pod gets OOMKilled if it exceeds this
    cpu: "1000m"      # Pod gets CPU-throttled if it exceeds this
```

**Key insight:** Requests affect *scheduling* (where the pod lands). Limits affect *runtime* (what happens when it misbehaves). Setting neither is how you get paged at 3 AM.

## The OOMKilled Horror Show 💀

When a pod exceeds its memory **limit**, the Linux kernel OOM killer steps in. It's not polite about it. Your process gets `SIGKILL` — no graceful shutdown, no cleanup, no goodbye. Just: gone.

```bash
# Checking why your pod keeps dying
kubectl describe pod payment-service-7d4b8f9c6-xk2qp

# You'll see something like:
# Last State: Terminated
#   Reason: OOMKilled
#   Exit Code: 137
#   Started: Tue, 08 Mar 2026 02:14:33
#   Finished: Tue, 08 Mar 2026 02:14:51

# Exit code 137 = 128 + 9 (SIGKILL)
# Translation: "The kernel killed your process, have a nice day 👋"
```

**Exit code 137** is the Kubernetes equivalent of your app throwing its hands up and walking out. If you see it, check your memory limits immediately.

The really sneaky part? If you set no limits at all, your pod can consume memory until the **entire node** runs out of resources. Then Kubernetes starts evicting OTHER pods from that node to survive. Your rogue service becomes a resource bully that crashes its neighbors. 😈

## CPU Throttling: The Quiet Killer Nobody Talks About 🐌

Here's the thing about CPU limits that nobody warns you about: unlike memory, hitting your CPU limit doesn't kill your pod. It **throttles** it. Silently. Invisibly.

```yaml
# This looks reasonable...
resources:
  requests:
    cpu: "100m"
  limits:
    cpu: "200m"   # But what happens when your service spikes?
```

Your pod needs 800m CPU for 100ms to handle a burst of traffic. But you've limited it to 200m. Kubernetes throttles it down. That 100ms burst now takes 400ms. Your latency p99 goes from 50ms to 400ms. Your SLA says 200ms. Alerts fire. Customers complain. You're debugging a performance issue with no obvious cause.

**The lesson I learned the hard way:** CPU limits are often more dangerous than no limits at all. Many Kubernetes experts recommend setting CPU *requests* but **not** CPU limits, and relying on proper node autoscaling instead.

## Setting Resources Correctly: A Practical Guide 🎯

### Step 1: Measure Before You Guess

Don't pull numbers out of thin air. Run your service and measure it:

```bash
# Watch live resource usage for your pods
kubectl top pods -n production

# NAME                        CPU(cores)   MEMORY(bytes)
# api-server-7d4b8-xk2qp     45m          87Mi
# worker-5c9f6-p8qr2          312m         203Mi
# payment-service-2b8f9-mn4t  8m           44Mi

# Now you have REAL numbers to work with!
```

```bash
# For more detail, check per-container usage
kubectl top pods --containers -n production

# Or use Prometheus + Grafana to see historical peaks
# container_memory_working_set_bytes is your friend
```

**Golden rule:** Your request should cover your typical usage. Your limit should cover your peak usage with some headroom (I use 2x peak as a starting point).

### Step 2: Write Sane Resource Configs

Here's a template that works for most Node.js/Python/Go services:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api-service
          image: myapp:1.2.3
          resources:
            requests:
              # Base: what you need under normal load
              memory: "128Mi"
              cpu: "100m"
            limits:
              # Max: what you allow under burst (2-3x requests for memory)
              memory: "384Mi"
              # cpu: intentionally omitted — let it burst freely
              # (set this only if you MUST isolate noisy neighbors)

          # Always add liveness/readiness probes alongside resources!
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

**Why I skip CPU limits in most cases:**
- Memory limits protect the node from being eaten alive
- CPU throttling causes invisible latency spikes
- Horizontal Pod Autoscaling (HPA) handles load spikes better than CPU limits

### Step 3: Set Up LimitRange (The Safety Net)

Forget to set resources on a deployment? LimitRange has your back. It applies defaults to every pod in a namespace automatically:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:           # Applied if limits not specified
        memory: "256Mi"
        cpu: "500m"
      defaultRequest:    # Applied if requests not specified
        memory: "64Mi"
        cpu: "50m"
      max:               # Nobody in this namespace can exceed this
        memory: "2Gi"
        cpu: "4"
      min:               # Nobody can go below this
        memory: "16Mi"
        cpu: "10m"
```

**This one config file saved my team from "mystery OOMKilled" incidents** after a new developer deployed a service with no resources defined. LimitRange caught it and applied sane defaults automatically. 🛡️

## The ResourceQuota: Keeping Namespaces Honest 📊

LimitRange controls individual pods. ResourceQuota controls the whole namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    # Total across ALL pods in this namespace
    requests.cpu: "20"
    requests.memory: "40Gi"
    limits.cpu: "40"
    limits.memory: "80Gi"

    # Also limit number of objects
    pods: "50"
    services: "20"
    persistentvolumeclaims: "10"
```

This is how you prevent one team from accidentally deploying 200 replicas and starving everyone else. When I was working in a multi-team cluster, one team's runaway autoscaler consumed **all the memory on 4 nodes** before anyone noticed. ResourceQuota would have stopped it at the namespace boundary.

## Real Production Lessons Learned 📖

**Lesson 1: JVM apps lie about their memory**

Java apps with a 512Mi limit will cheerfully tell the JVM it has 512Mi available — but the JVM then allocates heap PLUS off-heap (metaspace, code cache, threads). The pod gets OOMKilled at 512Mi while the JVM thinks it's using 300Mi.

```yaml
# For Java: set -Xmx to 70% of your limit
env:
  - name: JAVA_OPTS
    value: "-Xmx358m -Xms128m"  # 70% of 512Mi limit
resources:
  requests:
    memory: "256Mi"
  limits:
    memory: "512Mi"
```

**Lesson 2: Init containers need resources too**

```yaml
initContainers:
  - name: db-migrate
    image: myapp:1.2.3
    command: ["./migrate"]
    resources:          # Don't forget this!
      requests:
        memory: "64Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
```

I once watched a migration init container get OOMKilled 12 times before the main pod ever started. The pod never became Ready. Kubernetes just kept retrying. 12 database migrations ran. Partially. Fun times. 🙃

**Lesson 3: Vertical Pod Autoscaler (VPA) can help you tune**

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-service-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  updatePolicy:
    updateMode: "Off"   # "Off" = recommend only, don't auto-apply
```

Run VPA in recommendation mode for a week, then check:

```bash
kubectl describe vpa api-service-vpa

# Recommendation:
#   Container Recommendations:
#     Container Name: api-service
#     Lower Bound:
#       Cpu: 25m
#       Memory: 52428800   # ~50Mi
#     Target:
#       Cpu: 56m
#       Memory: 104857600  # ~100Mi
#     Upper Bound:
#       Cpu: 156m
#       Memory: 314572800  # ~300Mi
```

**Real numbers from real traffic.** Use these as your starting point instead of guessing.

## The Quick Checklist Before Every Deployment ✅

Before you `kubectl apply`, make sure:

```bash
# 1. Check your deployment has resources defined
kubectl get deployment my-service -o jsonpath='{.spec.template.spec.containers[0].resources}'

# 2. Verify the namespace has a LimitRange
kubectl get limitrange -n production

# 3. Check you're not hitting ResourceQuota
kubectl describe resourcequota -n production

# 4. After deploy, watch for OOMKills
kubectl get events -n production --field-selector reason=OOMKilling

# 5. Monitor resource usage post-deploy
watch kubectl top pods -n production
```

## The Bottom Line 💡

Kubernetes without resource limits is like a restaurant with no prices on the menu. Everything seems fine until the bill arrives — and in this case, the bill is your node going down at 3 AM.

**The pattern that works:**
- ✅ Always set memory **requests** and **limits**
- ✅ Always set CPU **requests** (skip limits unless you have a reason)
- ✅ Install LimitRange as namespace defaults
- ✅ Use ResourceQuota for team/namespace isolation
- ✅ Measure first with `kubectl top`, then set values
- ✅ Run VPA in recommendation mode to tune over time

The 20 minutes you spend setting resources properly will save you from hours of 3 AM debugging. Your pods will behave. Your nodes will survive. And your PagerDuty will stay quiet.

That's the dream. 🌙

## Your Action Plan 🚀

**Today:**
1. Run `kubectl top pods -n <your-namespace>` and look at real usage
2. Find any deployments without resources: `kubectl get pods -o json | jq '.items[].spec.containers[].resources'`
3. Add a LimitRange to your most critical namespace

**This week:**
1. Add `resources:` blocks to every deployment
2. Deploy VPA in recommendation mode to gather data
3. Set up a Grafana dashboard for `container_oom_events_total`

**This month:**
1. Tune values based on real usage data
2. Add ResourceQuota per namespace
3. Set up alerts for OOMKilled events before they wake you up at night

---

**Got paged because of OOMKilled pods?** You're not alone. Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and we can commiserate.

**Want to see real Kubernetes configs?** Check out my [GitHub](https://github.com/kpanuragh) for battle-tested deployment templates.

*Now go set those resource limits — before the OOM killer sets them for you.* 💪

---

**P.S.** Exit code 137 is the new 404. If you see it, check your memory limits. If you don't have memory limits, that's your answer. 🎯
