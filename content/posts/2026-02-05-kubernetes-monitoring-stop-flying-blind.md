---
title: "Kubernetes Monitoring: Stop Flying Blind in Production 📊🔍"
date: "2026-02-05"
excerpt: "After 7 years of production deployments, I learned the hard way: if you can't see what's happening in your K8s cluster, you're one outage away from disaster. Here's how to actually monitor Kubernetes without drowning in metrics!"
tags: ["\\\"devops\\\"", "\\\"kubernetes\\\"", "\\\"monitoring\\\"", "\\\"observability\\\""]
featured: "true"
---




# Kubernetes Monitoring: Stop Flying Blind in Production 📊🔍

**Real talk:** My first Kubernetes production incident went like this: User reports "site is slow." I SSH into... wait, there's no single server to SSH into. I check pods. Which pods? Where? Are they healthy? What's using all the CPU? Is it even CPU? Memory? Network? After 2 hours of frantic kubectl commands and wild guesses, I found the issue - a single pod was OOMKilled and restart-looping. We could've caught it in 30 seconds with proper monitoring. 😱

**My boss:** "Why didn't we see this coming?"

**Me:** "Uh... because Kubernetes has like 47 moving parts and I was watching... none of them?"

**Him:** "Fix it. Now."

Welcome to the world where monitoring isn't optional - it's how you survive Kubernetes in production!

## What's Different About K8s Monitoring? 🤔

**Traditional server monitoring (The old way):**
```bash
# The simple times
ssh server
top           # CPU and memory
df -h         # Disk space
tail -f logs  # Application logs
# Done! You know what's happening!
```

**Kubernetes monitoring (The new chaos):**
```
Cluster level:
├─ 20 nodes (are they healthy?)
├─ 500 pods (which ones are dying?)
├─ 50 deployments (are they scaling?)
├─ 100 services (is traffic flowing?)
├─ Network policies (are they blocking stuff?)
├─ Persistent volumes (are they full?)
└─ ...and 47 other resources! 🤯

# SSH into a pod?
# It might be gone by the time you connect!
# Welcome to ephemeral infrastructure! 🎭
```

**Translation:** You can't just "tail logs" anymore. You need observability! 🔭

## The Horror Story That Changed Everything 💀

After deploying our Laravel e-commerce backend to production on Kubernetes:

**Black Friday 2022, 3 PM (Peak Traffic!):**

```bash
# User report: "Checkout isn't working!"
Me: *checks Kubernetes dashboard*
# Everything shows green! ✅

# But users still can't checkout...
Me: kubectl get pods
# All pods: Running ✅

Me: kubectl logs payment-service-abc123
# Logs: Everything looks fine! ✅

# 30 minutes later...
Boss: "We've lost $50,000 in sales. What's going on?!"
```

**What was actually happening:**
```bash
# The pod was "Running" but...
- Payment pod was OOMKilled 5 times
- Restarting every 30 seconds
- Load balancer thought it was healthy (wasn't!)
- Each restart = lost payment attempts
- No alerts configured = we had NO IDEA! 💸
```

**How we finally found it:**
```bash
# Frantically digging through kubectl
kubectl describe pod payment-service-abc123

# Buried in the events:
Events:
  Warning  BackOff  10m (x100 over 30m)  kubelet  Back-off restarting failed container
  Warning  OOMKilled  9m (x50 over 29m)  kubelet  Memory limit exceeded
```

**Cost of no monitoring:**
- $50,000 in lost sales
- 2,000+ abandoned checkouts
- My entire Black Friday ruined
- CEO asking "why we use Kubernetes" 😅

**That day I learned:** Kubernetes without monitoring is like flying a plane blindfolded! 🛩️

## The Holy Trinity of K8s Observability 🏆

**You need THREE things:**

1. **Metrics** - What's happening? (Numbers)
2. **Logs** - Why did it happen? (Context)
3. **Traces** - How did requests flow? (Journey)

**Without all three, you're guessing!**

## Solution #1: The Prometheus + Grafana Stack (Free & Powerful) 📈

**Why I love this combo:**
- ✅ Industry standard
- ✅ Free and open source
- ✅ Scrapes K8s metrics automatically
- ✅ Beautiful dashboards
- ✅ Powerful alerting

