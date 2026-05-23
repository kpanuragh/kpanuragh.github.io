---
title: "🔗 VPC Peering vs Transit Gateway: The Security Showdown Your Cloud Network Needs"
date: "2026-05-23"
excerpt: "VPC peering and Transit Gateway both connect your cloud networks — but they have wildly different security models. Here's how to choose without accidentally leaving your blast radius the size of a continent."
tags:
  - cloud-security
  - aws
  - vpc
  - networking
  - infrastructure
featured: true
---

Picture this: your security team discovers that a compromised dev instance in one VPC can reach your production database in another — because someone set up "just a quick peering connection" six months ago and nobody scoped the routes properly. I've seen this exact scenario play out at Cubet on a client audit. The blast radius went from "one container" to "three environments" in a single lateral movement.

VPC peering and AWS Transit Gateway are both legitimate ways to connect your cloud networks. But their security models are fundamentally different, and picking the wrong one — or configuring the right one badly — turns your neat network segmentation into a polite suggestion.

Let's break it down.

## VPC Peering: Direct but Dumb About Scale

VPC peering creates a direct, private connection between two VPCs. No transit. No hops. Traffic goes straight from A to B over Amazon's backbone without touching the internet.

**The security model:** Route tables + security groups. That's it.

Peering itself doesn't expose anything — you still need to explicitly add routes and open security groups. The danger is what happens in practice: engineers add a `/16` route because it's easier than figuring out the exact subnets, and suddenly "allow DB port from dev VPC" means allow it from *every resource in a 65,536-address block*.

The other classic footgun: **non-transitive routing is a feature, not a bug** — but people don't realise it until they try to route VPC-A → VPC-B → VPC-C. That doesn't work. So they add another peering. Then another. You end up with a mesh of 12 peering connections for 5 VPCs, each with its own route table entries, and nobody has a clear picture of who can talk to whom.

Here's what a least-privilege peering setup looks like in Terraform:

```hcl
# Route ONLY the specific subnet CIDR, not the whole VPC block
resource "aws_route" "dev_to_prod_db_only" {
  route_table_id            = aws_route_table.dev_private.id
  destination_cidr_block    = "10.1.4.0/24"   # prod DB subnet only
  vpc_peering_connection_id = aws_vpc_peering_connection.dev_prod.id
}

# Security group — restrict to exact port and source subnet
resource "aws_security_group_rule" "allow_dev_to_rds" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/24"]  # dev app subnet, not /16
  security_group_id = aws_security_group.prod_rds.id
}
```

Specifying `/24` instead of `/16` sounds pedantic. It isn't. It's the difference between "only the app servers can reach the DB" and "anything that ever lands in dev can try."

## Transit Gateway: Scalable, but Security Lives in Route Tables

Transit Gateway (TGW) is a regional hub that connects VPCs, VPNs, and Direct Connect links. Instead of a mesh of peerings, everything attaches to the TGW and routes flow through it.

The security model shifts: **TGW route tables become your primary traffic control plane**. Each VPC attachment can be associated with a route table, and you can have multiple route tables to enforce segmentation.

The architectural pattern that matters most for security is **isolated route tables**. By default, a TGW has one route table and everything can reach everything — which is fine for three VPCs and a nightmare for thirty.

```hcl
# Separate route tables for prod vs. non-prod
resource "aws_ec2_transit_gateway_route_table" "prod" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  tags = { Name = "prod-rt" }
}

resource "aws_ec2_transit_gateway_route_table" "nonprod" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  tags = { Name = "nonprod-rt" }
}

# Prod VPCs only associate with prod route table
resource "aws_ec2_transit_gateway_route_table_association" "prod_app" {
  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.prod_app.id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.prod.id
}

# Dev/staging attach to nonprod — they literally cannot route to prod table
resource "aws_ec2_transit_gateway_route_table_association" "staging" {
  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.staging.id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.nonprod.id
}
```

The key insight: even if someone misconfigures a security group, traffic between prod and nonprod won't flow because the route simply doesn't exist in the route table. Defense in depth — the network layer blocks it before the compute layer gets a chance to not block it.

## The Security Comparison You Actually Need

| Concern | VPC Peering | Transit Gateway |
|---|---|---|
| Traffic isolation | Route tables per peering | Route tables per attachment group |
| Blast radius of a mistake | One peering link | All attachments in that route table |
| Centralized logging | VPC Flow Logs per VPC | TGW Flow Logs — one place |
| Policy enforcement | Distributed (each VPC's own SGs/NACLs) | Centralized route tables + Network Firewall inline |
| Transitive routing | No — and that's good | Yes — and that's the point |
| Who can accidentally add a route | Whoever has VPC perms | Whoever has TGW route table perms |

That last row matters. With peering, route proliferation is distributed — anyone with VPC permissions can add a route in any VPC. With TGW, you can lock down route table modifications to a central networking team, which dramatically tightens your change control surface.

## When to Use Which

**Use VPC peering when:**
- You have ≤ 3–4 VPCs that need to communicate
- The connection is permanent and the routing is simple (service A talks to service B, full stop)
- You want zero additional cost (peering is free; you pay for data transfer, not the connection)

**Use Transit Gateway when:**
- You have more than ~5 VPCs or expect to grow
- You need to enforce hard network segmentation between environments (prod vs. dev vs. compliance boundary)
- You want to insert inspection — TGW integrates with AWS Network Firewall for deep packet inspection inline
- You're connecting hybrid networks (VPN + Direct Connect + VPC all in one topology)

The "VPC peering is cheaper" argument breaks down once you're managing a 12-node mesh. At that scale, route table management becomes a full-time job and one misplaced `/16` can ruin your week.

## The Monitoring Gap People Miss

Both approaches support VPC Flow Logs. TGW adds its own flow logs at the transit layer — you see traffic *between* VPCs, not just within them. For incident response, that transit-layer visibility is invaluable: you can answer "did traffic actually traverse the TGW?" separately from "did it reach the destination VPC?"

Enable TGW flow logs and ship them to a separate, write-protected S3 bucket that only your security tooling can read. Attackers who compromise a workload account can't tamper with transit-layer evidence they don't control.

## The Bottom Line

VPC peering is a sharp tool — simple, fast, and cheap, but easy to misconfigure into a lateral movement highway. Transit Gateway is infrastructure-as-a-security-control when you use isolated route tables properly.

The worst outcome isn't choosing the wrong option. It's choosing either one without thinking through the blast radius, then spending a Saturday tracing how a dev box touched production data.

Network segmentation is only as good as your route table discipline. Be boring and explicit — `/24` subnets, isolated route tables, flow logs to immutable storage. Future you, staring at an incident timeline at 2am, will be grateful.

---

**Got a VPC topology horror story or a TGW gotcha I missed?** Hit me up on [Twitter/X (@kpanuragh)](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — I genuinely want to hear how bad your mesh got before you moved to a hub-spoke model.
