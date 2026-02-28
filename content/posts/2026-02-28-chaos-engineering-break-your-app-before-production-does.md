---
title: "Chaos Engineering: Break Your App on Purpose Before Production Does It for You 🐒🔥"
date: "2026-02-28"
excerpt: "After years of being paged at 3 AM by outages nobody saw coming, I discovered the secret Netflix uses to sleep at night: deliberately blowing things up on their own terms. Chaos engineering isn't crazy — running production systems you've never stress-tested IS."
tags: ["devops", "deployment", "chaos-engineering", "resilience", "aws"]
featured: true
---

# Chaos Engineering: Break Your App on Purpose Before Production Does It for You 🐒🔥

**Hot take:** The most professional thing I ever did as a Technical Lead was tell my team "We're going to intentionally crash production today."

The silence in that Slack channel was deafening. 😅

But here's the thing — after countless deployments and more 3 AM pages than I care to count, I've learned that production *will* find your weaknesses. The only question is: do YOU find them first, in a controlled experiment, or does production find them at 11:59 PM on Black Friday?

Welcome to chaos engineering. Where breaking things is the job.

## The Incident That Converted Me 💀

It was a Wednesday afternoon. Beautiful weather. Low traffic. My team was celebrating a successful release.

Then: **our primary database went down for routine maintenance** (we knew about it!), and the app switched to the read replica.

What happened next was... not great:

```
[ERROR] Redis connection pool exhausted
[ERROR] Job queue backing up
[ERROR] Session store unavailable
[CRITICAL] 87% of users logged out simultaneously
[CRITICAL] Orders failing silently — no error shown to users
[PANIC] 2,400 support tickets in 15 minutes
```

**The database failover worked perfectly.** The app itself? Completely forgot how to handle it.

We had tested the failover. We had NOT tested what our application did during a failover. Turns out — it panicked like a golden retriever in a thunderstorm. 🐕⚡

Three engineers spent 8 hours firefighting what a 30-minute chaos experiment would have caught weeks earlier.

## What Is Chaos Engineering? 🤔

**The fancy definition:** "Chaos Engineering is the discipline of experimenting on a system to build confidence in the system's capability to withstand turbulent conditions in production."

**The real definition:** You run controlled experiments that ask "what happens if X breaks?" — before X actually breaks.

Netflix invented this in 2011 with a tool called **Chaos Monkey** that randomly terminated EC2 instances *in production*. Not staging. Not dev. Production.

The idea: if your system can survive random instance terminations every day, it's actually resilient. If it can't survive them in a controlled experiment with engineers watching... it definitely won't survive them at 2 AM when nobody's watching.

```
Without Chaos Engineering:
  Production → 💥 → 3 AM page → 8-hour incident → postmortem
      ↑ YOU DISCOVER THE WEAKNESS HERE

With Chaos Engineering:
  Planned experiment → 💥 → Fix it → Done
      ↑ YOU DISCOVER THE WEAKNESS HERE (while awake, coffee in hand)
```

## The Chaos Engineering Mindset 🧠

Before you start blowing things up, internalize three rules:

**Rule #1: Start small and safe**
Don't start by killing your database. Start by... introducing 100ms of extra latency on one endpoint. Baby steps.

**Rule #2: Define "steady state" first**
You need to know what "normal" looks like before you can measure "chaos." Baseline metrics matter.

**Rule #3: Always have a kill switch**
Every experiment needs an abort button. Something goes wrong? Stop the experiment immediately. This isn't demolition derby — it's science.

```yaml
# Your chaos experiment checklist
pre_experiment:
  - ✅ Define success metrics (error rate < 0.1%, p99 < 500ms)
  - ✅ Have rollback plan ready
  - ✅ Alert on-call team that experiment is happening
  - ✅ Check business calendar (never run during peak hours!)
  - ✅ Limit blast radius (one region, one service)

during_experiment:
  - ✅ Monitor dashboards continuously
  - ✅ Set time limit (30 minutes max for first experiments)
  - ✅ Document everything you observe
  - ✅ Stop if anything unexpected happens

post_experiment:
  - ✅ Review results vs hypothesis
  - ✅ File bugs for every weakness found
  - ✅ Share learnings with the team
```

## Your First Chaos Experiments: Easy Wins 🎯

### Experiment #1: Kill a Pod (Start Here)

This is your "Hello, World" of chaos engineering. If you're on Kubernetes:

```bash
# Find a non-critical pod to kill
kubectl get pods -n production

# Kill it
kubectl delete pod my-api-pod-abc123 -n production

# Watch what happens
kubectl get pods -n production -w

# Questions to answer:
# - How long until a new pod comes up?
# - Did any requests fail during that window?
# - Did your load balancer detect the death fast enough?
# - Did anything else break that you didn't expect?
```

**What I discovered my first time:** Our health check was on port 80, but our readiness probe was checking `/health` which called the database. During a pod restart, 40% of requests hit the new pod before it was actually ready. The app returned 500s silently. Users got a blank screen with no error message.

**Fixed in:** 2 hours.
**Would have discovered in production:** When half our users got blank screens during a rolling deploy.

### Experiment #2: Network Latency Injection

Real production doesn't fail cleanly. Things get *slow* before they die. Use `tc` (traffic control) to simulate bad network conditions:

```bash
# SSH into a container/instance
# Add 500ms latency to all outbound traffic
tc qdisc add dev eth0 root netem delay 500ms

# Add 500ms average latency with 100ms jitter
tc qdisc add dev eth0 root netem delay 500ms 100ms

# Add 10% packet loss
tc qdisc add dev eth0 root netem loss 10%

# Add random corruption (really nasty!)
tc qdisc add dev eth0 root netem corrupt 5%

# Remove when done (your kill switch!)
tc qdisc del dev eth0 root
```

**What I discovered:** Our third-party payment gateway had a 30-second timeout. We called it synchronously. Under network latency, every checkout request held a database connection open for 30 seconds. Under load, this exhausted our connection pool in 47 seconds.

**Fixed with:** Async payment processing + queue. Also: a timeout of 8 seconds instead of 30.

### Experiment #3: AWS Fault Injection Simulator (FIS)

If you're on AWS, FIS is your chaos engineering superpower. Properly managed, with IAM, audit logs, and abort conditions:

```json
{
  "description": "Test what happens when RDS primary fails",
  "targets": {
    "rdsCluster": {
      "resourceType": "aws:rds:cluster",
      "resourceArns": ["arn:aws:rds:us-east-1:123456789:cluster:my-db"],
      "selectionMode": "ALL"
    }
  },
  "actions": {
    "failoverRDS": {
      "actionId": "aws:rds:failover-db-cluster",
      "parameters": {},
      "targets": {
        "Clusters": "rdsCluster"
      }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:us-east-1:123456789:alarm:ErrorRateHigh"
    }
  ],
  "roleArn": "arn:aws:iam::123456789:role/FISRole"
}
```

The `stopConditions` part is critical — if your error rate alarm fires, **FIS automatically stops the experiment.** This is your kill switch built into the infrastructure. A CI/CD pattern that saved our team from accidental full-scale incidents during experiments.

### Experiment #4: Chaos Toolkit (Open Source, Free)

Don't want to pay for AWS FIS? Chaos Toolkit is the open-source Swiss Army knife:

```bash
pip install chaostoolkit chaostoolkit-kubernetes

# Define your experiment in JSON
cat > experiment.json << 'EOF'
{
  "title": "Can our API survive a Redis failure?",
  "description": "Redis goes down. Do requests fail gracefully or cascade?",
  "steady-state-hypothesis": {
    "title": "API responds normally",
    "probes": [
      {
        "type": "probe",
        "name": "api-health-check",
        "tolerance": 200,
        "provider": {
          "type": "http",
          "url": "http://api.myapp.com/health"
        }
      }
    ]
  },
  "method": [
    {
      "type": "action",
      "name": "kill-redis-pod",
      "provider": {
        "type": "python",
        "module": "chaosk8s.pod.actions",
        "func": "terminate_pods",
        "arguments": {
          "label_selector": "app=redis",
          "ns": "production",
          "qty": 1
        }
      }
    },
    {
      "type": "probe",
      "name": "api-still-working",
      "provider": {
        "type": "http",
        "url": "http://api.myapp.com/health",
        "timeout": 5
      }
    }
  ],
  "rollbacks": [
    {
      "type": "action",
      "name": "restart-redis",
      "provider": {
        "type": "python",
        "module": "chaosk8s.deployment.actions",
        "func": "rollout_statefulset",
        "arguments": {
          "name": "redis",
          "ns": "production"
        }
      }
    }
  ]
}
EOF

# Run it!
chaos run experiment.json
```

**What I found with this exact experiment:** When Redis died, our session middleware didn't have a fallback. Every request returned 500. Not a graceful degradation — a complete meltdown.

**After fix:** Sessions fell back to database (slower but working). Users saw a "slower experience" banner. Business continued. 🎯

## Running Chaos in CI/CD 🔧

