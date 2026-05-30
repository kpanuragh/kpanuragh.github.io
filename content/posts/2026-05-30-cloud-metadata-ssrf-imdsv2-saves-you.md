---
title: "☁️ Cloud Metadata SSRF: The $100M Mistake IMDSv2 Prevents"
date: "2026-05-30"
excerpt: "One misconfigured web app, one curl to 169.254.169.254, and an attacker owns your entire AWS account. Here's how the Capital One breach happened and why IMDSv2 closes the door."
tags:
  - cloud-security
  - aws
  - ssrf
  - infrastructure
  - devops
featured: true
---

There's a special IP address that should haunt every cloud engineer's dreams: `169.254.169.254`.

It's not routable on the public internet. It doesn't appear in your DNS records. Your monitoring dashboards have never flagged it. And yet, if an attacker can trick *your application* into making an HTTP request to it from inside an EC2 instance, they can walk away with your AWS access keys, IAM role credentials, and potentially your entire cloud account.

This is cloud metadata SSRF. It's not theoretical. It cost Capital One over $80 million in fines and settlements. And for years, AWS left the door wide open by default.

## What Is the Instance Metadata Service?

AWS runs a small HTTP service on every EC2 instance at `http://169.254.169.254/latest/meta-data/`. Your instance can query it to find out things like its own instance ID, the IAM role attached to it, and — crucially — the **temporary credentials** for that role.

```bash
# From inside any EC2 instance (before IMDSv2)
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role-name

# Response:
{
  "AccessKeyId": "ASIA...",
  "SecretAccessKey": "wJalrXUtnFEMI...",
  "Token": "AQoDYXdzEJr...",
  "Expiration": "2026-05-30T18:00:00Z"
}
```

Legitimate use case: your application code running on EC2 calls this endpoint automatically (via the AWS SDK) to get short-lived credentials without you hardcoding secrets. Great feature. Genuinely useful.

The problem: those credentials are valid AWS credentials. And the service has absolutely zero authentication — any process on the machine (or any request *through* the machine) can access them.

## Enter SSRF: The Forwarding Attack

Server-Side Request Forgery happens when your application fetches a URL that comes from user input without validating where it points. Classic example: an image downloader, a URL preview feature, a PDF generator, or a webhook tester.

```javascript
// Your totally innocent image proxy
app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  // "It's fine, users just pass image URLs"
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  res.send(Buffer.from(buffer));
});
```

An attacker sends: `GET /proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/prod-role`

Your server — running inside EC2 — faithfully fetches that URL, and the attacker receives valid AWS credentials in the response. From there they can enumerate S3 buckets, read secrets from Parameter Store, spin up instances, or exfiltrate your database snapshots.

This is exactly what happened at Capital One in 2019. A misconfigured WAF (running on EC2) was exploited via SSRF to hit the metadata endpoint. The attacker walked away with over 100 million customer records.

## IMDSv2: Token-Based Protection

AWS released IMDSv2 in November 2019, weeks after the Capital One breach became public. The design is clever: before you can query any metadata, you must first perform a PUT request to get a session token, then include that token in subsequent requests.

```bash
# Step 1: Get a session token (TTL in seconds, max 21600 = 6 hours)
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Step 2: Use the token for metadata requests
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Why does this defeat SSRF? Because the vast majority of SSRF attacks use **simple GET requests**. An attacker can trick your server into making a GET to the metadata IP, but they can't easily chain it into a PUT (to get the token) followed by a GET with that token included as a header — especially when each step's response needs to feed into the next request.

The `X-aws-ec2-metadata-token-ttl-seconds` header also can't be set by a standard HTML form or a simple URL-based SSRF, which rules out a huge class of attacks automatically.

## Enforcing IMDSv2 — Don't Just Hope

Here's the thing that kept me up when we audited our infrastructure at Cubet: IMDSv2 was *available*, but nobody had *enforced* it. Instances launched from old AMIs or old Terraform modules were still happily responding to IMDSv1 requests.

You can require IMDSv2 at the instance level:

```bash
# For a running instance
aws ec2 modify-instance-metadata-options \
  --instance-id i-1234567890abcdef0 \
  --http-tokens required \
  --http-endpoint enabled

# For all new instances via Terraform
resource "aws_instance" "app" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.medium"

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"   # This is the critical line
    http_put_response_hop_limit = 1            # Prevents container escapes too
  }
}
```

That `http_put_response_hop_limit = 1` is worth highlighting. The default hop limit is 2, which means a container running inside the EC2 instance can also reach the metadata service. Setting it to 1 means only the host OS can reach it — processes inside Docker containers on that host cannot. For container workloads, this is a meaningful extra layer.

You can also enforce this at the account level via an SCP (Service Control Policy) in AWS Organizations, so no instance anywhere in your org can launch without IMDSv2 required. That's the nuclear option, and it's the right call for production accounts.

## The Broader Lesson: Defense in Depth

IMDSv2 is a mitigation, not a cure. SSRF is still a serious vulnerability even with IMDSv2 enforced — attackers can still hit internal services, scan your VPC, or reach other metadata endpoints. The right defense is layers:

**Validate outbound URLs in your application.** Parse them with your URL library, extract the hostname, and reject any request to RFC 1918 addresses (10.x, 172.16-31.x, 192.168.x) and link-local ranges (169.254.x.x).

**Use IMDSEv2 and enforce it.** Non-negotiable for anything in production.

**Apply least-privilege IAM roles.** If the instance's role can only read one S3 bucket, a metadata credential theft can only read one S3 bucket. The blast radius of a breach is bounded by IAM.

**Enable AWS GuardDuty.** It has specific detections for unusual metadata service queries and credential usage from unexpected IPs.

SSRF vulnerabilities often feel abstract until you see a real exploit. `169.254.169.254` is one of those addresses that once you know it, you'll never look at a URL-fetching feature the same way again. The good news is that IMDSv2 makes the most dangerous variant of this attack significantly harder to pull off — as long as you actually turn it on.

Check your instances. Audit your Terraform. Run `aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,MetadataOptions]'` right now and see what comes back.

---

Find a metadata endpoint still responding to IMDSv1 in your infra? Hit me up on [Twitter/X](https://x.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — I'd love to hear your war stories. And if this saved you from a hairy audit finding, share it with a teammate who still thinks the metadata service is "just an internal thing."
