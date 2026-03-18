---
title: "Service Discovery: Stop Hardcoding Hostnames in Your Microservices 🕵️‍♂️🗺️"
date: "2026-03-18"
excerpt: "I once hardcoded 23 IP addresses across 11 microservices in a staging config file. Then we scaled up. Then AWS recycled the IPs. Then everything exploded. This is the story of service discovery - and why it's the unsexy piece of distributed systems that keeps everything from catching fire."
tags: ["architecture", "scalability", "system-design", "microservices", "service-discovery"]
featured: true
---

# Service Discovery: Stop Hardcoding Hostnames in Your Microservices 🕵️‍♂️🗺️

Picture this: It's 2 AM. Your on-call phone is screaming. The checkout service is down. You trace it back to the payment service. The payment service is trying to reach the inventory service at `10.0.1.47:3005`. But `10.0.1.47` doesn't exist anymore. AWS recycled it when you scaled down last night.

Somewhere in a config file that hasn't been touched in 8 months, someone (okay, it was me) wrote:

```yaml
INVENTORY_SERVICE_URL: "http://10.0.1.47:3005"
```

Welcome to the hardcoded IP nightmare. Let me tell you about service discovery before you end up in my 2 AM situation.

## What Even Is Service Discovery? 🤔

In a distributed system, services need to find each other. In a single server, this is easy - everything's on `localhost`. In microservices across a dynamic cloud infrastructure, instances come and go. IPs change. Pods restart. Auto-scaling spins up three new instances, then kills two of them.

**Service discovery is the phonebook of your microservices world.**

```
Without Service Discovery:
Payment Service ──X──► http://10.0.1.47:3005/inventory (DEAD IP)
                                                            💀

With Service Discovery:
Payment Service ──►  Service Registry: "Where is inventory-service?"
                     Registry: "Currently at 10.0.2.103:3005 and 10.0.2.104:3005"
Payment Service ──►  http://10.0.2.103:3005/inventory ✅
```

Simple concept. But the implementation choices have major trade-offs that will follow you for years.

## The Two Flavors You Need to Know ⚖️

### Client-Side Discovery

The service asking for something is responsible for looking it up AND choosing which instance to call.

```
┌──────────────┐     1. "Where is inventory-service?"    ┌──────────────┐
│   Payment    │ ──────────────────────────────────────► │   Service    │
│   Service    │ ◄────────────────────────────────────── │   Registry   │
└──────────────┘     2. "Here are 3 healthy instances"   └──────────────┘
       │
       │  3. Choose one (round-robin, least-connections, etc.)
       ▼
┌──────────────┐
│  Inventory   │  ← directly called by Payment Service
│  Instance 2  │
└──────────────┘
```

**Real example: Netflix Eureka + Ribbon.** Every service registers itself and queries the registry. The client picks which instance to call.

**When designing our e-commerce backend**, we briefly tried this approach with Consul. The problem? Every single service needed to implement the load-balancing logic. Node.js service, Python service, our legacy PHP service - all had to talk to Consul directly. When we changed our load-balancing strategy from round-robin to least-connections, we updated... every. single. service.

### Server-Side Discovery

The service asking doesn't need to know anything. It just calls a stable endpoint (load balancer), and *that* figures out where to route the request.

```
┌──────────────┐                              ┌──────────────┐
│   Payment    │ ──► inventory-service ──────► │    Load      │
│   Service    │     (stable DNS name)         │  Balancer    │
└──────────────┘                              └──────┬───────┘
                                                     │
                              ┌──────────────────────┤
                              │          query       │
                              ▼        registry      ▼
                     ┌──────────────┐      ┌──────────────┐
                     │  Inventory   │      │  Inventory   │
                     │  Instance 1  │      │  Instance 2  │
                     └──────────────┘      └──────────────┘
```

**Real example: AWS ALB, Kubernetes Services, AWS ECS Service Connect.** The calling service doesn't care about discovery. It just calls `http://inventory-service/api/stock`. The infrastructure handles the rest.

**As a Technical Lead, I've learned:** This is almost always the right default. Your application code stays clean. The infrastructure absorbs the complexity.

## How Kubernetes Does It (And Why It Works) 🐳

If you're running on Kubernetes, you basically get service discovery for free, and it's elegant.

