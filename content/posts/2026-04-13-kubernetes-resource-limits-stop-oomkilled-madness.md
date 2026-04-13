---
title: "Kubernetes Resource Limits: Stop Getting OOMKilled at 3 AM 💀🔪"
date: "2026-04-13"
excerpt: "Your pod keeps dying with OOMKilled and you have no idea why? After getting paged at 3 AM more times than I care to admit, I learned that Kubernetes resource limits aren't optional — they're the difference between a stable cluster and a cascading meltdown."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---




# Kubernetes Resource Limits: Stop Getting OOMKilled at 3 AM 💀🔪

**True story:** It was 3:17 AM. My phone screamed. PagerDuty. Production down. I fumbled for my laptop, still half asleep, and ran `kubectl get pods`. The output hit me like a cold shower:

```
NAME                    READY   STATUS      RESTARTS   AGE
api-deployment-abc123   0/1     OOMKilled   47         2d
```

**47 restarts.** My pod had been dying and reviving like a zombie movie for two days and I hadn't noticed because the app *mostly* worked in between deaths. The memory leak I'd been "planning to fix eventually" had finally decided to eat an entire node alive.

Welcome to the world of Kubernetes resource limits — the feature most developers ignore until it bites them at an ungodly hour. Let's fix that before it ruins your sleep. 😴

## What Even Are Resource Limits? 🤔

Kubernetes lets you define two things for every container:

- **Requests** — the *guaranteed* minimum. "I need at least this much CPU and memory."
- **Limits** — the *maximum allowed*. "If I go above this, kill me."

Without them, your containers are like unsupervised toddlers in a candy store — they'll eat everything in sight and leave nothing for anyone else.

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Translating the numbers:**
- `250m` CPU = 0.25 cores (m = millicores, 1000m = 1 full core)
- `128Mi` memory = 128 Mebibytes (~134 MB)
- If your container uses more than `512Mi` RAM → **OOMKilled** (Out Of Memory Killed)
- If your container uses more than `500m` CPU → **throttled** (slowed down, not killed)

Simple concept, catastrophic consequences when ignored.

## The Horror Show: What Happens Without Limits 🎃

Here's a real production scenario I witnessed (and survived):

```
Node capacity: 4 CPU, 8 GB RAM
Running pods (no limits set):
  - api:      using 1.2 CPU, 2.1 GB  (expected: 0.2 CPU, 256 MB)
  - worker:   using 2.8 CPU, 4.3 GB  (memory leak!)
  - frontend: using 0.3 CPU, 1.1 GB  (image processing)
  - postgres: using 0.1 CPU, 0.9 GB  (fine)

Total: 4.4 CPU, 8.4 GB ← NODE IS OVER CAPACITY!
```

What happened? Kubernetes started evicting pods "randomly." Except it wasn't random — it evicted based on a system the team had never learned because they'd never set limits. The database pod survived. The API didn't. Users got 503s for 20 minutes while pods fought over scraps.

**The fix took 15 minutes. The learning took 3 AM.** ⏰

## Understanding QoS Classes (Kubernetes Has Priorities) 📊

When you set requests and limits, Kubernetes assigns your pod a **Quality of Service** class. This determines who gets evicted first when the node runs out of resources.

```
QoS Class      | Conditions                          | Eviction Priority
---------------|-------------------------------------|------------------
BestEffort     | No requests or limits set           | First to die 💀
Burstable      | Requests set, limits higher or N/A  | Second to die ⚠️
Guaranteed     | Requests == limits                  | Last to die ✅
```

**Check your pods' QoS class:**

```bash
kubectl get pod my-api-pod -o jsonpath='{.status.qosClass}'
# BestEffort   ← you're living dangerously
# Burstable    ← decent but not great  
# Guaranteed   ← living the dream
```

**For critical services like databases or payment APIs, always aim for Guaranteed:**

```yaml
# Guaranteed QoS: requests == limits
resources:
  requests:
    memory: "256Mi"
    cpu: "500m"
  limits:
    memory: "256Mi"
    cpu: "500m"
```

