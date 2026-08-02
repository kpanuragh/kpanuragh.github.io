---
title: "Zero Trust Without Buying a Product 🔒"
date: "2026-08-02"
excerpt: "Every vendor wants to sell you a 'Zero Trust Platform' for six figures a year. Turns out most of the actual principle — never trust, always verify — can be built with things you probably already run: your reverse proxy, your IdP, and a config file."
tags:
  - security
  - incident-response
  - infrastructure
  - devops
featured: true
---

Say "Zero Trust" in a vendor call and watch the slide deck appear. Identity-aware proxies, micro-segmentation appliances, agents on every laptop, a dashboard with a very satisfying "trust score" gauge. Six figures a year, minimum, and a procurement cycle that outlives the security problem it was meant to solve.

Here's the thing nobody in that call tells you: Zero Trust isn't a product category. It's three sentences of policy that you can implement with tools you already have running.

> Never trust based on network location. Verify every request, every time. Grant the least access that gets the job done.

That's it. That's the whole model. Everything else is implementation detail, and a lot of the implementation detail is stuff your reverse proxy, your identity provider, and your existing service mesh can already do — you just haven't wired them together that way.

## The Part Everyone Gets Backwards

Most teams think Zero Trust means "add more auth checks." It doesn't. It means moving the trust boundary from the network to the request. The old model — VPN in, then trust anything on the subnet — fails because once someone's on the subnet, internal traffic is treated as inherently safe. That's the exact assumption that turns one compromised laptop into a full breach.

The fix isn't a new appliance. It's making every internal service check identity and authorization on every call, the same way you'd check a request coming from the public internet. If your internal APIs currently trust `X-Internal-Request: true` or "it came from the VPC," you've already found your first gap.

## Piece One: Identity at the Proxy, Not the App

You don't need an identity-aware proxy product if you already run nginx, Envoy, or Caddy in front of your services. The trick is validating a signed identity token at the edge, before the request ever reaches app code — so no service can be reached by forging a header.

```nginx
location /internal/ {
    auth_request /_verify_jwt;
    auth_request_set $user_id $upstream_http_x_user_id;
    proxy_set_header X-Verified-User $user_id;
    proxy_pass http://internal_service;
}

location = /_verify_jwt {
    internal;
    proxy_pass http://auth_sidecar/verify;
    proxy_pass_request_body off;
}
```

The `auth_sidecar` here is a tiny service — twenty lines in Go or Node — that validates a JWT against your existing IdP's public key and rejects anything expired, unsigned, or scoped wrong. No new vendor, no new agent. You're just refusing to let a request past the proxy without a verified identity attached, regardless of which subnet it came from.

## Piece Two: Short-Lived Everything

The other load-bearing idea in Zero Trust is that credentials should expire fast enough that stealing them isn't worth much. Long-lived API keys and service account credentials are the thing that turns a minor compromise into a six-month persistent foothold, because nobody rotates them until an audit forces the issue.

If you're on any major cloud, you likely already have short-lived credential issuance available and unused:

```yaml
# AWS IAM role assumed by a workload, not a static key
- name: fetch-service-credentials
  run: |
    aws sts assume-role \
      --role-arn arn:aws:iam::123456789:role/reporting-service \
      --role-session-name ci-run \
      --duration-seconds 900
```

Fifteen minutes. If that token leaks in a log line or a stack trace, the blast radius is fifteen minutes wide, not "until someone notices in Q3." At Cubet, this was one of the cheapest wins we shipped in a security pass — swapping static service-account keys for STS-assumed roles with short TTLs didn't touch a single line of application logic, just the deploy pipeline that injected credentials.

## Piece Three: Deny by Default, Then Add Holes Deliberately

Zero Trust falls apart if your network policy is "allow everything, block the stuff we've noticed is bad." It has to be the reverse. Most Kubernetes clusters ship with zero `NetworkPolicy` resources, which means every pod can talk to every other pod by default — the exact flat network Zero Trust exists to eliminate.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

Apply that first, then add narrow `NetworkPolicy` objects per service pair that actually needs to talk. It's tedious. It's also the single highest-leverage YAML file you'll write all quarter, because it converts "any compromised pod can reach anything" into "a compromised pod can reach the two things it's explicitly allowed to reach."

## Where This Actually Gets Tested

None of this matters in a slide deck — it matters at 2am during an incident. When a service gets popped, the question that decides how bad your week gets is: can the attacker move laterally? With identity-verified requests at every hop, short-lived credentials, and default-deny networking, the answer trends toward "not very far, and not for very long." That's the entire point of the model — it's not about stopping the initial breach, it's about making sure the initial breach stays small.

You don't need a $200k platform to get there. You need to actually enforce the three sentences at the top of this post, with the nginx config, the IAM roles, and the NetworkPolicy resources you already have access to. The product isn't the hard part. Actually turning on default-deny and living with the friction is.

---

Building this out yourself and hit a wall on the proxy layer or the network policies? I'd genuinely like to hear about it — find me at [@kpanuragh](https://twitter.com/kpanuragh) or check out more posts at [0x55aa](https://iamanuragh.in). Always happy to compare notes on what broke first when you flipped default-deny to "on."