```yaml
# inventory-service Kubernetes Service definition
apiVersion: v1
kind: Service
metadata:
  name: inventory-service
  namespace: production
spec:
  selector:
    app: inventory  # Routes to any pod with this label
  ports:
    - port: 80
      targetPort: 3005

---
# The pods that back it (can be 1, can be 20)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory
spec:
  replicas: 3
  selector:
    matchLabels:
      app: inventory
  template:
    spec:
      containers:
        - name: inventory
          image: my-org/inventory:v2.1.0
          ports:
            - containerPort: 3005
```

Now ANY pod in the `production` namespace can just call:

```javascript
// No IP. No port discovery. No config file. Just DNS.
const response = await fetch('http://inventory-service/api/stock/SKU-123');
```

Kubernetes runs CoreDNS internally. When you hit `inventory-service`, it resolves to the ClusterIP of that Service. Kubernetes kube-proxy routes it to a healthy pod. One of the pods gets restarted? Kubernetes removes it from the endpoint list automatically. Scale to 10 pods? All 10 receive traffic.

```
What Kubernetes DNS gives you:

Within same namespace:
http://inventory-service

Cross-namespace:
http://inventory-service.production.svc.cluster.local

Full DNS resolution happens at request time - always fresh! 🎉
```

**A scalability lesson that cost us:** We had a health check bug that returned 200 OK even when the service was broken. Kubernetes thought the pod was healthy and kept routing traffic to it. Service discovery is only as good as your health checks. Always test that a *broken* service actually fails its health check.

## AWS ECS: Service Connect vs Service Discovery 🔌

If you're on AWS ECS (which is where our e-commerce backend lives), you've got two options:

**ECS Service Connect** (the newer, better option):

```json
{
  "serviceConnectConfiguration": {
    "enabled": true,
    "namespace": "production",
    "services": [
      {
        "portName": "inventory-port",
        "discoveryName": "inventory-service",
        "clientAliases": [
          {
            "port": 3005,
            "dnsName": "inventory-service"
          }
        ]
      }
    ]
  }
}
```

Now your services talk to each other using stable DNS names within the namespace. ECS handles the routing, the health checking, the load balancing. And critically - it gives you *free* connection-level metrics in CloudWatch.

**ECS Service Discovery with Route 53** (the older approach):

```
inventory-service.production → Route 53 Auto Naming →
  A records for each task IP → Client does DNS lookup →
  Client picks an IP → Direct connection to task
```

The older approach works but means your clients are talking directly to task IPs. When a task stops, there's a small window where DNS still returns the dead IP (TTL). Service Connect avoids this entirely.

**When designing our e-commerce backend**, switching from Route 53 Service Discovery to ECS Service Connect reduced our inter-service latency by ~8ms on average. Not huge, but across hundreds of checkout requests per minute, it mattered.

## The Health Check Problem 🏥

Service discovery without health checks is a lie. You'll "discover" dead services all day.

```
Bad health check (surface-level, not useful):
GET /health → { "status": "ok" }
# Returns OK even when DB is unreachable, Redis is down, etc.

Good health check (tests actual dependencies):
GET /health → checks DB connection, Redis ping, external API reachability
→ Returns 503 if any critical dependency is broken
```

