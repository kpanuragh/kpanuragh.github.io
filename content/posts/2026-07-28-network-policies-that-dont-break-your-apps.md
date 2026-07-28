---
title: "Network Policies That Don't Break Your Apps: A Survivor's Guide 🚧🔌"
date: "2026-07-28"
excerpt: "Turning on a default-deny NetworkPolicy is the easiest way to feel like a security hero for exactly four minutes, right before DNS stops resolving and your on-call phone starts screaming. Here's how to roll out network policies without setting your own pager on fire."
tags: ["kubernetes", "devops", "networking", "security", "platform-engineering"]
featured: true
---

# Network Policies That Don't Break Your Apps: A Survivor's Guide 🚧🔌

So you've decided your cluster needs NetworkPolicy. Good instinct — by default, every pod in Kubernetes can talk to every other pod, which is basically running an office where every door, including the server room and the CEO's safe, is propped open with a rubber doorstop.

You write your first default-deny policy, apply it with the calm confidence of someone who has clearly never done this before, and within ninety seconds three services are throwing connection timeouts, DNS lookups are failing cluster-wide, and your liveness probes are killing pods that were perfectly healthy. Welcome to the actual hard part of network policies: not writing them, but writing them **without nuking the things your app quietly depended on**.

Let's talk about the failure modes nobody puts in the tutorial, and how to avoid them.

## Failure mode #1: You forgot about DNS

This is the classic. You write a tidy default-deny-all policy for a namespace, feel very secure, and immediately every pod in that namespace can't resolve `anything.svc.cluster.local` — including the services you *did* allow traffic to, because your app talks to them by name, and names need DNS, and DNS lives in `kube-system`.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: checkout
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

Every default-deny egress policy needs this sibling rule, or its equivalent for whatever CoreDNS setup you're running. I've seen teams deploy default-deny to a namespace, watch it work fine in a quick smoke test, then get paged four hours later when a long-lived pod's DNS cache expired and every subsequent lookup silently died. Test with a pod that's been running a while, not just a freshly scheduled one.

## Failure mode #2: The kubelet can't reach your pod anymore

Ingress policies get scoped too tightly all the time, and the collateral damage is your own health checks. Liveness and readiness probes originate from the kubelet on the node, not from another pod inside your nice namespaceSelector rules — so a policy that only allows ingress "from pods with label `app: frontend`" quietly blocks the kubelet's probe traffic too, unless your CNI happens to exempt node-local traffic (some do, many don't — check yours, don't assume).

The fix depends on your CNI, but the general shape is: allow ingress from the node's CIDR range explicitly, or from `0.0.0.0/0` scoped to just the probe port if your CNI doesn't special-case kubelet traffic.

```yaml
  ingress:
    - from:
        - ipBlock:
            cidr: 10.0.0.0/8   # your node CIDR, not a guess — check kubectl get nodes -o wide
      ports:
        - port: 8080
```

Get this wrong and you get a beautiful, self-inflicted crash loop: policy blocks the probe, probe fails, kubelet restarts the pod, new pod comes up, probe fails again, repeat forever. It looks like an app bug. It is not an app bug. It's a network policy dressed up as one.

## Failure mode #3: Cross-namespace traffic you didn't know existed

The scariest network policies are the ones that work great in staging and take down production, because production has three namespaces quietly calling each other that nobody documented. At Cubet we ran into this rolling out namespace isolation for a multi-tenant platform — a background reconciliation job in one namespace was calling a shared caching service in another, discovered only when the reconciliation job started silently failing and nobody noticed for two days because it degraded gracefully instead of crashing loudly. Silent degradation is worse than a crash; at least a crash pages someone.

Before writing any policy, get actual traffic data instead of guessing from the architecture diagram (which is always a little bit fiction). If you're on Cilium, `hubble observe` gives you real flow logs. If you're stuck on plain Calico or another CNI without flow visibility, run your default-deny policy in a namespace where you can watch application error rates and connection logs closely for at least one full business cycle before trusting it — cron jobs, nightly batch processes, and end-of-month reports have a way of surfacing traffic patterns that don't show up in an afternoon of testing.

## Failure mode #4: Policies that "work" because nothing was ever denied

Here's a trap: you write a NetworkPolicy, apply it, everything still works, you close the ticket. Except your CNI doesn't actually enforce NetworkPolicy at all — kube-proxy in some minimal setups, or a CNI plugin installed without the policy controller enabled, will silently accept and ignore NetworkPolicy objects. The API server lets you create them; nothing stops you. You've built a facade of security with zero enforcement behind it.

```bash
# Sanity check: does anything actually enforce policy here?
kubectl get pods -n kube-system -l k8s-app=calico-node
# or for Cilium
kubectl exec -n kube-system ds/cilium -- cilium status | grep Policy
```

Confirm enforcement is real before you trust a single rule. A NetworkPolicy that isn't enforced is worse than no policy at all, because it gives everyone false confidence that the pods are locked down.

## The rollout order that actually works

1. Get real traffic visibility first (Hubble, CNI flow logs, or old-fashioned tcpdump if you have to).
2. Write policies in **audit/log mode** if your CNI supports it (Cilium does), and watch for a full week before switching to enforce.
3. Always ship the DNS-allow rule in the same PR as any default-deny egress policy — never as a follow-up.
4. Explicitly allow kubelet probe traffic before you scope ingress tightly.
5. Roll out namespace by namespace, least-critical first, and hold each one at least a few days before moving to the next.

Network policies are absolutely worth doing — the security win is real and the blast-radius reduction is real. Just remember that "default deny" doesn't mean "default correct," and the gap between those two is exactly where your on-call week goes to die.

Got a network policy horror story of your own — DNS outage, phantom crash loop, or a "policy" that turned out to be pure decoration? I'd love to hear it.
