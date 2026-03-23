---
title: "AWS Secrets Manager: Stop Hardcoding Credentials Like It's 2012 ☁️🔐"
date: "2026-03-13"
excerpt: "I once pushed an AWS access key to a public GitHub repo at 2 AM. Within four minutes, a bot had spun up 47 crypto-mining EC2 instances in regions I'd never heard of. This post is my penance. Here's how to use AWS Secrets Manager properly — and never have that particular existential crisis again."
tags: ["\"aws\"", "\"cloud\"", "\"serverless\"", "\"security\"", "\"secrets-management\""]
featured: "true"
---

# AWS Secrets Manager: Stop Hardcoding Credentials Like It's 2012 ☁️🔐

**Hot take:** If your database password is in a `.env` file sitting in your repo, you are one accidental `git push` away from a very bad afternoon.

I know this because I *was* that guy. It was 2 AM, I was rushing a hotfix, I pushed to GitHub with an AWS access key baked into a config file. I noticed immediately. I revoked the key. I thought I was safe.

I was not safe. The bots are faster than your panic. 🤖

Within **four minutes**, AWS was emailing me about unusual EC2 activity in `ap-southeast-2` (Sydney, apparently, which I've never deployed to in my life). Forty-seven instances. GPU-optimized. Mining cryptocurrency on my credit card.

The AWS bill was eventually waived after a support ticket and a humbling explanation. But I spent the next week setting up **AWS Secrets Manager** across every project I owned. Let me save you the trauma.

## What Is AWS Secrets Manager? 🤔

It's AWS's managed service for storing, rotating, and retrieving secrets — database passwords, API keys, OAuth tokens, anything you don't want in plaintext anywhere near your code.

```
WITHOUT Secrets Manager:
DB_PASSWORD=supersecret123 → .env → accidentally committed → GitHub →
→ bot mines crypto → you cry

WITH Secrets Manager:
DB_PASSWORD → encrypted at rest in AWS → fetched at runtime →
→ rotated automatically → audited → you sleep
```

Think of it as a vault. Your code never sees the password during deployment. It fetches it at runtime, and AWS handles encryption, access control, and audit logging.

## Getting Your First Secret In There ☁️

In production, I've deployed this across all our services. Starting is genuinely easy:

```bash
# Store a database password
aws secretsmanager create-secret \
  --name "prod/ecommerce/db-password" \
  --description "RDS password for production" \
  --secret-string "my-actual-password-here"

# Store a structured secret (multiple values)
aws secretsmanager create-secret \
  --name "prod/ecommerce/stripe" \
  --secret-string '{"api_key":"sk_live_...","webhook_secret":"whsec_..."}'
```

That's it. Your secret is now encrypted with AWS KMS, stored redundantly, and accessible only to IAM principals you explicitly allow.

## Fetching Secrets at Runtime ⚡

The part that made me feel smart: your Lambda functions, ECS tasks, and EC2 instances fetch secrets at startup. No environment variable, no `.env` file, no plaintext anywhere.

**Node.js Lambda example:**

```javascript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });

// Call this ONCE at cold start, cache the result
let dbPassword;

export const handler = async (event) => {
  if (!dbPassword) {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: "prod/ecommerce/db-password" })
    );
    dbPassword = response.SecretString;
  }

  // Use dbPassword to connect to DB...
};
```

That caching pattern matters. Don't call Secrets Manager on *every* Lambda invocation — that's slow and costs money. Fetch once per container lifecycle, store in a module-level variable. Lambda reuses containers, so you're good.

**A serverless pattern that saved us:** For structured secrets (JSON with multiple keys), parse once and cache the whole object:

```javascript
const secrets = JSON.parse(response.SecretString);
// secrets.api_key, secrets.webhook_secret — all cached, one API call
```

## The IAM Part (Don't Skip This) 🔑

Secrets Manager is only secure if you attach the right IAM policy. Your Lambda function needs permission to read its specific secrets — and *only* its specific secrets.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789:secret:prod/ecommerce/*"
    }
  ]
}
```

Notice the wildcard is scoped to `prod/ecommerce/*` — not `*`. Your payment service should never be able to read your analytics service's API keys. Least privilege, always.

When architecting on AWS, I learned: spending 10 minutes on IAM scoping prevents entire categories of breach. If an attacker compromises one service, they shouldn't be able to pivot to all your other secrets.

## Automatic Secret Rotation 🔄

This is where Secrets Manager genuinely earns its price tag. It can automatically rotate your RDS passwords on a schedule:

```bash
# Enable automatic rotation every 30 days
aws secretsmanager rotate-secret \
  --secret-id "prod/ecommerce/db-password" \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotate-immediately
```

For RDS databases, AWS provides built-in Lambda rotation functions. You enable rotation, point it at your database, and it handles everything — generating a new password, updating RDS, updating the secret. Zero downtime.

**A rotation pattern that saved us:** On our e-commerce platform, we rotate all database credentials quarterly. Before Secrets Manager, rotating a password meant: update RDS, update all `.env` files across servers, restart services, pray nothing breaks. Now? Click a button, AWS does it, services fetch the new secret on their next cold start.

## Secrets Manager vs SSM Parameter Store 🤺

You'll see both options in the AWS console. Here's when to use which:

```
Use SSM Parameter Store when:
✅ Non-secret config values (feature flags, URLs)
✅ You need hierarchical parameter namespacing
✅ Tight budget (free tier is generous)
✅ Simple string values without rotation needs

Use Secrets Manager when:
✅ Actual secrets (DB passwords, API keys, tokens)
✅ You need automatic rotation
✅ Cross-account secret sharing
✅ Need fine-grained access policies per secret
✅ Compliance requirements (SOC 2, PCI DSS audit trails)
```

**Cost reality:** Secrets Manager costs $0.40/secret/month plus $0.05 per 10,000 API calls. For a production system with 20 secrets, that's $8/month. The alternative is an engineer doing password rotation manually, which I promise costs more per hour than $8.

## Gotchas I Learned the Expensive Way ⚠️

### Gotcha #1: Don't Call It on Every Request

```javascript
// BAD - $0.05 per 10k calls adds up fast under load
export const handler = async (event) => {
  const secret = await getSecret("prod/db-password"); // Called every invocation
  // ...
};

// GOOD - cache at module level
let cachedSecret;
export const handler = async (event) => {
  cachedSecret ??= await getSecret("prod/db-password"); // Called once per container
  // ...
};
```

At 10M Lambda invocations/month, the difference is ~$50/month. Not catastrophic. But also not nothing.

### Gotcha #2: Deletion Has a 7-Day Waiting Period

AWS won't let you immediately delete a secret. There's a mandatory recovery window (minimum 7 days, default 30 days).

```bash
# Delete with minimum recovery window
aws secretsmanager delete-secret \
  --secret-id "prod/ecommerce/old-key" \
  --recovery-window-in-days 7

# Or, if you really mean it (no recovery):
aws secretsmanager delete-secret \
  --secret-id "prod/ecommerce/old-key" \
  --force-delete-without-recovery
```

I've been burned by this when trying to recreate a secret with the same name. Plan your secret names carefully — renaming is "delete and recreate," and deletion takes a week.

### Gotcha #3: VPC Endpoints for Private Lambdas

If your Lambda runs inside a VPC (and it should if it's touching RDS), it can't reach Secrets Manager by default. The public endpoint is outside your VPC.

**Fix:** Create a VPC endpoint for Secrets Manager:

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345678 \
  --service-name com.amazonaws.us-east-1.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-abc123 subnet-def456 \
  --security-group-ids sg-xyz789
```

Now your Lambda reaches Secrets Manager privately, without a NAT Gateway, without traffic leaving AWS's network. Faster, cheaper, more secure.

## Practical Secret Naming Convention 📁

After running this in production for two years, here's the naming convention I swear by:

```
{environment}/{service}/{secret-name}

prod/ecommerce-api/db-credentials
prod/ecommerce-api/stripe-keys
prod/notification-service/twilio-creds
staging/ecommerce-api/db-credentials
```

This lets you use IAM wildcards cleanly (`prod/ecommerce-api/*`), makes secrets browsable in the console, and makes it obvious when you're in the wrong environment.

I once watched a junior dev connect a production Lambda to a staging database because the secret name was just `db-password`. Don't be that team.

## Cost Optimization Tips 💰

1. **Share secrets across services** where appropriate — one Stripe secret for all your payment-related Lambdas is fine. Each secret costs $0.40/month regardless of how many services read it.

2. **Use SSM Parameter Store for non-secrets** — feature flags, API endpoint URLs, non-sensitive config. It's free for the standard tier.

3. **Cache aggressively** — set a 5-minute cache TTL on your secret fetches. Rotation happens on schedules (daily/weekly/monthly), not second-by-second.

4. **Batch structured secrets** — instead of 5 separate secrets for Stripe keys, put them all in one JSON secret. You pay per secret, not per key.

## TL;DR — Your Secrets Manager Quick-Start ✅

1. **Create secrets** with meaningful hierarchical names (`{env}/{service}/{name}`)
2. **Grant least-privilege IAM** — each service gets access only to its own secrets
3. **Cache fetched secrets** in your Lambda's module scope — not per-invocation
4. **Enable automatic rotation** for database credentials
5. **Create VPC endpoints** if your Lambdas live in a VPC
6. **Enable CloudTrail logging** — every secret access is auditable
7. **Never, ever, ever** put `SecretString` in a CloudFormation `!Sub` or log it anywhere

## The Bottom Line 💡

AWS Secrets Manager costs $8/month for a typical production system. The alternative is explaining to your CTO at 3 AM why there are 47 GPU instances running in Sydney.

**In production, I've deployed** Secrets Manager across our entire e-commerce platform — RDS credentials, Stripe keys, third-party API tokens, everything. We have automatic rotation on all database passwords. We have full audit trails for compliance. And I have never had another "bot mining crypto on my card" incident.

The confidence of knowing your secrets are genuinely secret is worth every penny of that $8/month.

---

**Working on AWS security?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — especially if you have a crypto-mining incident story to share. We can compare notes.

**Want the Terraform module I use for Secrets Manager?** Check my [GitHub](https://github.com/kpanuragh) — there's a reusable module with IAM policies already scoped correctly.

*Now go rotate your credentials. Yes, right now. I'll wait.* 🔐🚀

---

**P.S.** If you're reading this with a `.env` file in your git history, `git filter-repo` is your friend. Rewrite history, revoke those keys, and never speak of this to anyone.

**P.P.S.** The four-minute window between "leaked key" and "47 crypto-mining instances" is real. I timed it. The internet is not a safe place.
