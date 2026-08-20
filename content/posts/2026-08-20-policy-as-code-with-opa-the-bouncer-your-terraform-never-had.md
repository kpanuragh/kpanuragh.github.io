---
title: "🛂 Policy-as-Code with OPA: The Bouncer Your Terraform Never Had"
date: "2026-08-20"
excerpt: "Code review catches typos. It does not catch a junior engineer provisioning an internet-facing S3 bucket at 4:58pm on a Friday. Open Policy Agent is the club bouncer that checks IDs before the plan ever reaches apply."
tags:
  - devops
  - iac
  - opa
  - policy-as-code
  - terraform
  - platform-engineering
featured: true
---

# 🛂 Policy-as-Code with OPA: The Bouncer Your Terraform Never Had

Here's a fun exercise. Go find your Terraform repo's `main.tf` history and grep for `0.0.0.0/0`. I'll wait.

Found a few, didn't you? Maybe a security group rule from "just for testing," maybe an S3 bucket policy that someone loosened to debug a CORS issue in 2024 and never tightened back up. Nobody *decided* to leave your infrastructure open to the internet. It just happened, one reasonable-looking PR at a time, because the only thing standing between "works on my laptop" and "deployed to prod" was a human reviewer skimming a 400-line diff before their next meeting.

Code review is great at catching typos, bad variable names, and "wait, why are we deleting this resource." It is spectacularly bad at catching "this IAM policy grants `*:*` on `*`" buried in line 287 of a plan output nobody actually reads end to end. Humans get tired. Humans get rushed. Humans do not get tired of grep.

This is the entire pitch for policy-as-code: stop asking humans to be the last line of defense against machine-generated YAML, and start asking machines.

## Enter Open Policy Agent

[OPA](https://www.openpolicyagent.org/) is a general-purpose policy engine. You write rules in a language called Rego, feed it some JSON (a Terraform plan, a Kubernetes manifest, an API request, whatever), and it answers a yes/no question: does this thing violate policy?

The trick that makes OPA interesting instead of just "another linter" is that it's decoupled from what it's evaluating. The same engine that blocks a Terraform plan can admit or reject a Kubernetes Pod, authorize an API call, or gate a CI pipeline step. One policy language, everywhere you'd otherwise be hand-rolling bash scripts full of `grep` and hope.

Here's a real one — blocking public S3 buckets before `terraform apply` ever runs:

```rego
package terraform.s3

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket_public_access_block"
  resource.change.after.block_public_acls == false
  msg := sprintf(
    "bucket '%s' must block public ACLs — set block_public_acls = true",
    [resource.address]
  )
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_security_group_rule"
  resource.change.after.cidr_blocks[_] == "0.0.0.0/0"
  resource.change.after.from_port <= 22
  resource.change.after.to_port >= 22
  msg := sprintf(
    "'%s' opens SSH to the entire internet — scope the CIDR",
    [resource.address]
  )
}
```

Wire that into CI with `conftest`, OPA's plan-testing sidekick:

```bash
terraform show -json tfplan > plan.json
conftest test plan.json --policy policies/
```

Now that "just for testing" security group rule doesn't get a friendly PR comment — it gets a red X and a message telling the engineer exactly which line and exactly why. No meeting required. No relying on the reviewer to have caffeine in their system.

## It's not just Terraform

The other place OPA earns its keep is inside the Kubernetes API server itself, via [Gatekeeper](https://open-policy-agent.github.io/gatekeeper/) — OPA packaged as an admission controller. Instead of catching the bad manifest in CI (where someone can still `kubectl apply -f` around it), Gatekeeper rejects it at admission time, cluster-wide, no exceptions:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-owner-label
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Namespace"]
  parameters:
    labels: ["owner", "cost-center"]
```

Try to create a namespace without an `owner` label and the API server just says no. This sounds boring until you're the platform team trying to answer "whose namespace is eating 40% of the cluster's memory" for the third time this quarter, and the answer is "nobody knows, it doesn't have an owner label." Policy-as-code turns "please remember to tag things" — the most ignored sentence in any onboarding doc — into something that's actually enforced instead of politely requested.

## The lesson I learned the hard way

At Cubet, we rolled out an OPA gate on Terraform plans after — you guessed it — an incident. Not a breach, thankfully, just a very expensive one: an autoscaling group misconfiguration that spun up far more instances than intended over a long weekend, because the plan looked "close enough" to what the reviewer expected and nobody cross-checked the instance count against the module defaults.

The fix wasn't "review harder." Reviewing harder doesn't scale and burns people out. The fix was writing a policy that says "flag any plan where `desired_capacity` deviates more than 20% from the last applied state without an explicit `override-scaling` label on the PR." That one rule has since caught three separate typos before they became bills. It never gets tired, never gets rushed, and never assumes someone else already checked.

The thing nobody tells you going in: your first Rego policies will be too strict, and you will spend a week getting angry Slack messages from engineers blocked on legitimate changes. That's fine — that's the tuning process, not a sign the approach is wrong. Start with `deny` rules that only cover your last two incidents, not your imagined worst case. A policy nobody understands gets disabled. A policy that catches the exact thing that bit you last month gets respected.

## Try it before you need it

Don't wait for your own "0.0.0.0/0 in prod for eighteen months" story. Pick the one Terraform mistake that's happened at your org more than once, write a five-line Rego rule for it, and wire it into CI this week with `conftest`. You don't need a grand unified policy framework on day one — you need one bouncer at one door, checking for the one thing that's already burned you.

What's the policy you wish had existed before your last incident? That's the one to write first.
