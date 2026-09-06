---
title: "🚫🛒 Zero Trust Without Buying a Product (Yes, Really)"
date: 2026-09-06
excerpt: "Every vendor booth says zero trust requires their platform. It doesn't. Here's how to get the actual security properties — mutual auth, least privilege, no implicit network trust — with tools you probably already have installed."
tags: ["zero-trust", "security", "devsecops", "incident-response", "infrastructure"]
featured: true
---

Say the words "zero trust" in a room full of vendors and watch the sales decks materialize like you just said Beetlejuice three times. Every conference booth has a platform that will "implement zero trust" for you, usually for a six-figure annual contract and a rollout that takes longer than the security incident it was meant to prevent.

Here's the thing nobody at the booth wants to say out loud: zero trust isn't a product category. It's an architecture principle — verify explicitly, assume breach, use least privilege — that predates the marketing term by about a decade. NIST SP 800-207 describes it in terms of policies and enforcement points, not SKUs. You can get most of the way there with mTLS, short-lived credentials, and a healthy suspicion of your own VPN.

## The trust you didn't mean to grant

The core sin of a traditional network is implicit trust by location. If a request comes from inside the VPC, inside the VPN, inside the office Wi-Fi — it's treated as basically legitimate. That assumption is exactly what gets exploited every time an attacker lands on one compromised laptop and then walks laterally to the database because "it's all internal traffic anyway."

Zero trust just means: stop trusting the network, start trusting *identity*, checked on every hop. That's it. No product required to state that principle — just discipline to enforce it.

## Piece 1: mutual TLS between services, not a NAT boundary

If your services trust each other because they're on the same subnet, an attacker who gets a foothold on any one pod owns the whole blast radius. Mutual TLS flips that: every service proves who it is on every call, and every service checks who's calling before doing anything.

You don't need a service mesh vendor for this. `cert-manager` plus a private CA gets you short-lived certs for free:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: orders-svc-mtls
  namespace: prod
spec:
  secretName: orders-svc-tls
  duration: 24h
  renewBefore: 8h
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
  usages: ["client auth", "server auth"]
  dnsNames: ["orders-svc.prod.svc.cluster.local"]
```

A 24-hour cert lifetime means a stolen certificate is worthless by lunch the next day. Combine that with strict client-cert verification in your ingress or sidecar config and you've replicated the meaningful chunk of what a $200k service mesh license is selling — the identity-based trust boundary, without the platform lock-in.

## Piece 2: short-lived, scoped credentials instead of standing access

The other half of zero trust that has nothing to do with buying anything: kill your long-lived API keys and IAM users. At Cubet, we had a legacy job that used a static AWS access key checked into a Jenkins credential store for three years — nobody remembered which script actually needed it, and its policy had accumulated permissions like a junk drawer. Rotating it took longer than we're comfortable admitting.

The fix isn't a product, it's `sts:AssumeRole` with a short session and a policy scoped to exactly one action:

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/nightly-report-writer \
  --role-session-name nightly-job \
  --duration-seconds 900
```

Fifteen minutes, one action (`s3:PutObject` on one prefix), no persistent secret sitting in a vault waiting to be exfiltrated. OIDC federation from your CI provider (GitHub Actions has this built in, no extra spend) means workloads authenticate as themselves — not as a shared static credential everyone half-remembers the blast radius of.

## Piece 3: policy enforcement at every hop, not just the perimeter

Zero trust dies the moment you draw one big trust boundary around "the cluster" and call it done. Enforce policy at each hop with what you already have — Kubernetes `NetworkPolicy` resources deny-by-default, then explicitly allow only the calls that should exist:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: prod
spec:
  podSelector: {}
  policyTypes: ["Ingress", "Egress"]
```

Nothing gets in or out of `prod` by default. Every legitimate path — orders-svc calling payments-svc, payments-svc calling the DB — gets its own explicit allow rule. It's tedious to write out the first time. It's also the difference between an attacker who lands on one pod being stuck there, versus one who quietly reaches your database because the network never said no.

## The incident-response payoff

The reason this matters for incident response specifically: implicit network trust is what turns a contained incident into a headline. When every hop requires its own proven identity, a compromised pod is a compromised pod — not a free pass to everything reachable on the same subnet. Your blast radius shrinks to exactly the permissions that one identity actually holds, which is usually a lot smaller than "everything in the VPC."

None of this requires a purchase order. It requires `cert-manager`, IAM roles instead of users, `NetworkPolicy` manifests you actually write, and the willingness to say "no" by default instead of "yes, because it's internal." The vendor booth will still be there next year selling the same principle with a nicer dashboard — but you don't have to wait for budget approval to start deny-by-default today.

---

Building this out or arguing with me about whether mTLS certificate rotation is actually annoying in practice? Find me on [GitHub](https://github.com/kpanuragh) or [Twitter/X](https://twitter.com/kpanuragh) — I like a good fight about YAML.
