---
title: "🕸️ Network Policies That Don't Break Your Apps at 2AM"
date: "2026-08-18"
excerpt: "By default, every pod in your cluster can talk to every other pod. That's convenient right up until an audit finds it, and then someone applies a default-deny NetworkPolicy on a Friday and DNS stops working for everyone. Here's how to lock down pod-to-pod traffic without becoming the incident."
tags: ["kubernetes", "networking", "security", "devops", "platform-engineering"]
featured: true
---

Here's a fact about Kubernetes that surprises almost everyone the first time they hear it: by default, there is no network isolation between pods. None. A pod in your `frontend` namespace can open a socket straight to a pod in your `billing` namespace, no questions asked. The cluster network is one big flat room, and every workload in it is standing next to every other workload with the door wide open.

This is fine until it isn't. It's fine in a five-service side project. It stops being fine the moment a security review, a compliance checklist, or an actual incident makes someone ask "wait, why can the marketing website's pod curl the internal admin API?" And the answer is always the same: because nothing ever told it not to.

The fix is `NetworkPolicy`. The failure mode is applying one badly and taking down half your cluster because you forgot Kubernetes doesn't isolate pod traffic *from DNS* by convention — you have to tell it DNS is allowed too.

## Default-allow is the default for a reason (and it's not a good one)

NetworkPolicies are additive-restrictive: a pod with zero policies selecting it can talk to anything. The instant *any* NetworkPolicy selects that pod, the CNI plugin switches that pod to default-deny for the direction (ingress/egress) the policy covers, and only explicitly allowed traffic gets through.

That flip is the part that bites people. You write one policy to lock down your payments service, apply it, and suddenly that pod can't resolve `kube-dns` anymore because you forgot egress to port 53 needs its own explicit rule.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payments-default-deny
  namespace: payments
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

That's the classic "deny everything in this namespace" policy, and it's a great starting point for an audit checklist and a terrible thing to `kubectl apply` without a follow-up. The moment it lands, every pod in `payments` loses DNS, loses its database connection, loses everything — because `podSelector: {}` matches every pod, and an empty `egress: []` (implied by omission here, but often written explicitly by well-meaning engineers) means literally nothing is allowed out.

## The policy that actually works

The pattern that doesn't end in an incident channel is: default-deny plus a small, boring set of explicit allows, applied together, not as two separate changes an hour apart.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payments-allow-dns-and-db
  namespace: payments
spec:
  podSelector:
    matchLabels:
      app: checkout-api
  policyTypes:
    - Egress
  egress:
    # DNS — almost every "policy broke my app" incident traces back to this block missing
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # Only the database, only on its port
    - to:
        - podSelector:
            matchLabels:
              app: payments-db
      ports:
        - protocol: TCP
          port: 5432
```

Notice what's missing: an `ingress` rule for the health check probe from the kubelet, and an egress rule for whatever observability agent scrapes metrics off this pod. Those are the second and third most common "policy technically worked, app technically died anyway" surprises — the kubelet's liveness probe traffic and your sidecar's egress to a metrics collector both need to be accounted for, or you'll watch a perfectly healthy pod get marked unhealthy and cycled by the very platform trying to keep it alive.

## Rolling this out without becoming the incident

On my team at Cubet, we don't apply default-deny to a namespace cold. The sequence that's worked reliably:

1. **Ship the allow rules first, deny second.** Apply the specific allow policies (DNS, database, known upstream services) to a namespace while it's still effectively open. They're inert until something selects the pod into default-deny mode, so there's no risk in landing them early.
2. **Watch in a permissive mode before enforcing.** If your CNI supports it — Cilium's `policy-audit-mode` is the one I reach for most — run policies in audit-only for a day or two and let it log what *would* have been dropped, instead of dropping it. This is where you find the metrics scraper, the webhook callback, the third-party integration nobody documented.
3. **Apply default-deny last**, once the audit log has gone quiet.
4. **Test cross-namespace paths explicitly**, not just "the app didn't crash." A pod can look perfectly healthy while silently failing to reach a dependency it only calls once an hour — cron jobs and batch workers are where broken egress rules hide the longest before anyone notices.

## The part people skip: it's not just YAML, it's a CNI feature

`NetworkPolicy` objects are inert on some CNIs. If your cluster runs the default `kubenet` or a CNI plugin that doesn't implement the NetworkPolicy API, you can apply as many policies as you want and every pod stays wide open — `kubectl apply` will happily succeed and do absolutely nothing. Calico, Cilium, and most managed-cluster CNIs (EKS with the VPC CNI + Calico add-on, GKE's dataplane v2, AKS with Azure CNI's policy engine) enforce it; a handful of setups quietly don't. Check this before you write a single policy, because "we have network policies" and "our CNI enforces network policies" are two different claims, and only one of them is a compliance answer you can stand behind.

Start with one namespace, get the allow list boringly complete before you flip default-deny, and treat DNS egress as non-negotiable in every policy set you write. That's the whole trick — nothing here is exotic, it's just easy to skip a step when the YAML looks done.

Have a network policy horror story, or a CNI that surprised you by silently ignoring your rules? I'd genuinely like to hear it — replies and war stories welcome.
