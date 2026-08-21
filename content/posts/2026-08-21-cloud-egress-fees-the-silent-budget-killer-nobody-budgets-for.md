---
title: "🚰 Cloud Egress Fees: The Silent Budget Killer Nobody Budgets For"
date: "2026-08-21"
excerpt: "Your compute bill is flat, your storage bill is flat, and yet the total keeps climbing. Meet data egress — the cost line that hides in plain sight until it doesn't."
tags: ["devops", "cloud", "cost-engineering", "aws", "networking"]
featured: true
---

Every cloud cost horror story starts the same way: someone opens the billing dashboard expecting a normal month and instead finds a chart that looks like a hockey stick got into a car crash. Compute? Flat. Storage? Flat. The line item that ate the budget? `DataTransfer-Out-Bytes`. Nobody RSVP'd to that meeting, and yet it showed up and ordered the most expensive thing on the menu.

Egress fees are the tax nobody remembers signing up for. You pay to bring data in for free, you pay a little to store it, and then you pay real money every single time it leaves — crosses an availability zone, hops a region, or exits to the public internet. It's the cloud provider's version of "hotel minibar pricing," except the minibar is your own database replicating to itself.

## The bill that didn't make sense

At Cubet Techno Labs, we once had a service that fanned out read replicas across three availability zones in the same region for resilience — a completely reasonable, textbook decision. What wasn't in the textbook: application servers in AZ-a were round-robin load balancing reads against replicas in AZ-b and AZ-c instead of preferring the local one. Cross-AZ traffic isn't free — it's billed both ways, sender and receiver, usually a couple of cents per GB. At low volume, invisible. At the traffic this service actually carried, it added up to thousands of dollars a month for data that never left the same data center building.

The fix wasn't a new feature or a bigger instance. It was one line of routing logic: prefer the replica in your own AZ.

```python
# before: round-robin across all replicas, ignoring locality
replica = random.choice(all_replicas)

# after: prefer same-AZ replica, fall back only on failure
def pick_replica(client_az, replicas):
    local = [r for r in replicas if r.az == client_az]
    return random.choice(local) if local else random.choice(replicas)
```

Same architecture, same resilience guarantees, dramatically less cross-AZ chatter.

## The NAT gateway tax

The other classic offender: routing traffic to AWS services like S3 or DynamoDB through a NAT gateway instead of a VPC endpoint. NAT gateways charge per-GB processed on top of the underlying data transfer cost — so your app quietly pays twice to fetch objects from a bucket that's technically "inside AWS the whole time."

```hcl
# terraform: gateway endpoint for S3 — no NAT, no per-GB surprise
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  route_table_ids   = [aws_route_table.private.id]
  vpc_endpoint_type = "Gateway" # gateway endpoints are free
}
```

Gateway endpoints for S3 and DynamoDB cost nothing extra to use and keep the traffic off the NAT gateway entirely. It's a fifteen-minute Terraform change that some teams never make simply because nobody thought to check whether their private subnet traffic to S3 was taking the expensive road.

## Finding the leak before finance does

You don't need a fancy observability platform to catch this — most providers already log it, you just have to go looking. On AWS, the Cost and Usage Report broken down by `usage type` will show `DataTransfer-Out-Bytes`, `DataTransfer-Regional-Bytes`, and NAT gateway processing separately. A quick Athena query over the CUR gets you there fast:

```sql
SELECT
  line_item_usage_type,
  SUM(line_item_unblended_cost) AS cost
FROM cur_table
WHERE line_item_usage_type LIKE '%DataTransfer%'
  AND line_item_usage_start_date >= date_add('day', -30, current_date)
GROUP BY line_item_usage_type
ORDER BY cost DESC;
```

Run that once a month and cross-AZ or cross-region surprises stop being surprises — they show up as a trend line you can act on before it becomes a postmortem.

## The checklist that actually moves the needle

- **Same-AZ affinity for chatty services** — databases, caches, service-to-service calls. Don't let your load balancer randomly pick across zones when locality is free and cross-zone isn't.
- **VPC/Gateway endpoints for S3 and DynamoDB** — free, and they take load off your NAT gateway too.
- **CDN in front of anything public** — egress to a CDN edge is usually cheaper than egress straight from origin, and it's faster for users as a bonus.
- **Watch cross-region replication** — async DR replication is often necessary, but know the per-GB cost before you turn it on for every dataset, not just the ones that need it.
- **Tag data-transfer-heavy resources** — so when the bill spikes, you know which team's pipeline to go talk to instead of guessing.

None of this is glamorous work. It won't show up in a sprint demo. But the difference between a team that reviews its transfer cost line monthly and one that doesn't is often the difference between a rounding error and a line item someone has to explain to finance.

Go open your billing console right now and filter for anything with "transfer" in the name. I'll wait. If the number surprises you, you've just found this quarter's highest-ROI half-day of work — and it doesn't require touching a single feature your users will ever see.
