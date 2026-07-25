---
title: "🕵️ Cloud Metadata SSRF: The Bug That Steals Credentials Without Touching Your Database"
date: "2026-07-25"
excerpt: "One unvalidated URL parameter, one request to 169.254.169.254, and an attacker has your instance's IAM credentials without ever cracking a password. Here's why the 2019 Capital One breach still matters, and why IMDSv2 is the single best 'flip a switch' security win in AWS."
tags:
  - security
  - cloud-security
  - ssrf
  - aws
  - infrastructure
  - devsecops
featured: true
---

# 🕵️ Cloud Metadata SSRF: The Bug That Steals Credentials Without Touching Your Database

Quick trivia question: what's the most valuable IP address on the internet that isn't actually on the internet?

`169.254.169.254`.

It's not routable. It's not reachable from outside your VPC. It doesn't even leave the box. And it will, if you ask it nicely from inside an EC2 instance, hand you a fresh set of temporary IAM credentials for whatever role that instance is running as. No password, no MFA, no second factor — just a plain HTTP GET. That address is the instance metadata service (IMDS), and it exists for a genuinely good reason: it's how your EC2 instance figures out its own role, security group, and credentials without you having to bake an access key into the AMI like it's 2011.

The problem is that "any HTTP GET from inside the box gets the keys" is also exactly what an attacker gets for free the moment your application has a server-side request forgery bug. And SSRF bugs are everywhere, because "let the server fetch a URL on the user's behalf" is one of the most common features in existence — webhook testers, PDF-from-URL generators, image proxies, "import from a link" buttons, link preview cards. Every one of them is a tiny SSRF machine waiting for someone to point it at `169.254.169.254` instead of `example.com`.

## The Bug That Made This Famous

If you want the canonical horror story, it's the 2019 Capital One breach. A misconfigured WAF in front of a web application was tricked into making a server-side request to the metadata endpoint, which handed back temporary credentials for an over-privileged IAM role. Those credentials were then used to list and read S3 buckets — over 100 million customer records, gone, without a single exploit against the database itself. The WAF wasn't hacked in any conventional sense. It was just politely asked to fetch a URL, and it did.

Here's the shape of the vulnerable code, simplified to the pattern that keeps recurring:

```js
// "just fetch whatever URL the user gives us"
app.post('/api/fetch-preview', async (req, res) => {
  const { url } = req.body;
  const response = await fetch(url);          // no allowlist, no scheme check
  const body = await response.text();
  res.json({ preview: body.slice(0, 500) });
});
```

That code has no idea it's a credential-exfiltration tool. It just looks like a link preview feature. But send it this:

```
POST /api/fetch-preview
{ "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/MyInstanceRole" }
```

and on an instance still running IMDSv1, that's game over. The response is a plain JSON blob with an `AccessKeyId`, `SecretAccessKey`, and `Token` — a live, working set of AWS credentials, scoped to whatever the instance role can do. If that role can read S3, you now can too. If it can assume other roles, so can you.

## Why IMDSv2 Actually Fixes This

AWS's answer, rolled out after Capital One and now the default on new instances, is IMDSv2 — and it's a genuinely elegant fix because it targets the *mechanism* of SSRF, not just the symptom. IMDSv1 is a simple `GET`. IMDSv2 requires you to first do a `PUT` to fetch a session token, and critically, that `PUT` must carry a custom header (`X-aws-ec2-metadata-token-ttl-seconds`).

```bash
# IMDSv2 handshake — this is the part SSRF can't replicate
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/MyInstanceRole"
```

Why does a custom header matter so much? Because almost every real-world SSRF primitive — `fetch(url)`, an image library loading a "thumbnail," a PDF renderer following a redirect, a webhook tester — lets the attacker control the *URL*, but not the *request method or headers*. Standard `GET`-based SSRF can't perform a `PUT`, and it definitely can't inject an arbitrary header before making the request. The vast majority of SSRF-to-credential-theft chains simply die at the handshake. It's the same trick as CSRF-safe custom headers, applied to the metadata endpoint itself.

On the infra side, enforcing this is one setting:

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-0123456789abcdef0 \
  --http-tokens required \
  --http-put-response-hop-limit 1
```

`--http-tokens required` disables IMDSv1 entirely on that instance — no fallback, no legacy `GET` path. The `--hop-limit 1` part is worth calling out too: it caps the TTL on the response to one network hop, which specifically defeats SSRF chains that proxy the request through something like a containerized app where the container itself shouldn't be able to reach the host's metadata service transparently.

## The Part Nobody Puts in the Slide Deck

Here's the thing I've seen bite teams even after they "did IMDSv2": it's an instance-level setting, not an account-level one by default in older accounts. You can flip it on every new launch template and still have a fleet of EC2 instances from three years ago quietly running IMDSv1 because nobody re-launched them. At Cubet, when we ran an audit across our AWS estate, the finding wasn't "we're vulnerable to SSRF" — it was "we're vulnerable to SSRF on the 15% of instances that predate the launch template we think we're using." Same lesson if you're on GCP or Azure: their metadata endpoints (`metadata.google.internal`, `169.254.169.254` again on Azure) have their own required-header protections, and they have the same "new resources default-safe, old resources grandfathered-in" gap.

A quick self-audit that costs nothing:

```bash
aws ec2 describe-instances \
  --query "Reservations[].Instances[].[InstanceId,MetadataOptions.HttpTokens]" \
  --output table
```

Anything that comes back `optional` instead of `required` is a live SSRF-to-credential-theft path waiting for a feature like "paste a URL to import your avatar" to hand it over. And don't stop at IMDSv2 alone — pair it with least-privilege instance roles (so the credentials, even if stolen, aren't the keys to the whole account) and an egress-aware SSRF allowlist on any endpoint that fetches user-supplied URLs. IMDSv2 closes the specific mechanism; scoped IAM roles limit the blast radius when the next mechanism shows up.

## The Takeaway

SSRF is a boring-sounding bug class right up until it's the reason your S3 buckets are on a paste site. The fix here isn't "write more secure code" in the abstract — it's a single API call per instance, and it neutralizes an entire category of exploit chain regardless of how the SSRF got triggered. If you've got EC2 instances you haven't touched since before 2022, that `describe-instances` command above is a five-minute investment that might be the best ROI security fix available to you this quarter.

Found an IMDSv1 straggler in your account, or have a war story about a metadata SSRF you caught (or didn't)? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). And if this saved you a redeployment, share it with the teammate who still thinks "it's just an internal endpoint" is a security control.
