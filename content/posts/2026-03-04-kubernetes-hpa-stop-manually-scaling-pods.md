---
title: "Kubernetes HPA: Stop Manually Scaling Your Pods (Let the Robot Do It) 🤖📈"
date: "2026-03-04"
excerpt: "Still SSHing into your cluster at 2 AM to scale up pods during traffic spikes? After getting paged one too many times, I set up Kubernetes Horizontal Pod Autoscaling — and now my cluster handles Black Friday traffic while I sleep like a baby."
tags: ["\\\"devops\\\"", "\\\"kubernetes\\\"", "\\\"scaling\\\"", "\\\"infrastructure\\\""]
featured: "true"
---

# Kubernetes HPA: Stop Manually Scaling Your Pods (Let the Robot Do It) 🤖📈

**A tale of two engineers:**

**Engineer A** gets paged at 2 AM because traffic spiked and pods are OOMKilled. They scramble to SSH in, run `kubectl scale deployment myapp --replicas=10`, go back to sleep, wake up at 6 AM to scale back down, and repeat this forever.

**Engineer B** set up a Horizontal Pod Autoscaler six months ago and slept through the traffic spike. In the morning, they checked Grafana over coffee and saw a beautiful scale-up/scale-down curve while their HPA did exactly what it was supposed to do.

Guess which engineer I was for embarrassingly long? 😅

Let me save you from the midnight paging.

## What Even Is HPA? 🤔

The Kubernetes Horizontal Pod Autoscaler automatically scales the number of pod replicas in a deployment based on observed metrics. CPU usage, memory, custom metrics — you name it, HPA can scale on it.

Think of it as a thermostat for your application:
- Traffic heats up → HPA turns up pods
- Traffic cools down → HPA scales pods back down
- You → sleep soundly 😴

The best part? It's built right into Kubernetes. No plugins, no third-party tools, no excuses.

## The Setup That Finally Fixed My 2 AM Pages 🛠️

Here's the basic HPA that saved my sanity:

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2      # Never go below 2 (availability!)
  maxReplicas: 20     # Never go above 20 (budget!)
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale when avg CPU > 70%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80  # Scale when avg memory > 80%
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30    # Scale up fast!
      policies:
        - type: Pods
          value: 4                       # Add up to 4 pods at once
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300   # Scale down slowly (5 min cooldown)
      policies:
        - type: Pods
          value: 2                       # Remove at most 2 pods at once
          periodSeconds: 60
```

Apply it with:

```bash
kubectl apply -f hpa.yaml

# Watch it in action
kubectl get hpa myapp-hpa --watch

# Output:
# NAME        REFERENCE          TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
# myapp-hpa   Deployment/myapp   45%/70%         2         20        3          5m
```

**Critical detail:** Notice the `behavior` section. Default HPA scales down aggressively, which means a traffic spike at 2:01 AM can cause your pods to scale up, then scale back down by 2:05 AM before the next wave hits — leaving your users with a terrible experience. The `stabilizationWindowSeconds: 300` on scale-down prevents that yo-yo effect.

**Lesson learned the hard way:** Without the behavior tuning, I had pods scaling up and down every 3 minutes during a sustained traffic event. My deployment logs looked like a sine wave. 📉📈📉📈

## The Resource Requests Problem Nobody Warns You About 💥

Here's the gotcha that burned me my first time:

**HPA doesn't work without resource requests on your pods.** Full stop.

HPA calculates utilization as: `current usage / requested resources`. If your pod has no resource request, the denominator is zero, and the HPA controller throws its hands up and does nothing.

```yaml
# deployment.yaml — this HPA setup REQUIRES these resource requests
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    spec:
      containers:
        - name: myapp
          image: myapp:latest
          resources:
            requests:
              cpu: "250m"      # 0.25 CPU cores — HPA needs this!
              memory: "256Mi"  # 256MB RAM — HPA needs this!
            limits:
              cpu: "1000m"     # 1 CPU core max
              memory: "512Mi"  # 512MB max
```

**My debugging session from hell:**

```bash
kubectl describe hpa myapp-hpa

# Events:
# Warning  FailedGetScale  Unable to fetch metrics: unable to get metrics
#          for resource cpu: no metrics returned from resource metrics API