**Yes, this means your container CANNOT burst above its request.** That's the point — predictability over flexibility for the things that absolutely cannot go down.

## Real-World Config Examples: What I Actually Deploy 🏭

### The Stateless API Pod

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
      - name: api
        image: myregistry/api:v1.2.3
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "256Mi"   # Scheduler uses this to pick a node
            cpu: "100m"       # 0.1 core guaranteed
          limits:
            memory: "512Mi"   # OOMKilled if exceeded
            cpu: "500m"       # Throttled if exceeded (not killed)
        # Health checks — without these, k8s doesn't know if you're actually alive
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
          failureThreshold: 3
```

**Why the memory limit is 2x the request:** APIs can spike during traffic bursts (large request bodies, response caching warm-ups). The request says "I reliably need 256Mi," the limit says "but cap me at 512Mi before I ruin the party for everyone else."

### The Background Worker (Memory-Hungry Beast)

```yaml
containers:
- name: image-processor
  image: myregistry/worker:v2.1.0
  resources:
    requests:
      memory: "1Gi"     # Image processing is RAM-hungry
      cpu: "500m"       # CPU-intensive work
    limits:
      memory: "2Gi"     # Hard cap — this thing CAN develop leaks
      cpu: "2000m"      # 2 cores max — don't starve other pods
  env:
  - name: MAX_CONCURRENT_JOBS
    value: "4"           # Match this to your CPU limit!
```

**Lessons learned the hard way:** If your worker processes images or PDFs, it WILL spike memory. Set the limit high enough to handle a few items in-flight, but not so high that one misbehaving job takes down the node.

### The Redis Sidecar (The Disciplined One)

```yaml
- name: redis-cache
  image: redis:7-alpine
  resources:
    requests:
      memory: "64Mi"
      cpu: "50m"
    limits:
      memory: "128Mi"    # Redis respects maxmemory config
      cpu: "100m"
  command: ["redis-server", "--maxmemory", "100mb", "--maxmemory-policy", "allkeys-lru"]
```

**Critical pattern here:** Set Redis's `maxmemory` to slightly LESS than the container limit. If Redis thinks it has 128Mi but the container limit is also 128Mi, Redis will try to use 128Mi, the kernel will OOMKill it, and you'll lose your entire cache. Set `maxmemory` to 80-90% of the limit as a buffer.

## How to Actually Figure Out Your Numbers 📏

The #1 mistake: **guessing**. The right approach: measure first, then set limits.

**Step 1: Run without limits in staging, observe actual usage:**

```bash
# Watch real-time resource usage for all pods
kubectl top pods --all-namespaces

# Watch a specific pod over time
watch -n 2 kubectl top pod api-server-abc123

# Get detailed metrics with percentiles (requires metrics-server)
kubectl top pods --sort-by=memory
```

**Step 2: Look at the numbers under realistic load:**

```bash
# Run a load test first
kubectl run load-test --image=grafana/k6 --rm -it -- \
  run - <<< "
import http from 'k6/http';
export default function() {
  http.get('http://api-service/endpoint');
}
export const options = { vus: 50, duration: '30s' };
"

# WHILE THAT RUNS, in another terminal:
kubectl top pods -l app=api-server --watch
```

**Step 3: Set requests at ~p50 usage, limits at ~p99:**

```
Observed memory during load test:
  Idle:     45 MB
  p50:      120 MB   ← set as request
  p95:      280 MB
  p99:      380 MB   ← set as limit (with some headroom)

Final config:
  requests.memory: "128Mi"
  limits.memory:   "512Mi"  ← extra headroom above p99
```

The extra headroom above p99 is intentional. You're not running load tests with the exact production traffic pattern. Give yourself a cushion. The alternative is 3 AM OOMKilled alerts.

## LimitRange: Enforce Sanity Across Your Team 🏛️

One rogue developer can deploy an unlimited container and tank your entire namespace. Use `LimitRange` to make limits mandatory and set sensible defaults:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:           # Applied if container has NO limits set
      memory: "256Mi"
      cpu: "500m"
    defaultRequest:    # Applied if container has NO requests set
      memory: "128Mi"
      cpu: "100m"
    max:               # Nobody can exceed this
      memory: "4Gi"
      cpu: "4000m"
    min:               # Nobody can go below this
      memory: "32Mi"
      cpu: "10m"
```

