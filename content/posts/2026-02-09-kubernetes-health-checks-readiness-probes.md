---
title: "Kubernetes Health Checks: Stop Routing Traffic to Dead Pods Like It's Amateur Hour 🏥"
date: "2026-02-09"
excerpt: "After 7 years of production deployments and countless 3 AM incidents, I learned that health checks aren't optional - they're the difference between 'my app is down' and 'my app auto-heals itself.' Here's how to stop shooting yourself in the foot!"
tags: ["devops", "kubernetes", "deployment", "monitoring"]
featured: true
---

# Kubernetes Health Checks: Stop Routing Traffic to Dead Pods Like It's Amateur Hour 🏥

**Real confession:** My first production Kubernetes deployment went like this: Deploy 3 pods. All show "Running" in kubectl. Traffic hits the service. Users get 502 errors. I frantically check logs. Pods are running but... not ready. Database connection pool initialization takes 30 seconds, but Kubernetes started routing traffic immediately. **Result:** 5 minutes of downtime during "successful" deployment! 😱

**Senior engineer:** "Did you configure health checks?"

**Me:** "The what now?"

**Him:** *sighs in DevOps*

Welcome to the day I learned that Kubernetes "Running" doesn't mean "Ready to serve traffic"!

## What Are Health Checks Anyway? 🤔

Think of health checks like a restaurant host:

**Without health checks (Chaos mode):**
```yaml
# Your Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: myapp:v1.0.0
        ports:
        - containerPort: 3000

# What happens:
# 1. Pod starts
# 2. Container process launches
# 3. K8s: "It's running! Send traffic!" 🚦
# 4. App: "Wait, I'm still loading dependencies..."
# 5. User requests: 💥 500 errors!
# 6. Your pager: BEEP BEEP BEEP! 📟
```

**With health checks (Pro mode):**
```yaml
# Smart Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: myapp:v1.0.0
        ports:
        - containerPort: 3000

        # Liveness: "Is the app alive?"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5

        # Readiness: "Is the app ready for traffic?"
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 3

# What happens:
# 1. Pod starts
# 2. K8s waits 5 seconds
# 3. Checks /ready endpoint
# 4. Returns 200? ✅ Send traffic!
# 5. Returns 503? ❌ Wait and retry
# 6. No more errors! 🎉
```

**Translation:** Don't let Kubernetes send traffic to pods that aren't ready. It's like opening a restaurant before the kitchen is ready - chaos! 🍽️

## The Production Incident That Taught Me This 💀

After deploying countless Laravel and Node.js backends to production, I learned about health checks the expensive way:

**Tuesday Morning, 9 AM Deploy (Should be safe, right?):**

```bash
# Deploy new version with database migration
kubectl apply -f deployment.yaml

# Watch rollout
kubectl rollout status deployment/api
# Waiting for deployment "api" rollout to finish: 1 of 3 updated replicas...
# Waiting for deployment "api" rollout to finish: 2 of 3 updated replicas...
# deployment "api" successfully rolled out ✅

# Check pods
kubectl get pods
# NAME                   READY   STATUS    RESTARTS   AGE
# api-7d4c8f6b9-abc12    1/1     Running   0          30s
# api-7d4c8f6b9-def34    1/1     Running   0          25s
# api-7d4c8f6b9-ghi56    1/1     Running   0          20s

# Everything looks good! ✅
```

**But meanwhile, in production:**
```bash
# User requests
curl https://api.example.com/users
# 502 Bad Gateway 💥

# Check logs
kubectl logs api-7d4c8f6b9-abc12
# "Connecting to database pool..."
# "Loading environment config..."
# "Initializing Redis connection..."
# "Starting HTTP server..." (finally, after 45 seconds!)
```

**What happened:**
- Pods showed "Running" immediately (process started)
- Kubernetes routed traffic immediately
- But app needed 45 seconds to initialize!
- **Result:** 45 seconds of 502 errors during "successful" deploy
- Support tickets: 47 angry users
- My stress level: 📈📈📈