# Translation: "I have no idea what your pods are doing because you
# never told me what they're supposed to use." 🤦
```

Once I added resource requests, the HPA started working in about 30 seconds. Three hours of debugging for a two-line fix.

## Scaling on Custom Metrics: The Advanced Stuff 🎯

CPU and memory are a blunt instrument. What you really want to scale on is: *requests per second*, *queue depth*, *database connection count* — the business metrics that actually matter.

Here's how to scale on HTTP requests per second using Prometheus metrics:

```yaml
# hpa-custom-metrics.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa-custom
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 50
  metrics:
    # Still use CPU as a backstop
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80

    # Scale on actual traffic — this is the smart one
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # Scale when avg > 100 RPS per pod
```

For this to work, you need the [Prometheus Adapter](https://github.com/kubernetes-sigs/prometheus-adapter) installed. It bridges Kubernetes' custom metrics API with your Prometheus data. Once it's wired up, HPA can scale on literally anything you can express as a Prometheus metric.

**Real talk:** This setup took me an afternoon to configure correctly, but it's worth it. Scaling on RPS is way more accurate than scaling on CPU for web apps. Your API might handle 200 req/s at 15% CPU, or it might handle 50 req/s at 85% CPU depending on what those requests do. RPS scaling gets it right either way.

## The Incident That Made Me A Believer 🚨

Two months after setting up HPA, our product went viral. Traffic went from ~800 req/min to ~12,000 req/min in about 15 minutes (thank you, tech Twitter).

**What happened:**
- 09:14 AM — Traffic starts climbing
- 09:17 AM — HPA detects CPU hitting 72% (above our 70% threshold)
- 09:18 AM — HPA scales from 3 → 7 pods
- 09:19 AM — Traffic keeps climbing, HPA adds 4 more pods
- 09:22 AM — 11 pods running, p99 latency stable at 180ms
- 09:45 AM — Traffic peaks and levels off
- 10:15 AM — HPA starts scaling back down (5-minute cooldown window)
- 10:30 AM — Back to 3 pods

**What I did during this incident:** Drank my coffee. Watched the Grafana dashboard like it was a movie. Posted "our HPA is doing its job" in Slack.

Before HPA? I would've been manually running `kubectl scale` commands while simultaneously trying to figure out if we were actually down, responding to panicked Slack messages, and spilling my coffee.

## Cluster Autoscaler: The Missing Piece 🧩

One important thing: HPA scales pods, but pods need nodes to run on. If you max out your node capacity, new pods will sit in `Pending` state and HPA can't help you.

The solution is Cluster Autoscaler (or Karpenter on AWS, which is better and faster). It watches for pending pods and adds nodes automatically.

```bash
# Install Cluster Autoscaler on AWS EKS
helm repo add autoscaler https://kubernetes.github.io/autoscaler
helm install cluster-autoscaler autoscaler/cluster-autoscaler \
  --namespace kube-system \
  --set autoDiscovery.clusterName=my-cluster \
  --set awsRegion=us-east-1

# Check if it's working
kubectl -n kube-system logs -l app.kubernetes.io/name=cluster-autoscaler | tail -20
```

**The combo that actually works in production:**
- HPA: Scales pods based on load
- Cluster Autoscaler: Scales nodes based on pod demand
- Resource requests: Tells the scheduler what pods need
- PodDisruptionBudgets: Ensures at least N pods are always running during scale-down

Together, these four things form a self-healing, self-scaling system that handles most traffic patterns without human intervention.

## Common HPA Mistakes to Avoid 🪤

**1. Setting maxReplicas too low** — If max is 5 and you need 20, HPA hits the ceiling and your users suffer anyway. Set your max based on your actual traffic projections, not your comfort level.

**2. Not setting minReplicas >= 2** — `minReplicas: 1` means a rolling restart takes down your entire app. Always run at least 2.

**3. Forgetting Metrics Server** — HPA requires the Kubernetes Metrics Server. Many managed clusters (GKE, EKS) include it; others don't. Check with `kubectl top nodes` — if it errors, you need Metrics Server.

**4. Too aggressive scale-down** — The default behavior scales down quickly, which causes the yo-yo problem on bursty traffic. Always tune `stabilizationWindowSeconds` on scale-down.

**5. Setting CPU target too low** — A target of `30%` means you'll have 10 pods sitting mostly idle. Set targets around `60-70%` so each pod is doing real work.

## Watch Your HPA in Action 📊

```bash
# Get current status
kubectl get hpa -n production

# Detailed view with events
kubectl describe hpa myapp-hpa -n production

# Watch it respond in real-time
kubectl get hpa myapp-hpa -n production --watch

# Load test it yourself (with hey or k6)
hey -n 100000 -c 50 https://your-api.com/health

# Watch the replicas climb in another terminal
kubectl get pods -n production -l app=myapp --watch
```

There's something deeply satisfying about watching pods spin up automatically in response to load you generated yourself. It's like watching a Rube Goldberg machine do exactly what you designed it to do.

## Your Action Plan 🚀

If you're still manually scaling pods, here's how to fix that this week:

1. **Today:** Add resource requests to all your deployments (if you haven't already)
2. **Today:** Deploy a basic HPA targeting 70% CPU with a 5-minute scale-down window
3. **This week:** Load test your setup — send traffic and watch pods scale
4. **This week:** Set up Cluster Autoscaler so node capacity isn't the bottleneck
5. **Next week:** Explore custom metrics scaling based on your app's real traffic patterns

The first time HPA handles a traffic spike without waking you up, you'll feel the same joy I felt. It's not just automation — it's getting your nights back.

Stop being Engineer A. Set up your HPA and become Engineer B. ☕🤖

---

**Got HPA questions or horror stories from before you set it up?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out more battle-tested configs on my [GitHub](https://github.com/kpanuragh).

*Now go configure that autoscaler — your future self at 2 AM will thank you.* 📈✨
