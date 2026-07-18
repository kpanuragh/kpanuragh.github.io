---
title: "VPC Peering vs Transit Gateway: The Security Blast Radius Nobody Draws on the Whiteboard 🕸️"
date: "2026-07-18"
excerpt: "VPC peering feels simple until you have 40 VPCs and a mesh of trust relationships nobody can audit. Transit Gateway feels simple until one route table typo bridges prod and dev. Here's how to actually reason about the security tradeoffs."
tags:
  - aws
  - cloud-security
  - networking
  - infrastructure
featured: true
---

Every cloud architecture diagram I've ever seen draws VPCs as tidy boxes with clean lines between them. Nobody draws the line that matters: the line between "this connection was an intentional security decision" and "this connection exists because someone ran `terraform apply` at 5 PM on a Friday and it worked."

VPC Peering and Transit Gateway both solve the same problem — letting VPCs talk to each other — and both get chosen for the same reason: it's the thing that made the connectivity error go away. Almost nobody picks between them by actually reasoning about the security model. That's the gap I want to close, because the two approaches fail in genuinely different ways.

## Peering: Simple Until It Isn't

VPC Peering is a point-to-point, non-transitive connection between exactly two VPCs. "Non-transitive" is the load-bearing word here, and it's also the thing that makes peering deceptively safe-looking and actually dangerous at scale.

Non-transitive means if VPC A peers with VPC B, and VPC B peers with VPC C, traffic from A cannot reach C through B. Sounds like a security feature — blast radius is contained to direct relationships, right? The problem is what happens when you have 15 VPCs that all need to talk to a shared services VPC (logging, secrets, CI runners). You don't get one relationship. You get a full mesh, or close to it:

```
VPCs: 15
Peering connections needed for full mesh: n(n-1)/2 = 105
```

105 individual peering connections, each with its own route table entries, each one a separate object someone has to remember exists, audit, and eventually decommission. In practice nobody builds a full mesh — they build whatever accreted over eighteen months of "just peer prod-a to the logging VPC real quick." The result is an asymmetric graph where the actual reachability between any two VPCs is a question you can only answer by reading every route table in the account, because there's no single place that shows you the whole topology.

That's the real security issue with peering at scale: it's not that any individual connection is insecure, it's that **the aggregate trust graph becomes unauditable**. I've sat in incident reviews at Cubet where the first twenty minutes weren't spent fixing anything — they were spent figuring out which of nine peering connections a compromised instance could actually use to pivot, because nobody had a current diagram and the route tables told nine different partial stories.

```bash
# The question every peering-heavy account should be able to answer in seconds,
# but usually can't without a script like this:
aws ec2 describe-vpc-peering-connections \
  --filters "Name=status-code,Values=active" \
  --query 'VpcPeeringConnections[].{
    A:AccepterVpcInfo.VpcId,
    B:RequesterVpcInfo.VpcId
  }' --output table
```

Run that against a mature account and count how many results surprise you.

## Transit Gateway: One Hub, One Very Important Route Table

Transit Gateway (TGW) flips the model: instead of pairwise connections, every VPC attaches to a central hub, and a route table on the hub decides who can reach whom. This is genuinely better for manageability — one place to look, N attachments instead of N² connections. But it trades a distributed-and-messy trust problem for a centralized-and-catastrophic one.

With peering, a misconfiguration is scoped to two VPCs. With Transit Gateway, a misconfiguration in the route table can bridge every attached VPC at once, because by default a single TGW route table often ends up shared across everything unless you deliberately segment it. The security control that makes TGW manageable — centralization — is the same thing that makes a mistake there so much more expensive.

The fix is **TGW route table segmentation**, and it's the single most important security decision in a TGW design: don't use the default route table for everything. Build separate route tables per trust zone (prod, non-prod, shared-services) and associate attachments explicitly, so a dev VPC physically cannot route to prod even if someone fat-fingers a CIDR somewhere else.

```hcl
# Segmented TGW route tables — prod and non-prod can each reach
# shared-services, but never each other
resource "aws_ec2_transit_gateway_route_table" "prod" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
}

resource "aws_ec2_transit_gateway_route_table" "nonprod" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
}

resource "aws_ec2_transit_gateway_route" "prod_to_shared" {
  destination_cidr_block        = "10.99.0.0/16" # shared-services VPC
  transit_gateway_attachment_id = aws_ec2_transit_gateway_vpc_attachment.shared.id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.prod.id
}
# No route from prod table to the nonprod VPC's CIDR — omission is the control.
```

That last line is the whole point: in a segmented TGW design, security isn't something you add, it's something you get by *not adding* a route. The absence of a route is doing more work than any security group ever will.

## So Which One, Actually

Peering wins when the relationship count is genuinely small and stable — two or three VPCs, a clear owner for each connection, low churn. The non-transitive property is a real security asset there: it's an explicit allowlist by construction, and there's no shared blast radius to reason about.

Transit Gateway wins the moment you're past roughly half a dozen VPCs that need mutual or hub-and-spoke reachability, *provided* you treat route table segmentation as a day-one requirement, not a hardening pass you'll "get to later." A flat TGW with one route table shared by everything is arguably worse than a messy peering mesh, because it looks centralized and controlled while actually being one typo away from prod being reachable from a sandbox account.

Either way, the actual security review question is the same one, and it's the one that gets skipped: **draw the real reachability graph, not the intended one.** Pull every peering connection or every TGW route table association and render what's actually routable today, then compare it to what you'd approve if you were reviewing it fresh. The gap between those two graphs is where the incidents live.

## The Takeaway

Connectivity tooling optimizes for "can these two things talk." Security review has to optimize for "should these two things be able to talk, and can I prove that in under five minutes when it matters at 2 AM." Peering makes you audit N² relationships by hand. Transit Gateway makes you audit one route table extremely carefully. Pick the failure mode you're actually equipped to catch — and then go build the tooling to catch it, because neither AWS console will draw the real graph for you.

---

Got a war story about a peering connection nobody remembered existed, or a TGW route table that grew teeth? I'd love to hear it — find me on [Twitter/X](https://x.com/anuragh_kp) or [GitHub](https://github.com/kpanuragh), and if you're building out multi-account network segmentation, [LinkedIn](https://linkedin.com/in/anuraghkp) is the best place to reach me directly.