**After adding proper health checks:**
- Pods start
- K8s waits for /ready to return 200
- Only then routes traffic
- **Zero** 502 errors on deploy! 🎉

## Liveness vs. Readiness vs. Startup: The Holy Trinity 🙏

Kubernetes gives you THREE types of probes. Here's when to use each:

### 1. Liveness Probe: "Is My App Alive?" 💓

**Purpose:** Detect deadlocks, infinite loops, crashed processes

**What K8s does:** If fails → **Restart the pod**

**When to use:** Always! This saves you from zombie pods!

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30  # Wait 30s before first check
  periodSeconds: 10        # Check every 10s
  timeoutSeconds: 5        # Fail if takes >5s
  failureThreshold: 3      # Restart after 3 failures
```

**Real example - Node.js:**
```javascript
// health.js - Dead simple liveness check
app.get('/health', (req, res) => {
  // Just check if the process is responsive
  res.status(200).send('OK');
});
```

**Warning:** Don't check external dependencies in liveness! If your database goes down, you don't want K8s restarting ALL your pods! 🚨

### 2. Readiness Probe: "Is My App Ready for Traffic?" 🚦

**Purpose:** Know when pod is fully initialized and ready to serve requests

**What K8s does:** If fails → **Remove from service endpoints** (no traffic sent)

**When to use:** Always! Especially if your app has slow startup!

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 10  # Start checking after 10s
  periodSeconds: 5         # Check every 5s
  timeoutSeconds: 3        # Fail if takes >3s
  failureThreshold: 3      # Mark unready after 3 failures
  successThreshold: 1      # Mark ready after 1 success
```

**Real example - Node.js with dependencies:**
```javascript
// ready.js - Check ALL dependencies
app.get('/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    ready: false
  };

  try {
    // Check database connection
    await db.query('SELECT 1');
    checks.database = true;
  } catch (err) {
    console.error('DB check failed:', err);
  }

  try {
    // Check Redis
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    console.error('Redis check failed:', err);
  }

  // Only ready if ALL checks pass
  const allReady = Object.values(checks).every(check => check === true);
  checks.ready = allReady;

  if (allReady) {
    res.status(200).json(checks);
  } else {
    res.status(503).json(checks);  // Service Unavailable
  }
});
```

**A deployment pattern that saved our team:** If your pod can't connect to the database, readiness probe keeps it OUT of the load balancer. No more 500 errors! 🛡️

### 3. Startup Probe: "Give Me Extra Time to Boot!" 🐢

**Purpose:** For apps with SLOW startup (looking at you, Java!)

**What K8s does:** Disables liveness/readiness until startup succeeds

**When to use:** When your app takes >30s to start (JVM warmup, massive data loading, etc.)

```yaml
startupProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 0   # Start checking immediately
  periodSeconds: 5         # Check every 5s
  failureThreshold: 30     # 30 failures = 150 seconds max startup time
  # After startup succeeds, liveness/readiness take over
```

**After deploying countless Java services**, I learned: Without startup probes, slow-starting apps get killed by liveness checks before they finish booting! 😅

## The Three Probe Types: HTTP, TCP, Exec 🔧

### Probe Type #1: HTTP GET (Most Common)

**Use when:** Your app exposes an HTTP endpoint

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
    httpHeaders:
    - name: X-Custom-Header
      value: HealthCheck
  initialDelaySeconds: 10
  periodSeconds: 5
