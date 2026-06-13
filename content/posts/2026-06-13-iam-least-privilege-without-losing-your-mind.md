---
title: "🔐 IAM Least Privilege Without Losing Your Mind"
date: "2026-06-13"
excerpt: "Every cloud breach investigation ends at the same place: a service account with AdministratorAccess. Here's how to actually implement least privilege without making your team hate you."
tags:
  - cybersecurity
  - cloud security
  - AWS
  - IAM
  - infrastructure
featured: true
---

Let me describe every cloud security incident post-mortem ever written:

> "The attacker gained access to the compromised Lambda function's IAM role, which had `AdministratorAccess` attached because—and I quote the original ticket—'we'll tighten it up later.'"

"Later" has a way of arriving via a security incident notification at 2 AM, not a calm Tuesday morning. IAM least privilege is one of those things every team agrees with in principle and ignores in practice. Let's fix that, without making you want to delete your AWS account.

## The "Just Give It Admin" Trap

Here's the actual lifecycle of IAM permissions in most teams:

1. Engineer needs a Lambda to read from S3.
2. Engineer tries to figure out the exact S3 permissions needed.
3. Engineer spends 20 minutes in the AWS docs, gives up.
4. Engineer attaches `AdministratorAccess` with the mental note: "temporary."
5. That Lambda runs in production for three years with `AdministratorAccess`.

This isn't laziness — it's a tooling problem. AWS has over 13,000 individual IAM actions across hundreds of services. Expecting developers to know exactly which 4 of those 13,000 their function needs is optimistic to the point of comedy.

But "it's hard" doesn't make it optional. A compromised service with `AdministratorAccess` can read every secret in Secrets Manager, spin up cryptominers in every region, and exfiltrate your entire database. A compromised service that can only `s3:GetObject` on one bucket can... get objects from one bucket.

The blast radius difference is the entire point.

## Start Permissive, Then Audit Down

The practical approach isn't to guess permissions upfront — it's to **observe real usage and cut from there**.

AWS IAM Access Analyzer generates policy recommendations based on CloudTrail activity. Run your service with broader permissions for a sprint, then ask Access Analyzer what it actually used:

```bash
# Generate a least-privilege policy from last 90 days of CloudTrail activity
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn": "arn:aws:iam::123456789012:role/my-lambda-role"}' \
  --cloud-trail-details '{
    "trails": [{"cloudTrailArn": "arn:aws:cloudtrail:us-east-1:123456789012:trail/management-events", "allRegions": true}],
    "accessRole": "arn:aws:iam::123456789012:role/AccessAnalyzerRole",
    "startTime": "2026-03-13T00:00:00Z",
    "endTime": "2026-06-13T00:00:00Z"
  }'
```

Wait for it to finish, then pull the generated policy:

```bash
aws accessanalyzer get-generated-policy \
  --job-id <job-id-from-above>
```

Access Analyzer will hand you a policy that reflects what the role *actually* did — not what someone thought it might need. At Cubet, we added this as a step in our quarterly security reviews: pull Access Analyzer reports for all production roles, compare against what's actually attached, and file tickets for anything with a >50% permission gap.

The results are humbling. A service we were sure needed broad EC2 access turned out to only ever call `ec2:DescribeInstances` and `ec2:DescribeSecurityGroups`. Everything else was theoretical.

## Write Policies That Scope to Resources, Not Just Actions

The second failure mode after "too many actions" is "actions scoped to `*`." Getting the action list right but applying it to every resource in your account is still a bad time.

Here's the difference between a policy that'll haunt you and one that won't:

```json
// ❌ The "we'll tighten it up later" version
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject"
  ],
  "Resource": "*"
}

// ✅ The version that won't end your career
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ],
  "Resource": [
    "arn:aws:s3:::my-app-uploads-prod/*"
  ],
  "Condition": {
    "StringEquals": {
      "s3:prefix": ["user-uploads/"]
    }
  }
}
```

Notice three things in the good version: no `DeleteObject` (does this service actually need to delete?), resource scoped to one specific bucket, and a condition that further limits to a key prefix. Each layer narrows the blast radius further.

Conditions are criminally underused in IAM policies. You can restrict by IP, by VPC, by MFA status, by time of day, by the specific tag values on target resources. The AWS docs on condition keys are dense but worth a few hours — that reading time has saved me more than once.

## Permission Boundaries: The Guardrail Your Platform Team Will Love

If you're running a multi-team setup where developers can create IAM roles (for their Lambda functions, ECS tasks, etc.), you need permission boundaries. Without them, a developer can create a role with `AdministratorAccess`, attach it to their Lambda, and your least-privilege work evaporates.

A permission boundary sets the *maximum* permissions any role in a given context can have — even if the role's own policy says `*`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "dynamodb:*",
        "sqs:*",
        "lambda:InvokeFunction",
        "logs:*",
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": [
        "iam:*",
        "organizations:*",
        "account:*"
      ],
      "Resource": "*"
    }
  ]
}
```

Attach this boundary to every developer-created role via your IaC module or CI/CD pipeline, and you've guaranteed that even if someone writes `AdministratorAccess` in their policy, they still can't touch IAM, billing, or your org structure.

## The Practical Checklist

Here's what "least privilege in practice" actually looks like week to week:

**When creating new service roles:**
- Start with no permissions and add what you know you need
- Use Access Analyzer after a week of testing to catch what you missed
- Always scope resources — never `*` when you can name a specific ARN or ARN pattern

**Ongoing:**
- Set a quarterly calendar reminder to run Access Analyzer on all production roles
- Add a policy validator to your CI pipeline (tools like `parliament` or `policy_sentry` can catch obvious issues before they deploy)
- Flag any role with managed policies attached via automated Config rules — `AdministratorAccess` or `PowerUserAccess` on a service role should page someone

**Organizationally:**
- Use Service Control Policies (SCPs) at the AWS Org level to create hard guardrails no role can exceed — things like "no one in this account can turn off CloudTrail" or "no resources can be created outside approved regions"
- Treat permission reviews like dependency updates: boring but non-optional

## It's a Practice, Not a One-Time Event

The uncomfortable truth about IAM least privilege is that it's not something you "implement" and check off. Services evolve, features get added, permission requirements drift. A role that was perfectly scoped in March might be over-privileged by June because someone added a feature that used a different code path.

The teams that do this well have processes, not just policies. Automated reports. Regular review cycles. IaC that bakes permission boundaries in by default so developers can't accidentally bypass them.

It takes a few weeks to set up properly. But it's a lot less time than the incident response, customer notifications, and regulatory filings that follow a breach you could have contained.

Tighten it up now. Future-you will be very grateful.

---

*Working through IAM chaos at your organization? I'm always up for talking cloud security strategy. Find me on [X/Twitter](https://x.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). If this saved you from an "AdministratorAccess in prod" moment, share it with your team — they'll thank you.*
