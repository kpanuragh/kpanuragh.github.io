---
title: "🧟 Zombie Infrastructure: The Cloud Resources That Won't Die (Or Stop Billing You)"
date: 2026-09-04
excerpt: "Unattached EBS volumes, idle load balancers, forgotten snapshots — your cloud bill has a graveyard problem. Here's how to find the zombies and put them down for good."
tags: ["devops", "cloud-cost", "aws", "finops", "automation"]
featured: true
---

Every cloud account eventually turns into a haunted house. Somewhere between the third "quick test" environment and the fourth engineer who left last spring, you accumulate a graveyard of resources that nobody remembers creating, nobody's using, and nobody has the courage to delete. I call this **zombie infrastructure** — stuff that's technically dead (unused, disconnected, orphaned) but keeps shambling onto your invoice every single month.

The scary part isn't that it exists. It's that it's *quiet*. A misconfigured autoscaling group screams at you with alerts. A zombie EBS volume just... sits there, costing $8/month, for two years, until someone finally asks "wait, what's this $4,000 line item?"

## The usual suspects

Every cloud graveyard has the same headstones:

- **Unattached EBS volumes** — the instance died, the disk didn't. AWS keeps billing you for storage nobody's reading from.
- **Idle load balancers** — pointing at zero healthy targets, still charging you an hourly rate plus LCU fees.
- **Orphaned snapshots** — created for a migration eighteen months ago, retained "just in case," multiplying weekly.
- **Elastic IPs sitting unassociated** — a tiny charge per hour that nobody notices until you have forty of them.
- **Old NAT Gateways** in decommissioned VPCs that outlived the VPC's actual traffic.

None of these show up as errors. They show up as small, boring numbers that compound.

## Finding the zombies

You don't need a fancy FinOps platform to start — the AWS CLI and a bit of `jq` gets you most of the way. Here's the query I run first when auditing an account, because unattached volumes are almost always the biggest single offender:

```bash
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType,Created:CreateTime}' \
  --output table
```

`status=available` is the giveaway — an EBS volume in that state isn't attached to anything. It's just spinning in storage, billed by the GB-month, forever, until someone notices.

Load balancers with zero healthy targets are the next check:

```bash
for lb in $(aws elbv2 describe-load-balancers --query 'LoadBalancers[*].LoadBalancerArn' --output text); do
  tg=$(aws elbv2 describe-target-groups --load-balancer-arn "$lb" --query 'TargetGroups[*].TargetGroupArn' --output text)
  for t in $tg; do
    healthy=$(aws elbv2 describe-target-health --target-group-arn "$t" \
      --query "TargetHealthDescriptions[?TargetHealth.State=='healthy']" --output text)
    [ -z "$healthy" ] && echo "Zero healthy targets: $lb"
  done
done
```

It's not elegant, but it works, and it's the kind of script you can hand to a junior engineer and say "run this every Friday" until you get around to automating it properly.

## Making it stick: tag, don't just delete

Here's the mistake I made early on, running one of these sweeps at Cubet Techno Labs: I found forty-some unattached volumes and just deleted them. Turns out three belonged to a team that intentionally detaches volumes between batch jobs to save on compute while keeping the data warm. Cheap lesson, but an avoidable one — "unattached" isn't the same as "unwanted."

The fix isn't a delete script, it's a **quarantine-then-delete** pipeline: tag anything that looks orphaned, notify the owner (or the account if there's no owner tag), and only reap it after a grace period nobody objects to.

```hcl
resource "aws_ec2_tag" "zombie_flag" {
  for_each    = toset(data.aws_ebs_volumes.unattached.ids)
  resource_id = each.value
  key         = "zombie-candidate"
  value       = timestamp()
}
```

Pair that with a scheduled Lambda (or a cron job in your CI runner) that deletes anything tagged `zombie-candidate` for more than 14 days without a human removing the tag. It turns "aggressive cost cutting" into "a boring, reversible process," which is exactly what you want when you're touching production storage.

## The bigger lesson: mandatory tagging up front

The real fix for zombie infrastructure isn't a better graveyard sweep — it's not having a graveyard in the first place. If every resource is created with an `owner` and `expires` tag (enforced via a Service Control Policy or an OPA/Conftest check in your Terraform pipeline), you turn a quarterly archaeology project into a scheduled cleanup that runs itself:

```
deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_ebs_volume"
  not resource.change.after.tags.owner
  msg := "EBS volumes must have an owner tag"
}
```

Enforcement at creation time is worth ten sweep scripts after the fact. Zombies are cheap to prevent and expensive to hunt.

## Go check your graveyard

You almost certainly have zombie infrastructure right now — every account does. Run the EBS query above today; I'd bet real money you find at least one volume that's been quietly billing since before your last on-call rotation. Then go add the owner-tag policy so you don't have to run the sweep again next quarter.

What's the oldest zombie resource you've found in your account? I'm genuinely curious how far back people's graveyards go — mine topped out at a snapshot from a migration that finished three reorgs ago.