```

**Pros:**
- ✅ Standard HTTP semantics (200 = healthy, 503 = unhealthy)
- ✅ Can return detailed JSON status
- ✅ Easy to test manually: `curl localhost:3000/ready`

**Cons:**
- ⚠️ Requires HTTP server running
- ⚠️ Slightly more overhead than TCP

### Probe Type #2: TCP Socket (Fast & Simple)

**Use when:** You just need to check if the port is open

```yaml
readinessProbe:
  tcpSocket:
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 3
```

**Pros:**
- ✅ Fast (just checks if port accepts connections)
- ✅ Works for non-HTTP services (databases, message queues)
- ✅ Minimal overhead

**Cons:**
- ⚠️ Only checks if port is listening, not if app is healthy
- ⚠️ No detailed status information

**When I use TCP probes:** For databases, Redis, or services without HTTP!

### Probe Type #3: Exec Command (Maximum Flexibility)

**Use when:** You need custom logic

```yaml
livenessProbe:
  exec:
    command:
    - /bin/sh
    - -c
    - "ps aux | grep -v grep | grep myapp"
  initialDelaySeconds: 10
  periodSeconds: 10
```

**Pros:**
- ✅ Maximum flexibility (run any command)
- ✅ Can check files, processes, custom scripts

**Cons:**
- ⚠️ Slower (spawns shell process every time)
- ⚠️ More complex (harder to debug)

**Real example - Check if app is processing jobs:**
```yaml
livenessProbe:
  exec:
    command:
    - /app/health-check.sh
  initialDelaySeconds: 30
  periodSeconds: 30
```

```bash
#!/bin/bash
# health-check.sh
# Check if the last job processed was within the last 5 minutes
LAST_JOB=$(cat /tmp/last_job_timestamp)
NOW=$(date +%s)
AGE=$((NOW - LAST_JOB))

if [ $AGE -lt 300 ]; then
  exit 0  # Healthy
else
  exit 1  # Unhealthy (no jobs processed in 5 min)
fi
```

## Real-World Production Configuration 🏭

**After 7 years deploying production systems**, here's my battle-tested template:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Never go below 3 healthy pods

  selector:
    matchLabels:
      app: api

  template:
    metadata:
      labels:
        app: api
        version: v2.0.0
    spec:
      containers:
      - name: api
        image: myapp:v2.0.0
        ports:
        - name: http
          containerPort: 3000

        env:
        - name: NODE_ENV
          value: production

        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

        # Startup probe: For slow initialization
        startupProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 0
          periodSeconds: 5
          failureThreshold: 12  # 60 seconds max startup time

        # Liveness probe: Detect crashes/deadlocks
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
          successThreshold: 1

        # Readiness probe: Ready for traffic?
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
          successThreshold: 1

        # Graceful shutdown
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - "sleep 15"  # Let K8s remove from endpoints first
```

**Why this works:**
- ✅ Startup probe gives 60s for slow boot
- ✅ Liveness detects crashed pods and restarts them
- ✅ Readiness prevents traffic to unready pods
- ✅ maxUnavailable: 0 ensures zero downtime during rollout
- ✅ preStop hook allows graceful shutdown

**In production with this setup:** Never had a 502 error during deployment! 🎯

## Advanced Health Check Patterns 🎓

### Pattern #1: Graceful Degradation

**The problem:** Database is down. Should you restart ALL pods?

**Solution:** Different health checks for liveness vs. readiness!

```javascript
// health.js - Liveness: Just check if process is alive
app.get('/health', (req, res) => {
  // Don't check external dependencies!
  // If database is down, we don't want K8s restarting ALL pods!
  res.status(200).json({ status: 'alive' });
});

// ready.js - Readiness: Check dependencies
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    // Unhealthy, but don't kill the pod!
    // Just remove from load balancer
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});
```

**What happens when DB goes down:**
- Liveness: Returns 200 (pod stays alive ✅)
- Readiness: Returns 503 (pod removed from service ❌)
- **Result:** Pods stay alive, just don't get traffic. When DB comes back, they auto-rejoin! 🎉

**A Kubernetes lesson I learned the hard way:** Don't let transient failures kill your pods! 🛡️

### Pattern #2: Detailed Health Status

**The problem:** Health check fails. Why?

