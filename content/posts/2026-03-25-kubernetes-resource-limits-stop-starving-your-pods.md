---
title: "Kubernetes Resource Limits: Stop Starving (and Suffocating) Your Pods 🐳💀"
date: "2026-03-25"
excerpt: "Skipped setting resource requests and limits? Your cluster is a ticking time bomb. After watching production nodes get OOM-killed at 3am, I learned the hard way - here's how to set sane limits before your pods eat each other alive."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Starving (and Suffocating) Your Pods 🐳💀

**True story:** It was 3:07am. My phone buzzed. PagerDuty. The production cluster was down — not one service, *all of them*. A single rogue microservice had eaten every byte of memory on the node, the Linux OOM killer woke up angry, and it started murdering pods indiscriminately like a toddler with a Nerf gun.

The culprit? A memory leak in a background job. The accomplice? **No resource limits set on any pod.**

Welcome to the one Kubernetes lesson you only want to learn once.

---

## Why Resource Limits Actually Matter 🤔

Kubernetes schedules pods onto nodes like a hotel concierge assigning rooms. But here's the catch: without resource **requests**, Kubernetes has no idea how "big" your pod is. It's like checking into a hotel and saying "I need *some* rooms" — the concierge just shrugs and guesses.

Without resource **limits**, your pod can consume as much CPU and memory as it wants. That background job that usually uses 200MB? On a bad day with a memory leak, it'll happily eat 16GB until the node collapses.

Two concepts to know:

- **Requests**: "I will *probably* need this much." Kubernetes uses this for scheduling decisions.
- **Limits**: "I am *never* allowed to use more than this." Kubernetes enforces this at runtime.

Think of requests as your restaurant reservation (planning) and limits as the bouncer at the door (enforcement).

---

## The Bare Minimum Config That Will Save You 🛡️

Here's a simple deployment with properly set resources:

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
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: my-api
          image: my-api:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

A few things happening here:

- **`100m` CPU** = 0.1 of one CPU core (milliCPU). A full core is `1000m`. Your API doesn't need a whole core just to parse JSON.
- **`128Mi` memory request** = Kubernetes promises this node has 128MB free before scheduling.
- **`512Mi` memory limit** = If the pod tries to grab more, it gets OOM-killed. Better one pod dies than the whole node.

**Golden rule:** Set your request at roughly your *average* usage and your limit at your *maximum acceptable* usage. Don't guess — use `kubectl top pods` to observe real usage first.

---

## The LimitRange: Sane Defaults for Lazy Developers 😅

Here's a dirty secret: most developers deploy to Kubernetes and forget to set limits. Including me. Including probably half your team.

The fix? Enforce defaults at the namespace level with a `LimitRange`:

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
        cpu: "250m"
      defaultRequest:
        memory: "64Mi"
        cpu: "50m"
      max:
        memory: "1Gi"
        cpu: "1000m"
      min:
        memory: "32Mi"
        cpu: "10m"
```

Drop this into your namespace and every pod that forgets to set limits automatically gets the defaults. It's like the Kubernetes equivalent of "if you don't pick a seat, we'll pick one for you" — except the seat won't explode.

The `max` values also prevent anyone from accidentally requesting a 64GB memory pod in the wrong cluster. (Ask me how I know that's possible.)

---

## Real-World Lessons From Production Pain 🔥

**Lesson 1: CPU limits can throttle, not kill**

Unlike memory (where hitting the limit = OOM kill), hitting a CPU limit just throttles the container. Your app slows down instead of crashing. This sounds nicer, but it means a CPU-hungry pod will silently get slower and slower until your users notice before your monitors do. Set CPU limits conservatively and monitor throttling with `container_cpu_cpi_throttled_seconds_total` in Prometheus.

**Lesson 2: Java/JVM apps lie about memory**

The JVM grabs memory aggressively at startup. Set your container memory limit and the JVM will happily grab more than the limit if you don't tune the heap. Add `-Xmx` and `-Xms` flags to match your container limit, or use the newer container-aware JVM flags: `-XX:+UseContainerSupport`. Otherwise Kubernetes will kill your pod the moment it starts. Fun times.

**Lesson 3: Requests affect scheduling, nothing else**

A pod with `request: 1Gi` will only land on a node with 1Gi free. But once scheduled, it can use up to its *limit* — even if that's 4Gi. Nodes can get overcommitted. This is by design, but if every pod on the node suddenly spikes at once... see the 3am story above.

---

## Quick Debugging Cheatsheet 🚀

```bash
# See actual resource usage per pod
kubectl top pods -n production

# See what's happening to a pod that keeps restarting
kubectl describe pod <pod-name> -n production
# Look for: OOMKilled, Reason: Error, Last State

# See resource requests/limits for all pods
kubectl get pods -n production -o json | \
  jq '.items[] | {name: .metadata.name, resources: .spec.containers[].resources}'

# See how much of each node is allocated
kubectl describe nodes | grep -A5 "Allocated resources"
```

The `OOMKilled` exit code in `kubectl describe pod` is your smoking gun for memory limit violations. If you see it, your limit is too low OR you have a memory leak to fix.

---

## The Three Rules to Live By 📋

1. **Always set both requests AND limits.** No exceptions. Use LimitRange as a safety net, not a crutch.
2. **Measure before you set.** Deploy with loose limits, observe with `kubectl top`, then tighten.
3. **Never set memory requests == memory limits for production workloads.** Leave headroom for spikes, or you'll get OOM-killed on a normal traffic bump.

---

## Wrapping Up 🎯

Kubernetes resource management isn't glamorous. Nobody puts "I know how to set `resources.requests`" on their resume. But the difference between a cluster that handles a traffic spike gracefully and one that melts down at 3am is often just 10 lines of YAML.

Set your limits. Save your sleep. Your future on-call self will write you a thank-you note.

**Now go check your deployments** — `kubectl get deploy -A -o json | jq '.items[] | select(.spec.template.spec.containers[].resources == {}) | .metadata.name'` — and if anything comes back, fix it before it pages you at 3am.

Drop a comment if you've been OOM-killed in production. You're not alone. We've all been there. 🤝