**The setup (easier than you think!):**

### Step 1: Install Prometheus

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus + Grafana + AlertManager (all in one!)
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set grafana.adminPassword=YourSecurePassword123
```

**Boom! In 2 minutes you get:**
- Prometheus (metrics collection)
- Grafana (visualization)
- AlertManager (alerts)
- Node Exporter (node metrics)
- kube-state-metrics (K8s resource metrics)
- Pre-configured dashboards! 🎉

### Step 2: Access Grafana

```bash
# Port-forward to access locally
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80

# Open http://localhost:3000
# Login: admin / YourSecurePassword123
```

**What you'll see immediately:**
- Cluster overview dashboard
- Node resource usage
- Pod CPU/memory
- Network traffic
- Disk usage
- Everything! 🤩

### Step 3: Set Up Critical Alerts

```yaml
# alerting-rules.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts
  namespace: monitoring
data:
  alerts.yaml: |
    groups:
    - name: kubernetes-alerts
      interval: 30s
      rules:
      # Alert: Pod is crash-looping
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Pod {{ $labels.pod }} is crash-looping"
          description: "Pod has restarted {{ $value }} times in 15 minutes"

      # Alert: High memory usage
      - alert: PodHighMemory
        expr: |
          container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} high memory usage"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      # Alert: High CPU usage
      - alert: PodHighCPU
        expr: |
          rate(container_cpu_usage_seconds_total[5m]) > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} high CPU usage"

      # Alert: Node not ready
      - alert: NodeNotReady
        expr: kube_node_status_condition{condition="Ready",status="true"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.node }} not ready"

      # Alert: Deployment has no available replicas
      - alert: DeploymentReplicasUnavailable
        expr: |
          kube_deployment_status_replicas_available == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Deployment {{ $labels.deployment }} has 0 available replicas"

      # Alert: Persistent Volume almost full
      - alert: PersistentVolumeAlmostFull
        expr: |
          kubelet_volume_stats_available_bytes / kubelet_volume_stats_capacity_bytes < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PV {{ $labels.persistentvolumeclaim }} is 90% full"
```

**Apply the alerts:**
```bash
kubectl apply -f alerting-rules.yaml
```

**After setting up Prometheus**, I sleep better knowing alerts will wake me up BEFORE users do! 😴

## Solution #2: The ELK Stack for Logs (Centralized Logging) 📋

**The problem:** Logs scattered across 500 pods that come and go!

**The solution:** Ship all logs to one place!

**ELK = Elasticsearch + Logstash + Kibana**

### Quick Setup with Fluentd (Easier than ELK!)

```bash
# Install Fluentd (log shipper)
kubectl apply -f https://raw.githubusercontent.com/fluent/fluentd-kubernetes-daemonset/master/fluentd-daemonset-elasticsearch.yaml

# Fluentd runs on EVERY node
# Automatically collects logs from ALL pods
# Ships to Elasticsearch (or your choice!)
```

**Fluentd config for custom parsing:**

```yaml
# fluentd-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: kube-system
data:
  fluent.conf: |
    # Collect logs from Kubernetes pods
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>

    # Add Kubernetes metadata (pod name, namespace, etc.)
    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>

    # Filter out noisy logs
    <filter kubernetes.**>
      @type grep
      <exclude>
        key log
        pattern /healthcheck/
      </exclude>
    </filter>

    # Ship to Elasticsearch
    <match kubernetes.**>
      @type elasticsearch
      host elasticsearch.monitoring.svc.cluster.local
      port 9200
      logstash_format true
      logstash_prefix kubernetes
      include_tag_key true
    </match>
```

**What you get:**
- ✅ All logs in one place
- ✅ Search across ALL pods at once
- ✅ Logs survive pod restarts
- ✅ Powerful filtering and search
- ✅ Log retention (30 days, 90 days, whatever!)

**Real debugging example:**

```
# Before centralized logging:
kubectl logs payment-pod-abc123
# Pod already deleted! Log gone! 😱