**Apply this to every namespace.** Now even if someone forgets to set resources, they get sensible defaults instead of BestEffort hell. And if someone tries to spin up a 16GB memory container, Kubernetes will reject it with a validation error instead of silently ruining your day.

## ResourceQuota: Total Namespace Caps 🚧

`LimitRange` controls individual containers. `ResourceQuota` controls the entire namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"       # Total CPU requests in this namespace
    requests.memory: "20Gi"  # Total memory requests
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "50"               # Max pods in this namespace
    services: "20"
```

**Why this matters:** Without `ResourceQuota`, one team's deployment in a shared cluster can claim all available resources, starving every other team's workloads. With it, every namespace gets a guaranteed slice of the pie.

## The OOMKilled Debugging Checklist 🔍

When you do get OOMKilled (and you will), here's the fastest path to resolution:

```bash
# 1. Check if it's actually OOMKilled
kubectl describe pod <pod-name> | grep -A 5 "OOMKilled"
kubectl describe pod <pod-name> | grep "Last State"

# 2. Check how close you are to the limit normally  
kubectl top pod <pod-name> --containers

# 3. Look at events for the pod
kubectl get events --field-selector involvedObject.name=<pod-name> --sort-by='.lastTimestamp'

# 4. Check node pressure (maybe the node itself is the problem)
kubectl describe node <node-name> | grep -A 10 "Conditions:"
# Look for "MemoryPressure: True"

# 5. Quick fix: bump the memory limit (then actually fix the leak!)
kubectl set resources deployment <name> \
  --limits=memory=1Gi \
  --requests=memory=512Mi
```

**The permanent fix:** If you're constantly bumping limits, you have a memory leak. Limits are not a substitute for fixing leaky code — they're a circuit breaker that prevents one bad pod from killing everything else.

## The Bottom Line 💡

Kubernetes resource limits are like seatbelts — annoying to put on until you need them, and then suddenly you're very glad they exist.

**The minimum viable setup for any production workload:**
1. **Always set requests** — so the scheduler can make intelligent placement decisions
2. **Always set limits** — so a bug doesn't take down your entire node
3. **Apply LimitRange to every namespace** — so forgetful developers are protected from themselves
4. **Measure before you guess** — run load tests, watch `kubectl top pods`, then set numbers based on reality

The difference between a cluster that stays up at 3 AM and one that doesn't? It's usually a few lines of YAML that take 10 minutes to add.

Those 10 minutes are worth every hour of uninterrupted sleep. 😴

## Your Action Plan 🚀

**Do this today:**
1. Run `kubectl top pods --all-namespaces` — find every pod with no resource data (they have no limits!)
2. Add a `LimitRange` to your most critical namespace
3. Set `requests` and `limits` on your most important deployment

**Do this week:**
1. Run a load test against staging and capture real memory/CPU numbers
2. Set proper resources on all production deployments based on observed data
3. Add `ResourceQuota` to namespaces shared between teams
4. Set up alerts for pods with high restart counts: `kubectl get pods -A | awk '$5 > 5'`

**Do this month:**
1. Automate resource recommendations with [VPA (Vertical Pod Autoscaler)](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) in recommendation mode
2. Audit your QoS classes — critical services should be Guaranteed
3. Document your resource sizing rationale in comments in your manifests

Your future self, asleep at 3 AM while the cluster handles traffic spikes gracefully, will thank you. 🎉

---

**Still getting paged for OOMKilled pods?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've debugged more memory leaks than I care to count.

**Want to see how I structure Kubernetes manifests in real projects?** Check out my [GitHub](https://github.com/kpanuragh).

*Now go set some resource limits before your pods eat your nodes alive!* 🚀