```javascript
// Node.js - a health check that actually means something
app.get('/health', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    await db.query('SELECT 1');
    checks.database = true;
  } catch (e) {
    console.error('DB health check failed:', e.message);
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (e) {
    console.error('Redis health check failed:', e.message);
  }

  const healthy = Object.values(checks).every(Boolean);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

When the service registry calls this and gets 503, it pulls the instance out of rotation. When it recovers and returns 200, it puts it back. This is the loop that keeps service discovery honest.

## Service Discovery Trade-offs (The Honest Table) 📊

```
┌────────────────────┬──────────────────────┬──────────────────────┐
│  Approach          │  Pros                │  Cons                │
├────────────────────┼──────────────────────┼──────────────────────┤
│ DNS (K8s/ECS)      │ ✅ Zero app changes  │ ❌ DNS TTL caching   │
│                    │ ✅ Language-agnostic │   can cause stale    │
│                    │ ✅ Infra handles it  │   lookups briefly    │
├────────────────────┼──────────────────────┼──────────────────────┤
│ Client-side        │ ✅ Full control over │ ❌ Each service must │
│ (Consul/Eureka)    │   load balancing     │   implement registry │
│                    │ ✅ Rich routing rules│   client + LB logic  │
├────────────────────┼──────────────────────┼──────────────────────┤
│ Service Mesh       │ ✅ mTLS, observability│ ❌ Complex to operate│
│ (Istio/Linkerd)    │ ✅ Circuit breaking  │ ❌ Sidecar overhead  │
│                    │   built in           │   (memory + CPU)     │
├────────────────────┼──────────────────────┼──────────────────────┤
│ Hardcoded IPs      │ ✅ "Easy" to         │ ❌ Everything I      │
│ (please don't)     │   understand at 2 AM │   described at 2 AM  │
└────────────────────┴──────────────────────┴──────────────────────┘
```

## Common Mistakes I've Made So You Don't Have To 🪤

### Mistake #1: Short DNS TTLs + Aggressive Caching

```javascript
// Your HTTP client is caching DNS lookups
// This config tells it not to
const agent = new http.Agent({
  keepAlive: true,
  // But also: don't cache DNS forever
  // In Node.js 18+, you can set lookup timeout
});

// OR: use a library that respects TTL like node-dns-cache
// with a short maxTTL aligned to your service mesh's TTL
```

When we first moved to ECS Service Connect, we had Node.js HTTP clients caching DNS for 5 minutes by default. Service failures would redirect traffic to the dead instance for up to 5 minutes because the client hadn't re-resolved the DNS name.

### Mistake #2: Forgetting Deregistration on Shutdown

```javascript
// Node.js - graceful shutdown includes deregistering from service registry
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Deregistering from service registry...');

  // Stop accepting new connections
  server.close(async () => {
    // If using Consul directly, deregister here
    // await consul.agent.service.deregister('inventory-service-1');

    // On ECS/K8s, just exit - the platform handles deregistration
    // BUT: finish in-flight requests first
    await db.end();
    await redis.quit();
    console.log('Shutdown complete.');
    process.exit(0);
  });
});
```

Without graceful deregistration, there's a window where the service is gone but still in the registry. Requests get routed to a dead endpoint. Health checks will eventually catch it, but "eventually" can be 10-30 seconds of errors.

### Mistake #3: Using Public DNS for Internal Services

```yaml
# Wrong: Calling internal services via public DNS
INVENTORY_URL: "https://api.mycompany.com/inventory"
# Goes through the internet, comes back, costs money, slower

# Right: Use internal DNS
INVENTORY_URL: "http://inventory-service.production.svc.cluster.local"
# Or with ECS Service Connect:
INVENTORY_URL: "http://inventory-service:3005"
```

We were routing inter-service calls through our public API Gateway for 3 months before someone noticed the extra 40ms latency and the AWS data transfer charges.

## The Setup I Actually Recommend 🎯

For most teams running microservices on AWS:

```
┌─────────────────────────────────────────────────────────┐
│                     External Traffic                     │
│                           │                              │
│                     ┌─────▼─────┐                        │
│                     │   ALB     │  (public load balancer) │
│                     └─────┬─────┘                        │
│                           │                              │
│           ┌───────────────┼───────────────┐              │
│           ▼               ▼               ▼              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │   Payment    │ │    Orders    │ │    User      │     │
│  │   Service    │ │   Service    │ │   Service    │     │
│  └──────┬───────┘ └──────┬───────┘ └──────────────┘     │
│         │ ECS Service    │ Connect                       │
│         └────────────────┤                               │
│                          ▼                               │
│                 ┌──────────────┐                         │
│                 │  Inventory   │  (internal only)        │
│                 │   Service    │                         │
│                 └──────────────┘                         │
└─────────────────────────────────────────────────────────┘

Services talk to each other via ECS Service Connect DNS.
No service knows another's IP. Ever.
```

Start here. Add a service mesh (Istio/Linkerd) when you actually need mTLS, circuit breaking at the network level, or traffic splitting for canary deployments. Not before.

## TL;DR ⚡

- **Never hardcode IPs or hostnames** in application code or config files
- **DNS-based service discovery** (Kubernetes Services, ECS Service Connect) is the right default for most teams
- **Health checks must test real dependencies**, not just return 200
- **Graceful shutdown** should include deregistering from the service registry
- **Client-side discovery** (Consul, Eureka) gives you more control but makes every service responsible for load balancing logic - usually not worth it
- **Service mesh** (Istio/Linkerd) is powerful but complex - earn it, don't start with it

The goal is simple: any service should be able to scale from 1 instance to 100 instances and back without anyone touching a config file. Service discovery is what makes that possible.

---

**Ran into a service discovery gotcha in production?** I'd love to hear it - find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

*Now go check your config files for hardcoded IPs. I'll wait.* 🕵️‍♂️

---

**P.S.** Yes, I actually counted. 23 hardcoded IPs across 11 services. I found them all. After the outage. You don't have to learn that way.