# After centralized logging:
# Search Kibana: "payment AND error AND user_id:12345"
# Find the error from 3 days ago in a deleted pod! ✅
```

**A deployment pattern that saved our team:** Centralized logging turned 2-hour debugging sessions into 2-minute investigations! 🔍

## Solution #3: Distributed Tracing with Jaeger 🕵️

**The mystery:** Request is slow. But WHERE in the 15-microservice chain?

```
User Request
  ↓
  API Gateway (50ms)
  ↓
  Auth Service (30ms)
  ↓
  Payment Service (??? 5000ms ???) ← CULPRIT!
  ↓
  Order Service (40ms)
  ↓
  Email Service (100ms)
```

**Without tracing:** "It's slow somewhere... check everything!" 🤷

**With tracing:** "Payment Service external API call is taking 5 seconds!" 🎯

**Install Jaeger:**

```bash
# Deploy Jaeger all-in-one
kubectl apply -f https://raw.githubusercontent.com/jaegertracing/jaeger-kubernetes/main/all-in-one/jaeger-all-in-one-template.yml
```

**Instrument your app (Node.js example):**

```javascript
// app.js
const { initTracer } = require('jaeger-client');

// Initialize Jaeger tracer
const tracer = initTracer({
  serviceName: 'payment-service',
  sampler: {
    type: 'const',
    param: 1, // Sample 100% in dev, 0.1 (10%) in prod
  },
  reporter: {
    agentHost: process.env.JAEGER_AGENT_HOST || 'jaeger-agent',
    agentPort: 6831,
  },
});

// Trace a function
async function processPayment(orderId) {
  const span = tracer.startSpan('process_payment');
  span.setTag('order_id', orderId);

  try {
    // Call Stripe API (this will be timed!)
    const stripeSpan = tracer.startSpan('stripe_api_call', { childOf: span });
    const result = await stripe.charges.create({ amount: 5000 });
    stripeSpan.finish();

    // Update database (this will be timed too!)
    const dbSpan = tracer.startSpan('database_update', { childOf: span });
    await db.orders.update({ id: orderId, paid: true });
    dbSpan.finish();

    span.setTag('success', true);
    return result;
  } catch (err) {
    span.setTag('error', true);
    span.log({ event: 'error', message: err.message });
    throw err;
  } finally {
    span.finish();
  }
}
```

**What Jaeger shows you:**
```
Payment Request (Total: 5.2s)
├─ API Gateway: 50ms
├─ Auth Service: 30ms
├─ Payment Service: 5000ms ← SLOW!
│  ├─ Stripe API: 4800ms ← THE PROBLEM!
│  └─ Database Update: 200ms
├─ Order Service: 40ms
└─ Email Service: 100ms
```

**After countless Kubernetes deployments**, I learned: Tracing is how you debug microservices without losing your mind! 🧠

## The Ultimate K8s Monitoring Setup (What I Actually Use) 🏗️

**My production stack:**

```yaml
# Full observability stack
┌─────────────────────────────────────────┐
│ Metrics: Prometheus + Grafana          │
│ ├─ Cluster metrics                     │
│ ├─ Node metrics                        │
│ ├─ Pod metrics                         │
│ ├─ Application metrics                 │
│ └─ Custom metrics                      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Logs: Fluentd + Elasticsearch + Kibana │
│ ├─ All pod logs centralized            │
│ ├─ 30-day retention                    │
│ ├─ Full-text search                    │
│ └─ Log aggregation                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Traces: Jaeger (distributed tracing)   │
│ ├─ Request flow visualization          │
│ ├─ Performance bottlenecks             │
│ └─ Error tracking                      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Alerts: AlertManager + PagerDuty       │
│ ├─ Critical: Page immediately          │
│ ├─ Warning: Slack notification         │
│ └─ Info: Log only                      │
└─────────────────────────────────────────┘
```

**Cost breakdown:**
- Prometheus + Grafana: FREE (self-hosted)
- ELK Stack: FREE (self-hosted) or $50-200/month (managed)
- Jaeger: FREE (self-hosted)
- AlertManager: FREE
- PagerDuty: $19-41/user/month (worth it for sleep!)

**Total:** Can be 100% free, or ~$100-300/month for managed services!

## Key Metrics You MUST Monitor 🎯

**1. Pod Health:**
```promql
# Pods restarting frequently
rate(kube_pod_container_status_restarts_total[15m]) > 0

# Pods in CrashLoopBackOff
kube_pod_status_phase{phase="Failed"} > 0

