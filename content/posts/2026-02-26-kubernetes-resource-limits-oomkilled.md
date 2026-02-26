---
title: "🚨 Stop Getting OOMKilled: Kubernetes Resource Limits That Actually Work"
date: "2026-02-26"
excerpt: "Your pods keep dying with OOMKilled and you have no idea why? After surviving countless 3 AM pages from Kubernetes eating my apps alive, I figured out the exact resource limits strategy that keeps pods happy — and your pager silent."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# 🚨 Stop Getting OOMKilled: Kubernetes Resource Limits That Actually Work

**True story:** It was 2 AM. My phone was screaming. Production was down. I logged into the cluster, bleary-eyed, and saw the most horrifying message in Kubernetes history:

```
State: Terminated
Reason: OOMKilled
Exit Code: 137
```

My pod had been murdered. By Kubernetes. The very thing I trusted to keep my app alive had **strangled it to death** because I forgot to set resource limits properly.

Sound familiar? Let's fix this — before your next 2 AM wake-up call. ☕

## Why Kubernetes Kills Your Pods 🔪

Kubernetes is not your enemy. It's actually doing you a favour. When a pod exceeds its memory limit, the kernel's Out-Of-Memory (OOM) killer swoops in and terminates it before it takes down the entire node — and every other pod on it.

Think of it like this: your Kubernetes node is an apartment building. If one tenant starts inflating a massive bouncy castle that pushes into everyone else's unit, the building manager (Kubernetes) has to evict that tenant. Otherwise the whole building collapses.

The three most common ways developers accidentally summon the OOM killer:

1. **No limits set** — your pod can eat ALL available memory on the node
2. **Limits set too low** — your pod runs out of headroom during a traffic spike
3. **Requests ≠ Limits** — Kubernetes schedules pods on nodes that can't actually support them at peak

## Requests vs. Limits: The Distinction That Changes Everything 🎯

This is the most misunderstood thing about Kubernetes resources. Most devs treat them as synonyms. They are not.

| Setting | What it means | Effect |
|---------|--------------|--------|
| `requests` | "I need *at minimum* this much" | Used for **scheduling** — Kubernetes uses this to decide which node gets your pod |
| `limits` | "I will never exceed this much" | Used for **enforcement** — exceed memory limit → OOMKilled; exceed CPU limit → throttled |

**Here's the trap:** if you set `memory requests: 256Mi` but `memory limits: 256Mi`, your pod has zero breathing room. One spike in traffic and it's gone. But if you set `requests: 256Mi` and `limits: 512Mi`, Kubernetes schedules conservatively but lets your pod burst when needed.

```yaml
# Bad: Requests = Limits with no headroom
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "256Mi"   # 💀 Zero breathing room
    cpu: "250m"

---

# Good: Requests for scheduling, limits for protection
resources:
  requests:
    memory: "256Mi"   # Guaranteed minimum
    cpu: "250m"       # 0.25 CPU cores guaranteed
  limits:
    memory: "512Mi"   # Can burst to this
    cpu: "500m"       # Can burst to 0.5 CPU cores
```

**CPU note:** CPU limits cause throttling, not death. Your pod slows down — it doesn't die. Memory limits cause OOMKilled. This is why memory management is the sneaky killer. 🧠

## The Right Way to Set Resource Limits (The Strategy I Actually Use) 📐

Here's my battle-tested approach after deploying dozens of services to production Kubernetes clusters:

### Step 1: Run Without Limits First (In Staging!)

Never guess at limits in production. Deploy to staging WITHOUT limits, run realistic load tests, then measure actual usage:

```bash
# After your load test, check actual resource usage
kubectl top pods -n staging

# Output:
# NAME                    CPU(cores)   MEMORY(bytes)
# myapp-7d8b9f-xk2pq     185m         203Mi
# myapp-7d8b9f-wl9qr     210m         198Mi
# myapp-7d8b9f-nm3vs     170m         215Mi
```

Now you have real data. Not guesses. Real numbers from real traffic.

### Step 2: Apply the 20/50 Rule

From actual measurements:
- **Memory requests** = P95 observed usage
- **Memory limits** = P95 usage × 1.5 (50% headroom for spikes)
- **CPU requests** = average observed usage
- **CPU limits** = peak observed usage × 1.2 (20% burst headroom)

```yaml
# Based on our staging data above:
# P95 memory ≈ 215Mi, so limits = 215 × 1.5 ≈ 325Mi
# Average CPU ≈ 185m, peak ≈ 210m, so limits ≈ 255m

resources:
  requests:
    memory: "215Mi"
    cpu: "185m"
  limits:
    memory: "325Mi"
    cpu: "255m"
```

### Step 3: Set Up LimitRange So You Never Forget

The real lesson from getting burned at 2 AM? I had a pod with NO resource limits at all. It just... wasn't there. The pod got deployed, nobody noticed, and it eventually ate the node.

Kubernetes has a built-in guard for this: `LimitRange`. Slap this in every namespace and you'll never ship unlimited pods again:

```yaml
# limitrange.yaml — put this in every namespace!
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:           # Applied when no limit is specified
      memory: "256Mi"
      cpu: "200m"
    defaultRequest:    # Applied when no request is specified
      memory: "128Mi"
      cpu: "100m"
    max:               # No container can exceed these
      memory: "2Gi"
      cpu: "2000m"
    min:               # No container can go below these
      memory: "32Mi"
      cpu: "10m"
```

**Apply it and sleep better at night:**

```bash
kubectl apply -f limitrange.yaml -n production

# Verify it's working
kubectl describe limitrange default-limits -n production
```

Now even if a developer forgets resource limits, Kubernetes automatically applies the defaults. No more rogue pods eating your nodes alive. 🛡️

## The OOMKilled Debugging Checklist (When It Already Happened) 🔍

You're awake at 2 AM. Pod is dead. Here's how to figure out what killed it in under 5 minutes:

```bash
# 1. Confirm it's OOMKilled
kubectl describe pod <pod-name> -n production | grep -A5 "Last State"

# Look for:
# Last State: Terminated
#   Reason: OOMKilled
#   Exit Code: 137

# 2. Check current memory limit
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[0].resources}'

# 3. Look at the events for context
kubectl get events -n production --sort-by='.lastTimestamp' | tail -20

# 4. Check if it's a memory leak vs. just low limits
kubectl top pods -n production --sort-by=memory

# If the pod's memory was climbing steadily before death → likely a leak
# If it spiked once → likely limits are too low for traffic spikes
```

**If you see the memory steadily climbing before the kill:** you have a memory leak, not just a limits problem. Raising limits will just delay the inevitable — fix the leak! 🕳️

**If you see it spike once:** your limits are too tight for your traffic patterns. Apply the 20/50 rule and redeploy.

## Real-World Lessons Learned (The Hard Way) 💀

**Lesson 1: Node.js loves memory.** V8's garbage collector is lazy by default. It'll happily accumulate memory and only clean up when it feels like it. For Node.js apps, I set limits 2x higher than Java apps of equivalent size.

**Lesson 2: Sidecars count.** That Datadog agent sidecar? The Envoy proxy? They all consume memory. A pod with 3 containers needs enough total limit for all three. I've seen pods OOMKilled because the log-shipping sidecar ate all the headroom.

**Lesson 3: Set Namespace ResourceQuota too.** A LimitRange caps individual pods; a ResourceQuota caps the entire namespace. Without it, one bad deployment can starve all other pods:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: namespace-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"       # Total CPU requests across all pods
    requests.memory: 20Gi    # Total memory requests
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"               # Max 50 pods in this namespace
```

**Lesson 4: Use Vertical Pod Autoscaler (VPA) in recommendation mode.** VPA watches your actual usage and recommends better limits without changing anything — pure intelligence, zero risk:

```bash
# Install VPA, then create a VPA object in "Off" mode
# It watches your pods and recommends optimal limits
kubectl describe vpa myapp-vpa -n production

# Output includes:
# Lower Bound: memory: 180Mi
# Target:      memory: 245Mi
# Upper Bound: memory: 400Mi
```

VPA's recommendation is your new baseline. Free advice from Kubernetes itself. 🤖

## The Complete Production Deployment Template 🏭

Here's what my production deployments look like now. Battle-tested. OOMKill-resistant. 3 AM-silent.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:v1.0.0
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"   # Guaranteed allocation for scheduling
            cpu: "250m"       # 0.25 cores guaranteed
          limits:
            memory: "512Mi"   # 2x requests — room to breathe
            cpu: "500m"       # Throttled (not killed) if exceeded
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

The liveness and readiness probes aren't just nice-to-haves — they're what allow Kubernetes to restart an unhealthy pod gracefully instead of letting it sit in a broken state eating memory. Always include them.

## Your Action Plan 🚀

**Today:**
1. Check your existing pods: `kubectl get pods -o json | jq '.items[].spec.containers[].resources'`
2. Find any pods with no resource limits (they'll show `{}`)
3. Apply a LimitRange to every namespace — takes 2 minutes, saves your 2 AM

**This week:**
1. Run a load test in staging with `kubectl top pods` monitoring
2. Apply the 20/50 rule to set real limits based on real data
3. Deploy ResourceQuota to cap namespace-wide consumption
4. Install VPA in recommendation mode and let it observe for 7 days

**This month:**
1. Review VPA recommendations and adjust limits accordingly
2. Set up alerts for memory usage > 80% of limit (before it dies, not after)
3. Add resource limits to your Helm chart defaults so new services inherit good values automatically

---

The difference between a team that gets paged at 3 AM and one that sleeps through the night? It's not smarter engineers — it's resource limits set with actual data, plus the safety nets that catch the gaps.

Your pods don't have to die. Set limits that give them room to breathe. 🐳

---

**Got burned by OOMKilled before?** Tell me your horror story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company, and shared war stories make better engineers.

**Want to see my Helm chart templates?** Check out my [GitHub](https://github.com/kpanuragh) — real production configs with real resource limits.

*Now go set those limits before your pager does it for you.* 🚨💤