**Solution:** Return detailed status JSON!

```javascript
// ready.js - Detailed health check
app.get('/ready', async (req, res) => {
  const status = {
    ready: false,
    timestamp: new Date().toISOString(),
    checks: {
      database: { healthy: false, latency: null },
      redis: { healthy: false, latency: null },
      storage: { healthy: false, latency: null },
      memory: { healthy: false, usage: null }
    }
  };

  // Check database
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    status.checks.database = {
      healthy: true,
      latency: Date.now() - start
    };
  } catch (err) {
    status.checks.database.error = err.message;
  }

  // Check Redis
  try {
    const start = Date.now();
    await redis.ping();
    status.checks.redis = {
      healthy: true,
      latency: Date.now() - start
    };
  } catch (err) {
    status.checks.redis.error = err.message;
  }

  // Check disk space
  const diskUsage = await checkDiskSpace('/');
  status.checks.storage = {
    healthy: diskUsage.percentUsed < 90,
    usage: diskUsage.percentUsed
  };

  // Check memory
  const memUsage = process.memoryUsage();
  const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  status.checks.memory = {
    healthy: memPercent < 85,
    usage: Math.round(memPercent)
  };

  // All checks must pass
  const allHealthy = Object.values(status.checks)
    .every(check => check.healthy === true);

  status.ready = allHealthy;

  res.status(allHealthy ? 200 : 503).json(status);
});
```

**Now when a pod is unhealthy:**
```bash
curl http://pod-ip:3000/ready

{
  "ready": false,
  "timestamp": "2026-02-09T10:30:00Z",
  "checks": {
    "database": { "healthy": true, "latency": 12 },
    "redis": { "healthy": false, "error": "Connection refused" },  // 👈 Found it!
    "storage": { "healthy": true, "usage": 45 },
    "memory": { "healthy": true, "usage": 68 }
  }
}
```

**Debugging win:** Instantly know WHY the pod is unhealthy! 🔍

### Pattern #3: Circuit Breaker Health Checks

**The problem:** External API is flaky. Should you mark pods unhealthy?

**Solution:** Circuit breaker pattern!

```javascript
// circuit-breaker-health.js
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED';  // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

const externalAPICircuit = new CircuitBreaker(5, 60000);

app.get('/ready', async (req, res) => {
  const checks = { ready: true };

  try {
    // Critical dependency - must be healthy
    await db.query('SELECT 1');
    checks.database = true;
  } catch (err) {
    checks.ready = false;
    checks.database = false;
  }

  try {
    // External API - use circuit breaker
    await externalAPICircuit.execute(() =>
      fetch('https://external-api.com/health', { timeout: 2000 })
    );
    checks.externalAPI = true;
  } catch (err) {
    // External API down? That's OK, we can degrade gracefully
    checks.externalAPI = false;
    // Don't mark pod unhealthy!
  }

  res.status(checks.ready ? 200 : 503).json(checks);
});
```

**After deploying services that depend on flaky third-party APIs**, I learned: Don't let external failures kill YOUR pods! Use circuit breakers! ⚡

## Common Health Check Mistakes (I Made All Of These) 🪤

### Mistake #1: Checking External Dependencies in Liveness

**Bad (cascading failures):**
```yaml
livenessProbe:
  httpGet:
    path: /health  # Checks database connection
```

```javascript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');  // ❌ BAD!
    res.status(200).send('OK');
  } catch (err) {
    res.status(503).send('Unhealthy');
  }
});
```

**What happens when DB goes down:**
- All pods fail liveness check
- K8s restarts ALL pods
- Pods restart, DB still down
- Infinite restart loop! 💀
- Your cluster: 🔥🔥🔥

**Good (liveness = process health only):**
```javascript
app.get('/health', (req, res) => {
  // Just check if the process is responsive
  // Don't check database, Redis, or external APIs!
  res.status(200).send('OK');
});
```

