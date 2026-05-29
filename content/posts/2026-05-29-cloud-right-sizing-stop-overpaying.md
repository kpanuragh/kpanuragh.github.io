---
title: "📏 Cloud Right-Sizing: Stop Guessing, Start Measuring"
date: "2026-05-29"
excerpt: "Your 8-core VM is running at 3% CPU. Your Kubernetes pods are OOMKilled every Tuesday. Right-sizing fixes both — but only if you stop guessing and start measuring what your workloads actually need."
tags: ["devops", "cloud", "cost-engineering", "kubernetes", "aws", "platform-engineering"]
featured: true
---

# 📏 Cloud Right-Sizing: Stop Guessing, Start Measuring

Here's a scene that plays out on every cloud bill I've ever reviewed.

A developer deploys a service. They don't know what resources it needs, so they pick numbers that *feel safe*. `requests.cpu: 1000m`. `limits.memory: 2Gi`. A `t3.large` EC2 instance just in case. The service runs fine. Nobody looks at the actual usage. Six months later, the billing alarm fires and someone discovers they've been running a cron job on a machine with 11 GB of unused RAM.

This is not an exaggeration. At Cubet, we did a cost audit across several client environments last year and found services consistently using 10–15% of their requested CPU. One job had been provisioned with 4 vCPUs since its launch. It peaked at 0.2 cores during execution. We'd been paying for 3.8 phantom CPUs for eight months.

Right-sizing is the practice of matching allocated resources to actual workload requirements — not vibes, not "what if it spikes," not copying the number from your colleague's YAML. Here's how to do it properly.

---

## Why Guessing Is Expensive in Both Directions

Over-provisioning is the obvious culprit. You reserve compute you don't use, and cloud providers charge you for the reservation. On AWS, a `m5.2xlarge` (8 vCPU, 32 GB) runs about $0.384/hour. An `m5.large` (2 vCPU, 8 GB) is $0.096/hour. If your workload fits the smaller instance, you're burning $2,500/year per node for nothing.

Under-provisioning is sneakier. In Kubernetes, if your pod's memory *request* is too low, the scheduler might place it on a node with limited headroom, and when the actual process grows, it gets OOMKilled. Your on-call gets paged at 2 AM, you restart the pod, and you assume it's a memory leak. Sometimes it is. Often, you just lied to the scheduler about how much memory your app actually uses.

The fix for both problems is the same: measure first, set resources second.

---

## Step 1: See What's Actually Running

In Kubernetes, `kubectl top` is your first stop:

```bash
# Check pod-level resource consumption
kubectl top pods -n production --sort-by=cpu

# Check node-level headroom
kubectl top nodes
```

This gives you a snapshot. Useful, but not sufficient — a single snapshot during off-peak hours misses your Tuesday batch job that eats 3× the normal memory for 20 minutes.

You want time-series data. If you have Prometheus + Grafana, query actual usage over a rolling window:

```promql
# 95th percentile CPU usage over the last 7 days, per container
quantile_over_time(0.95,
  rate(container_cpu_usage_seconds_total{namespace="production"}[5m])[7d:5m]
) * 1000
```

The `[7d:5m]` range vector samples 5-minute rates over 7 days. The `0.95` quantile gives you a ceiling that covers normal peaks without being dominated by a single spike. Use this number — not the average, and not the maximum — as the basis for your CPU request.

---

## Step 2: Let Goldilocks Do the Heavy Lifting

[Goldilocks](https://github.com/FairwindsOps/goldilocks) is a tool that runs the Kubernetes Vertical Pod Autoscaler (VPA) in recommendation mode across your namespaces and surfaces the suggestions in a dashboard. It never changes anything automatically — it just tells you what the VPA *would* set if you let it.

Install it in a cluster and it will tell you, per container, what the VPA recommends for `requests` and `limits` based on actual observed usage. You look at the dashboard, decide which recommendations make sense, and update your manifests.

A typical Goldilocks recommendation for an underprovisioned API server might look like:

```yaml
# What your manifest currently says
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2000m"
    memory: "2Gi"

# What Goldilocks recommends (based on 7-day observation)
resources:
  requests:
    cpu: "120m"
    memory: "180Mi"
  limits:
    cpu: "400m"
    memory: "300Mi"
```

That's a 75% reduction in CPU reservation and 65% reduction in memory reservation, with data to back it up. On a 10-pod deployment, that frees up significant scheduler headroom and lets you pack more workloads onto fewer nodes.

---

## Step 3: Right-Size Your EC2 / Cloud Instances

For VM-level right-sizing, AWS Compute Optimizer is genuinely useful. It looks at CloudWatch metrics over 14 days and tells you whether to move to a smaller instance, a different instance family (e.g., compute-optimized `c6i` instead of general `m6i`), or whether you're fine.

The key insight: **instance family matters as much as size**. A workload that's CPU-bound but RAM-light might be paying for general-purpose memory it never touches. Moving from `m5.xlarge` (4 vCPU, 16 GB) to `c5.xlarge` (4 vCPU, 8 GB) can cut costs 20% for the same CPU performance.

Enable Compute Optimizer in your AWS account:

```bash
aws compute-optimizer update-enrollment-status --status Active --include-member-accounts
```

Then check recommendations after 14 days of data collection. Filter for "Over-provisioned" findings and sort by estimated monthly savings. Start with the quick wins.

---

## The Workflow That Actually Sticks

The reason most teams don't right-size is that it feels like a one-time project instead of a habit. Here's what we do at Cubet to make it stick:

1. **Tag everything** — every resource gets `owner`, `service`, and `env` tags. Cost anomalies become attributable.
2. **Weekly Goldilocks review** — 15-minute meeting, look at the dashboard, update any recommendation that's been stable for 7+ days.
3. **New service checklist** — no new Kubernetes deployment ships without a VPA recommendation after one week in staging. Staging traffic is enough to get a baseline.
4. **Budget alerts per namespace** — if a namespace crosses its estimated monthly spend, the owning team gets an alert before it shows up on the invoice.

The cultural shift is more important than the tooling. Right-sizing stops being a fire drill and starts being part of the deployment lifecycle.

---

## The Golden Rule

Set your Kubernetes resource **request** at the 95th percentile of observed usage. Set your **limit** at 1.5–2× the request — enough headroom for legitimate spikes, not enough to hide a memory leak.

Don't copy numbers from Stack Overflow. Don't copy them from your colleague's service that does something completely different. Measure your workload, let the data speak, and update your manifests accordingly.

Your cloud bill will thank you. So will your on-call rotation.

---

*Running on Kubernetes and not sure where to start? Try installing Goldilocks in a non-production namespace for a week. The recommendations alone will tell you where the biggest savings are hiding.*