# Pods not ready
kube_pod_status_ready{condition="false"} > 0
```

**2. Resource Usage:**
```promql
# CPU usage by pod
sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)

# Memory usage by pod
sum(container_memory_usage_bytes) by (pod)

# Pods close to memory limit
container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
```

**3. Node Health:**
```promql
# Node not ready
kube_node_status_condition{condition="Ready",status="false"} == 1

# Node disk pressure
kube_node_status_condition{condition="DiskPressure",status="true"} == 1

# Node memory pressure
kube_node_status_condition{condition="MemoryPressure",status="true"} == 1
```

**4. Application Metrics:**
```promql
# HTTP request rate
rate(http_requests_total[5m])

# HTTP error rate
rate(http_requests_total{status=~"5.."}[5m])

# Request latency (p95)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

## Grafana Dashboards You Need 📊

**Dashboard #1: Cluster Overview**
- Total nodes (healthy vs unhealthy)
- Total pods (running vs pending vs failed)
- CPU usage (cluster-wide)
- Memory usage (cluster-wide)
- Network I/O
- Disk usage

**Dashboard #2: Node Details**
- CPU usage per node
- Memory usage per node
- Disk I/O per node
- Network traffic per node
- Pod count per node

**Dashboard #3: Application Performance**
- Request rate (requests/sec)
- Error rate (errors/sec)
- Latency (p50, p95, p99)
- Active connections
- Queue depth

**Import pre-built dashboards:**
```bash
# Grafana has 1000+ community dashboards!
# Go to Grafana → Dashboards → Import
# Enter dashboard ID:

# Popular K8s dashboards:
# - 6417: Kubernetes cluster monitoring
# - 8588: Kubernetes Deployment
# - 7249: Kubernetes cluster
# - 3119: Kubernetes pod overview
```

**Docker taught me the hard way:** Don't reinvent the wheel - use community dashboards! 🎨

## Common Monitoring Mistakes (Learn from My Pain!) 🚨

### Mistake #1: Monitoring Everything (Alert Fatigue)

**Bad:**
```yaml
# Alert on EVERY pod restart
- alert: PodRestarted
  expr: rate(kube_pod_container_status_restarts_total[1m]) > 0
  # This fires 1000 times per day! 😱
```

**Good:**
```yaml
# Alert only on frequent restarts (crash loops)
- alert: PodCrashLooping
  expr: rate(kube_pod_container_status_restarts_total[15m]) > 0.1
  for: 5m  # Must be true for 5 minutes
  # Only fires when actually problematic! ✅
```

**Lesson:** Alert on symptoms, not every event! Too many alerts = ignored alerts!

### Mistake #2: No SLOs/SLIs (Service Level Objectives/Indicators)

**Before SLOs:**
```
Me: "Site is slow!"
Boss: "How slow?"
Me: "Uh... slow-ish?"
Boss: "That's not helpful."
```

**After SLOs:**
```
SLO: 99.9% of requests under 200ms

Current: 99.7% under 200ms ❌
Alert: SLO violation! Investigate!

# Now we have concrete numbers! 📊
```

**Define your SLOs:**
```yaml
# SLO: 99.9% availability
- alert: SLOViolationAvailability
  expr: |
    sum(rate(http_requests_total{status!~"5.."}[5m])) /
    sum(rate(http_requests_total[5m])) < 0.999
  labels:
    severity: critical
    slo: availability

# SLO: 95% of requests under 200ms
- alert: SLOViolationLatency
  expr: |
    histogram_quantile(0.95,
      rate(http_request_duration_seconds_bucket[5m])
    ) > 0.2
  labels:
    severity: warning
    slo: latency
```

### Mistake #3: Not Monitoring What Users Experience

**What I monitored:** Pod CPU, memory, restarts ✅

**What I didn't monitor:** Actual user experience! ❌

**The fix - Synthetic monitoring:**

```yaml
# blackbox-exporter checks your app from outside
apiVersion: v1
kind: ConfigMap
metadata:
  name: blackbox-exporter-config
data:
  blackbox.yml: |
    modules:
      http_2xx:
        prober: http
        timeout: 5s
        http:
          valid_status_codes: [200]
          fail_if_not_matches_regexp:
            - "Welcome"  # Check for expected content
          method: GET
      http_post_login:
        prober: http
        http:
          method: POST
          body: '{"username":"test","password":"test"}'
          valid_status_codes: [200, 201]
---
# PrometheusRule to alert on failures
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: blackbox-alerts
spec:
  groups:
  - name: blackbox
    rules:
    - alert: EndpointDown
      expr: probe_success == 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Endpoint {{ $labels.target }} is down"
```