**Docker taught me the hard way:** Liveness checks should ONLY verify the process is alive, not dependencies! 🛡️

### Mistake #2: Aggressive Probe Timeouts

**Bad (kills healthy pods):**
```yaml
livenessProbe:
  httpGet:
    path: /health
  periodSeconds: 5
  timeoutSeconds: 1  # ❌ Too aggressive!
  failureThreshold: 1  # ❌ Kill after 1 failure!
```

**What happens:**
- Pod gets busy handling requests
- Health check takes 1.5 seconds (0.5s over timeout)
- K8s: "Pod is dead! Kill it!" 💀
- Healthy pod gets killed!

**Good (give it breathing room):**
```yaml
livenessProbe:
  httpGet:
    path: /health
  periodSeconds: 10
  timeoutSeconds: 5  # ✅ Reasonable timeout
  failureThreshold: 3  # ✅ 3 strikes before restart
```

**Rule of thumb:** failureThreshold × periodSeconds = time before restart. Give it at least 30 seconds!

### Mistake #3: Same Probe for Liveness and Readiness

**Bad (pods keep restarting):**
```yaml
# Both use the same endpoint
livenessProbe:
  httpGet:
    path: /ready  # ❌ Checks dependencies!
readinessProbe:
  httpGet:
    path: /ready
```

**What happens when Redis goes down:**
- /ready returns 503 (Redis unhealthy)
- Readiness: Removes from service ✅ (correct!)
- Liveness: Restarts pod ❌ (wrong!)
- Pod restarts, Redis still down
- Infinite restart cycle! 💀

**Good (separate endpoints):**
```yaml
livenessProbe:
  httpGet:
    path: /health  # Just checks process
readinessProbe:
  httpGet:
    path: /ready   # Checks dependencies
```

**After countless Kubernetes deployments**, I learned: Liveness = "am I alive?", Readiness = "am I ready for traffic?" Different questions, different endpoints! 🎯

### Mistake #4: No Initial Delay

**Bad (kills pods during startup):**
```yaml
livenessProbe:
  httpGet:
    path: /health
  initialDelaySeconds: 0  # ❌ Check immediately!
```

**What happens:**
- Pod starts
- K8s checks /health immediately
- App: "I haven't even started the HTTP server yet!" 💀
- K8s: "Failed! Kill it!"
- Infinite restart loop!

**Good (give it time to boot):**
```yaml
startupProbe:
  httpGet:
    path: /health
  periodSeconds: 5
  failureThreshold: 12  # 60 seconds to start

livenessProbe:
  httpGet:
    path: /health
  initialDelaySeconds: 10  # Extra safety margin
```

**A deployment pattern that saved me:** Always use startupProbe for apps that take >5s to start! 🚀

## Debugging Health Check Failures 🔍

**Check probe events:**
```bash
kubectl describe pod api-7d4c8f6b9-abc12

# Look for:
Events:
  Type     Reason     Age   From               Message
  ----     ------     ----  ----               -------
  Warning  Unhealthy  2m    kubelet            Readiness probe failed: Get "http://10.1.2.3:3000/ready": dial tcp 10.1.2.3:3000: connect: connection refused
  Warning  Unhealthy  1m    kubelet            Liveness probe failed: HTTP probe failed with statuscode: 503
```

**Test the endpoint manually:**
```bash
# Port-forward to the pod
kubectl port-forward api-7d4c8f6b9-abc12 3000:3000

# Test health endpoint
curl -v http://localhost:3000/health

# Test readiness endpoint
curl -v http://localhost:3000/ready
```

**Check application logs:**
```bash
kubectl logs api-7d4c8f6b9-abc12 --tail=100

# Look for errors during health check execution
```

**Common issues I've debugged:**
- ❌ App listening on 0.0.0.0 instead of pod IP
- ❌ Health endpoint times out under load
- ❌ Database connection pool exhausted
- ❌ Health check throws uncaught exception
- ❌ Circular dependency (health check calls itself!)

