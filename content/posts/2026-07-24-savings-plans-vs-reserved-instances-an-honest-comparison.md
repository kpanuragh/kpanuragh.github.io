---
title: "💰 Savings Plans vs Reserved Instances: The Cloud Discount Nobody Explains Properly"
date: "2026-07-24"
excerpt: "AWS gives you two ways to pre-commit for a discount, and the console makes them look almost identical. They are not. Here's the difference that actually matters, and the mistake that costs teams real money."
tags: ["cloud-cost", "aws", "finops", "devops", "platform-engineering"]
featured: true
---

Every few months, someone on a platform team opens the AWS Cost Explorer, sees a "Recommendations" tab glowing at them, and thinks: "great, free money, let's commit to something." Then they pick between Reserved Instances and Savings Plans by essentially flipping a coin, because the console explains the difference in a tooltip that fits in a text bubble the size of a fortune cookie.

I've made this decision for real infrastructure, watched a team get it wrong, and watched the finance team ask very pointed questions in the next budget review. So let's actually walk through it — not the marketing-page version, the "what happens when your architecture changes in six months" version.

## They solve the same problem, differently

Both instruments exist because on-demand pricing is the "rack rate" of cloud computing — nobody who's staying more than a night actually pays it. You commit to a certain amount of usage over 1 or 3 years, and AWS gives you a discount of up to ~72% off on-demand. The difference is *what* you're committing to.

**Reserved Instances (RIs)** commit to a specific thing: instance family, region, and (for Standard RIs) tenancy — e.g. "one `m6i.xlarge` in `us-east-1`." You're locking in a shape, not a spend.

**Savings Plans** commit to a dollar amount per hour — e.g. "$4.50/hour of compute usage" — and AWS applies the discount to whatever EC2, Fargate, or Lambda usage you actually incur, up to that commitment, regardless of instance family or (for Compute Savings Plans) region.

That one distinction — shape vs. spend — is the whole ballgame, and almost every real-world regret traces back to picking the wrong one for how volatile your architecture actually is.

## Where RIs quietly become a tax

RIs were designed for an era when a fleet was a fleet — you provisioned `m5.2xlarge` instances for a monolith and that shape didn't change for years. If that's genuinely your world, Standard RIs are the best discount AWS offers, better than Savings Plans at the same term, because you're giving up more flexibility.

The problem is almost nobody's fleet looks like that anymore. We migrated a service at Cubet from `m5` to `m6i` for the better price-performance, and the RIs we'd bought six months earlier for `m5` didn't just become slightly less optimal — they became *dead weight*. You can sell unused Standard RIs on the AWS Marketplace, but that's a process, not a button, and in the meantime you're paying for capacity you're not using while also paying on-demand for the instances you switched to. Convertible RIs exist to soften this (you can exchange them for a different family), but the discount is smaller and the exchange process still isn't instant.

## Where Savings Plans actually win

Savings Plans decouple the discount from the shape of your infrastructure entirely. This matters more than people expect the first time they see it in a bill:

```
# Roughly what a Compute Savings Plan covers without any reconfiguration:
$5/hr commitment covers, in any combination:
  - m6i.xlarge in us-east-1
  - c7g.2xlarge (Graviton) in us-west-2
  - Fargate tasks
  - Lambda duration (yes, really)
```

If you're mid-migration to Graviton, shifting workloads between regions, or moving services onto Fargate, a Compute Savings Plan just keeps applying while all of that churns underneath it. EC2 Instance Savings Plans are a middle ground — locked to an instance family in a region (better discount than Compute SPs, similar to Standard RIs) but still flexible on size and OS, which covers the common case of "we'll always run *some* amount of `m6i` in this region, we just don't know exactly which sizes yet."

## The mistake I actually watched happen

A team sized their 3-year RI commitment off *current* peak traffic during a growth phase, then the product pivoted and traffic patterns shifted entirely to serverless six months later. The RIs kept billing at full commitment for two and a half more years regardless of whether the underlying instances were running. Nobody had modeled what happens if the architecture — not just the traffic volume — changes mid-commitment, because the assumption baked into an RI is "the shape stays the shape."

The actual lesson wasn't "RIs are bad." It was: **match the commitment's flexibility to your team's rate of architectural change, not just your traffic growth curve.** A stable, boring monolith with a fleet that hasn't changed shape in two years? RIs, ideally Standard for the extra discount. Anything actively migrating, adopting Graviton, or shifting between EC2/Fargate/Lambda? Savings Plans, full stop — the discount is close enough to RIs that the flexibility isn't a trade-off, it's free insurance.

## A rule of thumb you can actually use

```
if fleet_shape_is_stable and no_migration_planned(next_12mo):
    use Standard Reserved Instances   # max discount, you can afford the rigidity
elif fleet_shape_is_mostly_stable:
    use EC2 Instance Savings Plans    # near-RI discount, size/OS flexible
else:
    use Compute Savings Plans         # lower discount, but survives any migration
```

And whichever you pick: start with a 1-year term before you commit to 3. The discount difference between 1-year and 3-year is real but modest, and 3-year commitments made under current architecture assumptions are exactly the kind of decision that looks obviously wrong in hindsight — which, if you've worked in this industry for more than a year, should sound familiar.

Go check your Cost Explorer commitment recommendations right now with this framing in hand — I'd bet at least one team in your org is sitting on RIs for instance families nobody's provisioned in months.
