---
title: "🚦 Kubernetes Ingress Controllers Compared: NGINX vs Traefik vs Gateway API"
date: "2026-06-30"
excerpt: "Picking an Ingress controller feels like choosing a router at a networking store — everyone has opinions, the specs look similar, and you'll regret the wrong choice at 2am. Here's what actually matters."
tags:
  - kubernetes
  - devops
  - ingress
  - platform-engineering
  - networking
featured: true
---

Every Kubernetes cluster eventually needs to answer a fundamental question: how does traffic from the outside world find its way to your pods? The answer is an Ingress controller — and the moment you start researching which one to use, you'll discover that the Kubernetes ecosystem has the same energy as asking "what's the best JavaScript framework?" on Twitter.

Let me save you the argument threads.

## What Problem Are We Actually Solving?

A `Service` of type `ClusterIP` is invisible from outside the cluster. A `LoadBalancer` gives you a cloud load balancer per service — which gets expensive fast when you have 30 microservices. An `Ingress` resource lets you define routing rules (host-based, path-based) and have a *single* load balancer entry point dispatch traffic to the right service.

The `Ingress` resource itself is just a spec. The Ingress controller is the thing that actually reads those rules and does the routing — and that's where the choices begin.

## The Main Contenders

### NGINX Ingress Controller

The classic. It's been around since Kubernetes was young and scared, and it powers a huge chunk of production clusters. There are actually *two* of them:

- **kubernetes/ingress-nginx** — community-maintained, runs on the open-source NGINX
- **nginxinc/kubernetes-ingress** — F5/NGINX Inc's official version, also supports NGINX Plus

Most people mean the first one. Here's a typical annotation-heavy Ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1
            pathType: Prefix
            backend:
              service:
                name: api-v1-svc
                port:
                  number: 8080
```

**The good**: battle-tested, enormous community, practically every feature you'll ever want exists as an annotation. **The bad**: those annotations are a proprietary API surface. When you switch controllers, you rewrite all of them. Also, NGINX reloads its config on every Ingress change — in a cluster with frequent deployments, this causes brief connection drops. Not great.

### Traefik

Traefik was built cloud-native from day one. It auto-discovers routes by watching Kubernetes resources and handles certificate issuance via Let's Encrypt without needing cert-manager (though you can use both).

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: api-route
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`api.example.com`) && PathPrefix(`/v1`)
      kind: Rule
      services:
        - name: api-v1-svc
          port: 8080
      middlewares:
        - name: rate-limit
  tls:
    certResolver: letsencrypt
```

**The good**: dynamic config reloading with zero dropped connections, a genuinely beautiful dashboard, and middleware chaining is chef's kiss. **The bad**: its CRDs (`IngressRoute`, `Middleware`) are also proprietary — you're still locked in, just to a different vendor. The v2-to-v3 migration broke plenty of setups.

At Cubet, we moved one project from NGINX Ingress to Traefik specifically for the zero-reload behavior. We had a CI pipeline deploying every 10 minutes and the NGINX reload spikes were showing up in our latency graphs. The migration took a day; the peace of mind was immediate.

### Gateway API (the future)

The Kubernetes community looked at the annotation-per-controller chaos and said "we can fix this." Gateway API (`gateway.networking.k8s.io`) is the official successor to Ingress — a set of standardized CRDs that any conformant implementation can use.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
spec:
  parentRefs:
    - name: prod-gateway
  hostnames:
    - "api.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1
      backendRefs:
        - name: api-v1-svc
          port: 8080
```

The key insight: you write the `HTTPRoute` once and it works with NGINX Gateway Fabric, Envoy Gateway, Traefik (Gateway API mode), Istio, and others. No migration rewrite when you switch implementations.

**The good**: portable, extensible, role-oriented (cluster admins manage `Gateways`, developers manage `HTTPRoutes`). **The bad**: still maturing. Not every feature from NGINX annotations has a Gateway API equivalent yet.

## How to Actually Choose

Here's the decision tree I use:

**Small cluster, 1-5 services, just need basic routing?**  
Pick NGINX Ingress. It works, documentation is everywhere, and you'll find StackOverflow answers for every weird thing it does.

**Frequent deployments and you care about p99 latency during rollouts?**  
Traefik or Envoy Gateway. No reload = no spikes.

**Multi-tenant cluster where teams own their own routing config?**  
Gateway API, full stop. The separation between `Gateway` (infra team) and `HTTPRoute` (app team) is exactly right.

**Already using a service mesh (Istio, Linkerd)?**  
Use the mesh's own Gateway. Running two ingress controllers is a support headache you don't want.

**Greenfield cluster and you're playing the long game?**  
Start with Gateway API now. The migration from Ingress to Gateway API is painful; going Gateway API from day one avoids it entirely.

## The Annotation Trap

Here's the lesson I wish someone had taught me earlier: **Ingress annotations are technical debt with a capital D.**

Every `nginx.ingress.kubernetes.io/...` annotation in your YAML is a line of code that only works with NGINX Ingress. Same for Traefik's `traefik.io/...` annotations. When you have 20 Ingress resources each with 10 annotations, switching controllers becomes a week-long project instead of an afternoon.

If you're starting fresh today, I'd strongly suggest defaulting to Gateway API conformant controllers — Envoy Gateway is excellent and actively developed. The CRDs are standard, the behavior is predictable, and you're not painting yourself into a corner.

## One More Thing: TLS Termination

Wherever you land, let cert-manager handle TLS. Don't manually manage secrets, don't fight with Let's Encrypt rate limits by hand. A `Certificate` resource + a `ClusterIssuer` for Let's Encrypt, and your ingress controller picks up the secret automatically. Every controller supports this pattern.

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: api-tls
spec:
  secretName: api-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - api.example.com
```

Three lines of config, automatic renewal, no more "oh no the cert expired on a Friday" incidents.

## The Bottom Line

NGINX Ingress is the safe default. Traefik is the developer-friendly choice with better reload behavior. Gateway API is the right long-term investment. All three will handle your traffic fine.

The real mistake isn't picking the "wrong" one — it's locking yourself into controller-specific annotations so deeply that switching becomes impossible. Keep your routing logic portable and your options open.

What's your cluster running? Still on NGINX Ingress annotations, or have you made the Gateway API jump? I'm curious how the migration went — drop a comment below.
