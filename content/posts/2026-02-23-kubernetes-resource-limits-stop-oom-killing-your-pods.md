---
title: "Kubernetes Resource Limits: Stop Your Pods from Getting OOM-Killed at 3 AM ☸️💀"
date: "2026-02-23"
excerpt: "Your pod is running fine in staging, then dies mysteriously in production. No logs, no warning, just 'OOMKilled'. After getting paged at 3 AM one too many times, here's everything you need to know about Kubernetes resource limits and requests."
tags: ["kubernetes", "devops", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Your Pods from Getting OOM-Killed at 3 AM ☸️💀

Picture this: it's 3:17 AM. Your phone screams. Your monitoring dashboard is a Christmas tree of red alerts. The on-call rotation has blessed you with this beautiful gift — and the error message in Slack just says `OOMKilled`.

No stack trace. No meaningful logs. Just vibes and a dead pod.

I've been there. And the root cause, almost every single time? Missing or wrong resource limits and requests. This is the one Kubernetes concept that developers consistently skip because it seems optional — until production punishes you for it.

Let me save your sleep.

## Requests vs. Limits: The Critical Distinction 🤔

These two fields get confused constantly, so let's be precise:

- **Requests**: What your pod *asks for* — Kubernetes uses this to decide which node to schedule it on. Think of it as your deposit.
- **Limits**: The hard ceiling your container can never exceed. Cross this line and the kernel OOM-killer comes knocking.

If you set a memory **request** of 256Mi but no **limit**, your container can gobble up every byte of RAM on the node and bring down every other pod with it. Congratulations, you just invented a noisy neighbor problem.

Here's what a well-configured deployment looks like:

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
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

The `250m` CPU notation means 250 millicores — a quarter of one CPU core. Not "250 megabytes" (that's a trap that bites everyone at least once).

## The Golden Rule: Always Set Both 📏

Here's where most tutorials stop and where most engineers get burned:

**Never set limits without requests.** If you omit `requests`, Kubernetes defaults them to equal the limit. That makes your pod look very resource-hungry on paper, and the scheduler might refuse to place it anywhere.

**Never set requests without limits.** Your pod can now consume unbounded resources. On a busy cluster this is chaos. A memory leak in one pod can cascade into evictions across unrelated services.

The ratio between request and limit is called your **burstability**. A rule of thumb:
- Start with limits at **2x** your requests
- Narrow it as you learn your actual consumption

## Diagnose Before You Guess 🔬

Stop guessing at values. Use metrics to set them correctly from the start.

If you have Metrics Server installed (and you should), run:

```bash
# See actual current resource usage per pod
kubectl top pods -n your-namespace

# Drill into a specific pod's containers
kubectl top pod my-api-7d9f8b-xkp2q --containers -n your-namespace

# Check past OOMKill events
kubectl get events -n your-namespace --field-selector reason=OOMKilling

# Describe a pod to see its resource spec and last termination reason
kubectl describe pod my-api-7d9f8b-xkp2q -n your-namespace
```

The `describe` output will show you a `Last State` section with `Reason: OOMKilled` and the exact exit code (`137` — the kernel's signature for memory-limit enforcement). That's your smoking gun.

Once you see real usage numbers from `kubectl top`, set your **request** to ~110% of the average and your **limit** to ~200% of the average. Then watch it for a week before tightening.

## LimitRanges: Enforce Sane Defaults Cluster-Wide 🛡️

One more thing nobody talks about until a junior engineer deploys a pod with no limits and takes down the cluster: **LimitRange**.

A LimitRange is a namespace-level policy that injects default requests and limits for any pod that forgets to specify them:

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
        memory: "512Mi"
        cpu: "500m"
      defaultRequest:
        memory: "128Mi"
        cpu: "100m"
      max:
        memory: "2Gi"
        cpu: "2"
```

With this in place, a pod that ships without any `resources` block automatically gets the defaults injected at admission time. And any pod claiming more than 2Gi RAM gets rejected before it ever reaches a node. Your cluster, your rules.

## Lessons Learned the Hard Way 🔥

A few things I wish someone had told me earlier:

**CPU throttling is silent.** Unlike memory (which kills), exceeding a CPU limit just throttles the container. Your pod stays alive but runs slower and slower. Latency creeps up, SLAs get missed, and you spend three hours blaming the database. Check `container_cpu_throttled_seconds_total` in Prometheus if something feels slow but won't die.

**Staging is a lie.** Staging traffic is 1/10th of production, so your memory request of 64Mi looks totally fine there. Then production load hits and your app's internal caches balloon to 600Mi. Set limits based on load-tested peak usage, not idle staging numbers.

**Vertical Pod Autoscaler (VPA) exists.** It watches your actual resource consumption over time and automatically adjusts requests and limits. It won't replace understanding the fundamentals, but once you know what you're doing, VPA in recommendation mode is a great sanity check.

## Your Action Plan 📋

1. Run `kubectl top pods` on your cluster right now. Find any pods with suspiciously high or low resource usage.
2. Check for any pods with no `resources` block: `kubectl get pods -A -o json | jq '.items[] | select(.spec.containers[].resources == {}) | .metadata.name'`
3. Apply a `LimitRange` to every namespace that doesn't have one.
4. Set up an alert on `kube_pod_container_status_last_terminated_reason == "OOMKilled"` in your alerting system.

Resource limits aren't just a best practice — they're the difference between a cluster that handles failure gracefully and one that turns a single memory leak into a full-site outage at 3 AM.

Your future sleep-deprived self will thank you.

---

*Have a horror story about OOMKilled pods? Drop it in the comments — misery loves company. And if you found this useful, share it with the person on your team who's still deploying pods without resource limits (you know who they are).*
