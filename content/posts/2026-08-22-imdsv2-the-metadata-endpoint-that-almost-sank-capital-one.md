---
title: "🕵️ IMDSv2: The Metadata Endpoint That Almost Sank Capital One"
date: "2026-08-22"
excerpt: "Every cloud instance carries a tiny, unauthenticated web server strapped to its side, handing out credentials to anyone who asks nicely. Here's why that's terrifying, and the one-line fix most teams still haven't shipped."
tags: ["security", "cloud", "aws", "ssrf", "infrastructure"]
featured: true
---

There's a web server running on every single cloud instance you've ever launched, and I'd bet good money you've never logged into it, never patched it, and never once thought about who else can reach it. It lives at `169.254.169.254`, it answers with zero authentication, and if you ask it the right question it will hand you temporary AWS credentials scoped to whatever IAM role your instance is wearing. It's called the instance metadata service, and for a long time it was one of the sloppiest trust boundaries in the entire cloud.

You already know this story, even if you don't know you know it. In 2019, Capital One lost the data of over 100 million customers because an attacker found a misconfigured WAF, used it to make the WAF's own EC2 instance issue a request to `169.254.169.254/latest/meta-data/iam/security-credentials/`, and walked away with that instance's IAM role credentials. No password. No exploit chain beyond "the server will fetch a URL I give it." That's it. That's Server-Side Request Forgery turning into a full-blown breach, and the metadata service was the loaded gun sitting right there on the table.

## Why this was ever allowed to happen

The original metadata service — what AWS now calls IMDSv1 — is just a plain HTTP GET. No headers, no tokens, no proof the request actually originated from code that's supposed to be making it.

```bash
# IMDSv1 — this is the entire "auth" mechanism: none
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role
```

If your app has *any* code path that fetches a user-supplied URL — a webhook tester, an image proxy, a PDF generator that follows redirects, a WAF module inspecting requests — and that code runs on an instance with an IAM role attached, an attacker doesn't need to compromise your AWS account. They just need your server to make one request on their behalf. The server does the authenticating for them, for free, because IMDSv1 can't tell the difference between "my application code asked" and "an attacker's payload asked."

## The fix: make the metadata service ask for ID first

IMDSv2 closes this by requiring a session token, fetched via a `PUT` request, before any metadata `GET` will succeed:

```bash
# IMDSv2 — step 1: get a token (PUT, not GET, and a custom header)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# step 2: use the token to read metadata
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role"
```

That `PUT` with a custom header is the whole point. Classic SSRF payloads are almost always built around GET (or occasionally POST with a fixed body) — an attacker smuggling a URL into your app's `fetch()` call can't also inject an HTTP method and a custom header on top of it. Most SSRF-vulnerable code paths simply can't construct the token request, so IMDSv2 silently defangs an entire category of exploit without your application changing a single line.

The catch is that IMDSv2 has been the *default* for new instances since 2021, but it's not *enforced* unless you explicitly turn off IMDSv1. Plenty of old EC2 instances, ASGs, and Terraform modules from before that date are still humming along with v1 quietly available as a fallback — which means the SSRF-to-credential-theft path is still open on them today, five years after Capital One made front-page news for it.

## Turning it off, for real

Enforcement is one Terraform attribute:

```hcl
resource "aws_instance" "app" {
  # ...
  metadata_options {
    http_tokens                = "required"  # IMDSv2 only, v1 rejected
    http_put_response_hop_limit = 1           # blocks containers hopping metadata to host
    http_endpoint               = "enabled"
  }
}
```

`http_put_response_hop_limit = 1` matters as much as `http_tokens = "required"` and gets skipped constantly. It caps how many network hops a metadata request can survive — set to 1, a request proxied out of a container (through Docker's extra hop) dies before it reaches the metadata service. Without it, a compromised container can still reach the host's IMDS even with v2 enforced, which was exactly the shape of a follow-up class of container-escape SSRF bugs after Capital One made everyone audit their EC2 fleets.

At Cubet Techno Labs we run a scheduled AWS Config rule that flags any instance where `MetadataHttpTokens != required`, because "we'll get to it in the next AMI refresh" is how these things live for three more years. If you're on GCP or Azure, don't feel smug — GCP's metadata server needs the `Metadata-Flavor: Google` header (also easy to smuggle into naive SSRF unless you specifically block it), and Azure IMDS requires `Metadata: true`. Every cloud has the same trust problem wearing a different header name.

## The actual takeaway

SSRF isn't scary because it lets an attacker read `/etc/passwd` on your app server. It's scary because your app server is sitting inside a network with an unauthenticated credential vending machine bolted to its side, and SSRF is the one bug class that lets an outsider walk up and use it. Fix the metadata service and a whole class of "minor" SSRF findings stop being minor.

Check whether `http_tokens = "required"` is set across your fleet this week — it's a five-minute Terraform diff that closes a door Capital One learned about the hard way.

If you've got war stories about metadata services, SSRF, or cloud IAM messes, I'd love to hear them — find me on [GitHub](https://github.com/kpanuragh), [Twitter/X](https://twitter.com/anuragh_kp), or [LinkedIn](https://linkedin.com/in/anuraghkp).
