---
title: "🔑 Cloud Workload Identity: Stop Putting AWS Keys in Your .env Files"
date: 2026-06-06
excerpt: "Hardcoded AWS credentials in Docker containers and .env files are a breach waiting to happen. Workload identity gives your services cloud access without a single long-lived key in sight."
tags: ["cloud-security", "aws", "kubernetes", "iam", "devops"]
featured: true
---

# 🔑 Cloud Workload Identity: Stop Putting AWS Keys in Your .env Files

Let me describe a scene that is probably familiar. A developer needs their containerized service to read from an S3 bucket. They pop open the IAM console, create a user named `app-prod-s3-user`, generate an access key, and paste `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` into a `.env` file. Maybe they commit it to git. Maybe the CI/CD pipeline echoes it in a build log. Maybe the Docker image gets pushed to a registry with the key baked in as an environment variable in the Compose file.

Three months later, that key is on GitHub in a public fork someone made, and your AWS bill has a surprise $40,000 Fargate cluster mining cryptocurrency.

This is not a hypothetical. It happens constantly. And it is entirely avoidable.

## The Root Problem: Long-Lived Credentials

AWS access keys are basically passwords that never expire (unless you rotate them, which nobody does religiously). They are:

- Easy to leak — git history, CI logs, container layers, Slack DMs, email attachments
- Hard to rotate — something always breaks when you try
- Impossible to scope to a specific runtime — that key works from your laptop *and* from prod, which means an attacker with the key also works from anywhere
- Permanently valid until someone manually revokes them (which you will discover you forgot to do, in an incident postmortem)

The fix is not better password hygiene. The fix is to **stop using long-lived credentials entirely**.

## Enter: Workload Identity

Workload identity is the principle that your running workload — a pod, a Lambda, an EC2 instance — proves *who it is* via its execution context and receives short-lived, auto-rotating credentials in return. Nothing to store. Nothing to rotate. Nothing to leak.

AWS implements this in a few ways depending on where you are running:

**EC2 Instance Profiles**: Attach an IAM role to the instance. The instance metadata service hands out temporary credentials that expire and auto-rotate every hour. AWS SDKs pick them up automatically — you write zero credential code.

**EKS + IRSA (IAM Roles for Service Accounts)**: Your Kubernetes pod gets a service account. That service account maps to an IAM role via an OIDC trust. The AWS SDK exchanges the mounted OIDC token for temporary STS credentials. Again, no keys anywhere in your deployment manifests.

**Lambda execution roles**, **GCP Workload Identity**, and **Azure Managed Identity** all follow the same pattern — the platform handles the token exchange, your application code just calls the SDK.

## Before and After

Here is the bad old way in a Python service talking to S3:

```python
# DON'T DO THIS
import boto3

s3 = boto3.client(
    "s3",
    aws_access_key_id="AKIAIOSFODNN7EXAMPLE",
    aws_secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region_name="us-east-1",
)

response = s3.get_object(Bucket="my-bucket", Key="config.json")
```

That key is now in source control. Even if you move it to an environment variable, you still need to get the env var *into* the container somehow, which means yet another secret to manage somewhere else.

Here is the workload identity version:

```python
# DO THIS INSTEAD
import boto3

# No credentials anywhere. The SDK resolves them automatically via:
# - IRSA token mounted by EKS
# - Instance profile on EC2
# - Execution role on Lambda
s3 = boto3.client("s3", region_name="us-east-1")

response = s3.get_object(Bucket="my-bucket", Key="config.json")
```

Shorter code. Zero stored credentials. The SDK walks the [default credential provider chain](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html) and finds ambient credentials before complaining about missing ones.

## Wiring Up IRSA on EKS

On the Kubernetes side, you annotate a service account with the IAM role ARN and point your pods at it:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/MyApp-S3Reader
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      serviceAccountName: s3-reader   # pod inherits the role — no env vars needed
      containers:
        - name: app
          image: myapp:latest
          # No AWS_ACCESS_KEY_ID. No AWS_SECRET_ACCESS_KEY. Nothing.
```

EKS injects a projected OIDC token at `/var/run/secrets/eks.amazonaws.com/serviceaccount/token`. The AWS SDK finds it, calls `sts:AssumeRoleWithWebIdentity`, and gets back credentials expiring in one hour. Every hour, transparently, without any action from you or a cron job or a rotation Lambda.

The IAM trust policy on the role locks this down to exactly the EKS cluster and service account that should be allowed to assume it — no other principal can use it, even with the token.

## What This Changes in Practice

At Cubet, we had a service that had been running on a legacy IAM user access key for years. The key had `s3:*` on `*` — resource `*` — because "we'll tighten it later" (a sentence that always ends badly). Migrating it to IRSA forced us to write a real trust policy and scope the permissions to exactly two buckets with exactly the actions needed.

The blast radius of any future leak went from "permanent admin-ish S3 access from anywhere" to "a credential that expires in under an hour and can only read from two specific buckets from inside that specific EKS cluster." That is not a small difference.

Workload identity also quietly enforces least privilege by making you create a role per workload. When every service has its own role, you stop sharing one over-permissioned key across fifteen services and hoping nobody notices.

## The Gotchas Worth Knowing

Workload identity does not help outside the platform. For those situations:

- **Local development**: Use `aws sso login` via AWS IAM Identity Center. No stored long-lived keys; SSO tokens expire.
- **GitHub Actions CI**: GitHub supports OIDC federation with AWS natively. Configure the trust policy to allow your repo, and the pipeline never needs a stored secret — just `id-token: write` permission in the workflow YAML.
- **Third-party SaaS integrations**: Use cross-account roles with `aws:ExternalId` conditions, not access keys. The external ID prevents the confused deputy attack.

None of these are complicated once you understand the pattern. They are all variations on "prove who you are via an identity the platform controls, get short-lived creds in return."

## Stop Carrying the Key Rotation Burden

Long-lived credentials are technical debt that accrues interest in the form of security incidents. Workload identity is not complicated — it is one IAM role, a few lines of trust policy, and one annotation on a Kubernetes service account. In return you get credentials that cannot be stolen in any lasting way because they are already gone by the time the attacker could use them.

If your team is still copy-pasting access keys into Docker Compose files, stuffing them into CI environment variables, or emailing `.env.prod` files around, this is the week to fix it.

Your future self — sitting in the incident bridge at 2 AM — will be extremely grateful.

---

*What does your team use for cloud credential management? Still on access keys, or already on workload identity? I'd love to hear what is actually running in production. Find me on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh).*
