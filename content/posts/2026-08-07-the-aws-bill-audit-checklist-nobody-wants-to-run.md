---
title: "🕵️ The AWS Bill Audit Checklist Nobody Wants to Run (But Should, Monthly)"
date: "2026-08-07"
excerpt: "A practical, no-nonsense checklist for auditing your AWS bill line by line — orphaned EBS volumes, zombie load balancers, NAT gateway tax, and the other quiet ways cloud spend creeps up on you."
tags: ["aws", "devops", "cloud-cost", "finops", "platform-engineering"]
featured: true
---

Every few months, someone on finance forwards the AWS invoice with the subject line "is this normal?" and suddenly it's your problem. Not because you provisioned all of it — half of it was provisioned by someone who left the company eleven months ago, a Terraform apply that nobody rolled back, or a load test that got a little too enthusiastic in March.

The AWS bill is a crime scene. Every unattached volume, every idle NAT gateway, every load balancer pointed at nothing is a clue. This is the checklist I actually run — not the theoretical "best practices" version, the one that finds real money.

## Why "just check Cost Explorer" isn't enough

Cost Explorer is great at telling you *what* you spent and *when*. It is terrible at telling you *why*, and even worse at telling you what's safe to delete. It'll show you a $400/month EBS line item with total confidence and zero opinion on whether those volumes are attached to anything running.

An audit means going resource by resource, not just dashboard by dashboard. Painful the first time. Fifteen minutes a month once it's a habit.

## The checklist

**1. Unattached EBS volumes.** Instances get terminated, their root volumes don't always go with them if "delete on termination" wasn't set. These sit there billing you at rest, forever, for absolutely nothing.

```bash
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}' \
  --output table
```

Anything in "available" state (not "in-use") is orphaned. At Cubet we found eleven of these on one account during a routine audit — nearly 2TB of gp3 storage attached to nothing, dating back to a decommissioned staging environment nobody had bothered to clean up.

**2. Idle load balancers.** ALBs and NLBs are cheap individually but they add up, and a load balancer with zero healthy targets is pure waste. Cross-reference `describe-load-balancers` against `describe-target-health` — anything with no registered targets, or all targets unhealthy for weeks, is a candidate.

**3. NAT Gateway data processing charges.** This is the one that quietly wrecks budgets. NAT Gateways charge per-GB processed *on top of* the hourly rate, and it's easy to forget that every private-subnet instance pulling container images, hitting external APIs, or shipping logs is routing through it. If your NAT Gateway line item looks disproportionate to your traffic assumptions, check whether something in a private subnet is pulling large artifacts repeatedly — a CI runner re-downloading a 2GB base image on every build is a classic offender. VPC endpoints for S3 and ECR route that traffic off the NAT path entirely and often pay for themselves in a week.

**4. Elastic IPs not attached to a running instance.** AWS bills for EIPs that aren't associated with a running instance — a cheap-looking line item, but it's a strong signal something was torn down incompletely.

**5. Snapshots older than your retention policy.** EBS and RDS snapshots accumulate silently, especially with automated backup jobs that never prune. Check snapshot age against your actual compliance/retention requirement — most teams keep snapshots 3-4x longer than policy requires out of pure inertia.

```bash
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[?StartTime<=`2026-05-01`].[SnapshotId,VolumeSize,StartTime]' \
  --output table
```

**6. Over-provisioned RDS and ElastiCache instances.** Pull CPU and memory utilization from CloudWatch over the last 30 days. An `r6g.2xlarge` running at 8% average CPU is not "headroom for spikes" — it's a downsizing ticket you've been avoiding.

**7. CloudWatch Logs with no retention set.** Log groups default to "never expire" unless you set a retention policy explicitly. Multiply that by every Lambda function and ECS task your team has ever shipped, and you get gigabytes of debug logs from a feature that got reverted two years ago, still costing you storage today.

```bash
aws logs describe-log-groups \
  --query 'logGroups[?!retentionInDays].logGroupName' \
  --output table
```

Set a default retention policy account-wide with an SCP or a scheduled Lambda, and stop relitigating this per team.

**8. Data transfer between AZs.** Cross-AZ traffic isn't free, and chatty microservices that don't care which AZ they land in can rack up transfer charges that dwarf compute. If two services talk constantly and neither needs to be AZ-diverse for resilience, pin them together.

## The real lesson

None of these are exotic. They're boring, unglamorous, and exactly the kind of thing that gets skipped when everyone's busy shipping features. The AWS bill doesn't lie, but it also doesn't explain itself — someone has to go read it like a detective, resource by resource, and ask "does this still need to exist?"

Automate what you can (tag-based lifecycle rules, retention policies, budget alerts), but don't skip the manual pass entirely — the checklist above catches things automation quietly assumes are fine.

**Your move:** pick one item from this list, run it against your account this week, and see what turns up. I'd bet you find at least one thing that's been billing you since a project you don't even remember.