**Now I monitor:**
- Is the website responding? ✅
- Is login working? ✅
- Is checkout working? ✅
- Can users actually USE the app? ✅

**A CI/CD pipeline that saved our team:** Synthetic checks catch issues before user reports! 🎯

## The Monitoring Checklist ✅

Before going to production:

**Metrics:**
- [ ] Prometheus installed and scraping metrics
- [ ] Grafana dashboards for cluster, nodes, and apps
- [ ] Custom application metrics exposed
- [ ] SLOs defined and monitored

**Logs:**
- [ ] Centralized logging (Fluentd/ELK)
- [ ] 30+ day log retention
- [ ] Log search and filtering working
- [ ] Sensitive data redacted from logs

**Tracing:**
- [ ] Jaeger or similar installed
- [ ] Critical services instrumented
- [ ] Sampling configured (don't trace 100% in prod!)

**Alerts:**
- [ ] Critical alerts (page immediately)
- [ ] Warning alerts (Slack notification)
- [ ] Alerts tested (trigger test alerts!)
- [ ] Alert runbooks documented
- [ ] On-call rotation scheduled

**Synthetic Monitoring:**
- [ ] Health check endpoints
- [ ] Critical user flows tested (login, checkout, etc.)
- [ ] External monitoring (from outside K8s cluster)

## The Bottom Line 💡

Kubernetes monitoring isn't optional - it's how you survive production!

**What you get with proper monitoring:**
- ✅ **Find issues before users do** - proactive, not reactive
- ✅ **Debug faster** - 2 minutes instead of 2 hours
- ✅ **Sleep better** - alerts wake you up when needed
- ✅ **Make data-driven decisions** - "we need more memory" (with proof!)
- ✅ **Prove SLAs** - "we hit 99.95% uptime this month"

**The truth about K8s monitoring:**

It's not "Do I need monitoring?" - it's "How fast do I want to fix issues?"

**In my 7 years deploying production applications**, I learned this: You can't manage what you can't measure. Kubernetes gives you incredible power, but with that comes incredible complexity. Monitoring is how you tame that complexity!

You don't need the perfect setup from day one - start with Prometheus + Grafana (it's free!), add logs, then add tracing! 📈

## Your Action Plan 🚀

**Right now:**
1. Install Prometheus + Grafana (helm chart above!)
2. Import community dashboards
3. Set up 3 critical alerts (pod crashes, high CPU, high memory)
4. Test alerts (trigger them manually!)

**This week:**
1. Set up centralized logging (Fluentd + ES)
2. Define your SLOs
3. Create runbooks for each alert
4. Add synthetic monitoring for critical endpoints

**This month:**
1. Instrument apps for tracing
2. Create custom Grafana dashboards
3. Set up on-call rotation
4. Review and tune alert thresholds
5. Never fly blind in production again! 🎯

## Resources Worth Your Time 📚

**Tools:**
- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) - All-in-one monitoring
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/) - 1000+ pre-built dashboards
- [Jaeger](https://www.jaegertracing.io/) - Distributed tracing

**Reading:**
- [Google SRE Book](https://sre.google/books/) - Monitoring best practices
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [The Four Golden Signals](https://sre.google/sre-book/monitoring-distributed-systems/)

**Real talk:** The best monitoring setup is one you'll actually use! Start simple, add complexity as needed!

---

**Still guessing what's wrong with your cluster?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk observability!

**Want to see my monitoring configs?** Check out my [GitHub](https://github.com/kpanuragh) - Real production Prometheus/Grafana setups!

*Now go make your Kubernetes cluster observable!* 📊✨

---

**P.S.** If you've never been woken up by a PagerDuty alert, you haven't lived! (Or your monitoring isn't working...) 😅

**P.P.S.** I once spent a weekend debugging a "random" pod crash. Turns out it was OOMKilled every time traffic spiked. Memory metrics would've shown this immediately. Monitor your resources, folks! 🎯