Here's where it gets really powerful. Automate chaos experiments in your pipeline:

```yaml
# .github/workflows/chaos-tests.yml
name: Chaos Engineering Tests

on:
  schedule:
    - cron: '0 10 * * 2'  # Every Tuesday at 10 AM (not Friday!)
  workflow_dispatch:       # Manual trigger too

jobs:
  chaos-experiment:
    runs-on: ubuntu-latest
    environment: staging  # NEVER run uncontrolled chaos on prod!

    steps:
      - uses: actions/checkout@v4

      - name: Install Chaos Toolkit
        run: pip install chaostoolkit chaostoolkit-kubernetes

      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}

      - name: Run Chaos Experiment - Redis Failure
        run: chaos run experiments/redis-failure.json

      - name: Run Chaos Experiment - Slow Database
        run: chaos run experiments/slow-database.json

      - name: Run Chaos Experiment - Pod Termination
        run: chaos run experiments/pod-termination.json

      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: chaos-results
          path: chaos-report/
```

**The rule:** Chaos experiments on staging weekly. If staging survives, prod *might* survive. This is the safety ratchet that lets you build confidence before touching production.

## Before vs. After: My Team's Incident Rate 📊

| Metric | Before Chaos Engineering | After 6 Months |
|--------|--------------------------|----------------|
| Unplanned outages/month | 4.2 | 0.8 |
| Mean Time to Recovery (MTTR) | 3.5 hours | 45 minutes |
| 3 AM pages/month | 8 | 2 |
| "Unknown unknown" failures | Most of them | Very few |
| Team stress level during deploys | 😰😰😰 | 😊 |

The biggest win wasn't the numbers — it was the **confidence**. Deploys stopped feeling like gambling. We *knew* what would happen under failure because we'd seen it happen before.

## Common Chaos Pitfalls (Don't Do This) 🪤

**Pitfall #1: Starting too big**
Do NOT start with "let's take down the database." Start with killing one pod. One service. Small blast radius.

**Pitfall #2: No abort conditions**
Every experiment needs an automated kill switch. A CloudWatch alarm, a Datadog monitor — something that stops the experiment automatically if things go sideways.

**Pitfall #3: Running during peak traffic**
I watched someone run a chaos experiment at 5 PM on a Friday. Do not be that person. Pick low-traffic windows. Tuesday at 10 AM. Not Friday at 5 PM.

**Pitfall #4: Not telling anyone**
"Why are our pods randomly dying?" is not a fun Slack message to receive. Always announce chaos experiments to your team beforehand. Always.

**Pitfall #5: Fixing nothing**
Chaos experiments that don't produce action items are worthless. Every weakness you find needs a ticket, an owner, and a deadline. Otherwise you're just... breaking things for fun.

## The Tools Worth Your Time 🛠️

```bash
# Open Source
Chaos Toolkit      → chaostoolkit.org    # Best for K8s
Chaos Mesh         → chaos-mesh.org      # K8s native, great UI
Pumba              → github.com/alexei-led/pumba  # Docker focused
Gremlin Free       → gremlin.com/free    # Nice UI, limited free tier

# Cloud Native
AWS FIS            → Built into AWS, great for RDS/EC2/ECS
Azure Chaos Studio → Same idea, Azure native
GCP Fault Injection → GCP's version

# The OG
Netflix Chaos Monkey → github.com/Netflix/chaosmonkey  # The original, K8s version available
```

My personal stack: **Chaos Toolkit** for K8s experiments in CI/CD, **AWS FIS** for infrastructure-level experiments (RDS failovers, AZ outages), and **Pumba** for Docker-level stuff in local dev.

## TL;DR — Start Chaos Engineering This Week 🚀

1. **Define your steady state** — what does "normal" look like? (Latency, error rate, throughput)
2. **Start with pod termination** — kill one pod, watch what happens
3. **Move to network latency** — simulate slow external dependencies
4. **Add to CI/CD on staging** — automate the experiments weekly
5. **Graduate to production** — small experiments, with kill switches, during off-peak hours

The question isn't "should we run chaos experiments?"

The question is: "Do you want to discover your weaknesses, or have your users discover them for you?"

After countless deployments that have gone wrong in ways I never imagined, I know my answer. I'll take the controlled experiment every single time. 🐒

---

**Running chaos experiments already?** Tell me what you found — I'm on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and I collect good disaster-to-lesson stories.

**Want to talk DevOps?** Check my [GitHub](https://github.com/kpanuragh) — I've got real chaos experiment configs from production systems.

*Break things deliberately. Sleep better at night.* 🔥🛌