## The Health Check Cheat Sheet 📋

**Quick reference:**

```yaml
# Startup probe (for slow-starting apps)
startupProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 5
  failureThreshold: 12  # Max 60s startup time

# Liveness probe (detect crashes/deadlocks)
livenessProbe:
  httpGet:
    path: /health  # Simple check, no external deps
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3   # 30s before restart

# Readiness probe (ready for traffic?)
readinessProbe:
  httpGet:
    path: /ready  # Check ALL dependencies
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3   # 15s before removing from service
  successThreshold: 1   # 1 success to mark ready
```

**Golden rules:**
1. **Liveness = process health only** (no external dependencies!)
2. **Readiness = full health check** (including dependencies)
3. **Startup = for slow boots** (disables liveness/readiness)
4. **Give generous timeouts** (3-5 seconds minimum)
5. **Allow 3+ failures** before taking action
6. **Test locally** before deploying!

## The Bottom Line 💡

Health checks aren't just best practices - they're the difference between:
- ✅ Zero-downtime deployments vs. ❌ 502 errors
- ✅ Auto-healing infrastructure vs. ❌ Manual restarts
- ✅ Sleeping at night vs. ❌ 3 AM pager alerts

**The truth about Kubernetes in production:**

"Running" doesn't mean "ready." "Healthy" doesn't mean "able to serve traffic." Health checks are how you tell Kubernetes what "ready" actually means!

**After 7 years deploying production applications to Kubernetes**, I learned this: Proper health checks are the foundation of reliable deployments! They're not optional - they're essential! 🎯

You don't need perfect health checks from day one. Start with basic HTTP checks, add complexity as needed. But PLEASE configure them - your users (and future self) will thank you! 🙏

## Your Action Plan 🚀

**Right now:**
1. Check your deployments: `kubectl get deploy -o yaml | grep -A 10 probe`
2. Count how many have NO health checks (scary!)
3. Add basic /health endpoint to your app
4. Add readinessProbe to one deployment

**This week:**
1. Add livenessProbe to all deployments
2. Create separate /health and /ready endpoints
3. Test health checks locally
4. Deploy and verify with `kubectl describe pod`

**This month:**
1. Add detailed health status JSON
2. Implement graceful degradation
3. Add startupProbe for slow apps
4. Set up monitoring alerts for unhealthy pods
5. Never deploy without health checks again! 🎉

## Resources Worth Your Time 📚

**Official docs:**
- [Kubernetes Liveness, Readiness, Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

**Tools I use:**
- [kube-score](https://github.com/zegl/kube-score) - Static analysis for K8s manifests
- [kubeconform](https://github.com/yannh/kubeconform) - Validate Kubernetes YAML
- [Lens](https://k8slens.dev/) - Kubernetes IDE (great for debugging probes!)

**Reading:**
- [The Twelve-Factor App](https://12factor.net/) - Admin processes
- [Kubernetes Patterns](https://www.oreilly.com/library/view/kubernetes-patterns/9781492050278/) - Health Probe pattern

**Real talk:** The best health check is the one that catches failures before your users do! Start simple, iterate based on production incidents! 🎯

---

**Still deploying without health checks?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk about production-ready Kubernetes!

**Want to see my production manifests?** Check out my [GitHub](https://github.com/kpanuragh) - real health check configs from real projects!

*Now go add those health checks!* 🏥✨

---

**P.S.** If you're thinking "my app starts instantly, I don't need health checks" - wait until you deploy a database migration that takes 2 minutes. Health checks prevent traffic from hitting your pod during that time! 🎯

**P.P.S.** I once deployed without health checks and spent 4 hours debugging why 1 out of 3 pods was returning errors. Turns out it never connected to Redis, but K8s kept sending traffic to it. Readiness probe would've caught this instantly. Learn from my pain! 😅
