---
title: "🛑 AWS SCPs: The Emergency Brake Your Cloud Org Is Missing"
date: 2026-06-20
excerpt: "IAM policies control what identities can do — but SCPs control what's even possible. Here's why Service Control Policies are the most underused security tool in AWS Organizations, and how to actually use them."
tags: ["aws", "cloud-security", "iam", "organizations", "devops", "infrastructure"]
featured: true
---

Picture this: a developer on your team gets their AWS console credentials phished. The attacker now has their IAM user with `AdministratorAccess`. Game over, right?

Not if you have Service Control Policies in place.

SCPs are the emergency brake that most AWS teams either don't know about or keep meaning to set up "eventually." This post is your nudge to stop procrastinating.

## What SCPs Actually Are (and Aren't)

Service Control Policies are an AWS Organizations feature that define the **maximum permissions** any principal in an account can have. The critical word is *maximum*. SCPs don't grant permissions — they cap them.

Think of it like this: IAM is your car's accelerator, controlling how fast you go. SCPs are the speed limiter bolted on by the fleet manager. The driver can't override it, no matter how hard they press the pedal.

The implications are significant:

- Even `AdministratorAccess` IAM policies are constrained by SCPs
- The **root user** is affected (with a handful of exceptions for account-level operations)
- SCPs apply to every IAM user, role, and even other services acting on your behalf
- A SCP `Deny` always wins over any IAM `Allow`

They live in AWS Organizations and can be attached to the entire organization root, individual Organizational Units (OUs), or specific accounts. Attach one to an OU and every account in that OU inherits it automatically.

## The Setup That Saved Us

At Cubet, we run workloads across multiple AWS accounts — dev, staging, prod, and a shared services account. Before we had SCPs properly configured, each account was essentially an island governed only by whoever owned the IAM policies in it.

The risk: if any account was compromised, the blast radius was "that whole account." With SCPs, we can contain damage to a much smaller surface and prevent whole categories of attack even if credentials leak.

Here's the first SCP we deployed — a deny-list policy that blocks the actions most likely to cause catastrophic damage:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "DenyDisableCloudTrail",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyRootAccountUsage",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    }
  ]
}
```

This single policy does three powerful things: prevents accounts from being yanked out of your organization, makes CloudTrail tamper-resistant, and blocks root user activity entirely. An attacker who gets root credentials on an account still can't disable your audit logs or escape your control plane.

## Region Lockdown: Your Blast Radius Reducer

Another high-value SCP pattern: lock accounts to specific AWS regions. If your app runs in `eu-west-1` and `ap-south-1`, there's no legitimate reason anyone should be spinning up EC2 instances in `us-gov-east-1` or `ap-southeast-3`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*",
        "organizations:*",
        "support:*",
        "sts:*",
        "cloudfront:*",
        "route53:*",
        "waf:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": [
            "eu-west-1",
            "ap-south-1"
          ]
        }
      }
    }
  ]
}
```

Notice the `NotAction` block — global services like IAM, Route 53, and CloudFront aren't region-scoped, so you have to exempt them or you'll break your entire account. Ask me how I know this. (Staging went down for 20 minutes. Lesson learned.)

This policy means even if an attacker has valid credentials, they can't use them to exfiltrate data to some obscure region you'd never think to audit.

## The Policy Evaluation Flow (It's Not What You Think)

Here's where people get confused. AWS policy evaluation with Organizations works like this:

1. Is there an explicit **SCP Deny**? → Denied, full stop.
2. Is there an explicit **SCP Allow** covering this action? → Proceed to next check.
3. Is there an explicit **IAM/Resource policy Allow**? → Permitted.
4. Default: **Denied**.

The gotcha: AWS Organizations starts you with a default SCP called `FullAWSAccess` attached to the root. This allows everything, giving the impression that SCPs aren't doing anything. They're not blocking anything because that allow-all is present.

As soon as you attach a more restrictive SCP, that SCP's logic runs. This is why the deny-list approach (allow all by default, then deny specific things) is usually easier to manage than an allow-list (where you have to enumerate every permitted action, which gets tedious fast).

For production accounts with narrow purposes, allow-listing is worth the effort. For general developer accounts, deny-listing the most dangerous operations is a pragmatic middle ground.

## Common Pitfalls

**"I tested it in dev and it broke everything."** Yes, because you probably have the `FullAWSAccess` default SCP on your dev OU. Deploy SCPs to a test account first, not test them by attaching to prod.

**"Root can bypass SCPs, right?"** Mostly wrong. Root can't bypass SCPs for most actions. The exceptions are account-level operations like closing the account, changing contact info, or subscribing to support plans. For everything else, SCPs apply to root too.

**"SCPs don't appear in IAM policy simulator."** Correct, and this is an annoying gap. The IAM policy simulator doesn't evaluate SCPs. You need to test SCP logic by either reading the docs carefully or using the Organizations access reports (`GetOrganizationAccessReport`) which is considerably less convenient.

**Forgetting service-linked roles.** Some AWS services create their own IAM roles (EKS, RDS, etc.). If your SCP blocks actions those roles need, the service breaks. Always check the service's documentation for required actions before deploying a deny-list.

## Where to Start

If you're starting from zero, this is the order I'd recommend:

1. Enable AWS Organizations if you haven't (free to use).
2. Attach the CloudTrail tamper-prevention deny as your first SCP — low risk, high protection.
3. Attach the `LeaveOrganization` deny — no legitimate use case for member accounts to leave.
4. Block root account usage via the `PrincipalArn` condition.
5. Add region lockdown SCP scoped to each OU based on where those workloads actually run.

Each step takes maybe 15 minutes. The protection they provide against compromised credentials is substantial.

## The Bottom Line

SCPs are the difference between "our credentials leaked but we contained it" and "our credentials leaked and now someone is mining crypto in `af-south-1` on our bill."

Most teams skip them because IAM already feels complicated enough. But SCPs don't replace IAM — they're a separate layer that makes every IAM misconfiguration less catastrophic. You get to be wrong about IAM sometimes without the consequences being existential.

Set them up. Future you (and your incident response team) will be grateful.

---

Questions about SCPs or AWS Organizations architecture? I'm on [Twitter/X @kpanuragh](https://twitter.com/kpanuragh) and [GitHub @kpanuragh](https://github.com/kpanuragh) — always happy to talk cloud security.
