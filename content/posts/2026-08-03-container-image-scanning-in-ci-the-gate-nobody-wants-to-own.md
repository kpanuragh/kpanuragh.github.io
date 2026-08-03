---
title: "Container Image Scanning in CI: The Gate Nobody Wants to Own 🔍"
date: "2026-08-03"
excerpt: "Everyone agrees vulnerable images shouldn't ship. Nobody agrees on who fails the build when one does. Here's how to wire image scanning into CI so it actually blocks bad images instead of becoming a Slack channel full of ignored warnings."
tags:
  - devops
  - containers
  - security
  - ci-cd
featured: true
---

Somewhere in your org there's a container registry with a few thousand images in it, and if you ran a scanner against all of them right now, you'd find CVEs old enough to vote. Not because anyone's careless — because "we should scan our images" is a sentence every team agrees with in principle and nobody owns in practice. It's the security equivalent of a gym membership.

The fix isn't buying a scanner. Every cloud vendor, registry, and CI platform already ships one. The fix is deciding what happens when the scanner finds something — and building that decision into the pipeline instead of into a dashboard nobody opens.

## Scanning Is Easy. Gating Is the Hard Part

Adding a scan step to CI takes ten minutes:

```yaml
# .github/workflows/build.yml
- name: Build image
  run: docker build -t myapp:${{ github.sha }} .

- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    format: table
    exit-code: '0'   # <-- the whole problem is right here
    severity: CRITICAL,HIGH
```

Notice `exit-code: '0'`. That's the setting almost every "we added scanning" rollout ships with, because `exit-code: '1'` means the build fails, and the first time it fails on a Friday afternoon over a CVE in a transitive dependency nobody's ever heard of, someone flips it back to `0` "temporarily." Eighteen months later it's still `0`, the scan step is green forever, and the Slack channel that used to get the reports has 40,000 unread messages.

Scanning without gating isn't a control. It's a report you generate and ignore — which is worse than not scanning at all, because now there's a paper trail proving you knew.

## The Gate That Actually Survives Contact With Reality

A gate that blocks every CVE dies within a month, because base images ship with dozens of low-severity findings you can't fix without breaking things. A gate that blocks nothing is decoration. The version that survives sits between those two:

```yaml
- name: Scan and gate
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    exit-code: '1'
    severity: CRITICAL,HIGH
    ignore-unfixed: true          # no fix available = nothing you can do today
    trivyignores: .trivyignore    # explicit, reviewed, expiring exceptions
```

Two decisions carry the whole thing:

- **`ignore-unfixed: true`** — failing a build over a CVE with no available patch just teaches engineers to distrust the gate. Block what's actionable; track what isn't somewhere else.
- **A `.trivyignore` file, not a bypass flag.** Exceptions go through code review like anything else, and — this part matters — they should have an expiry date attached in a comment so someone revisits them instead of accumulating forever:

```
# .trivyignore
CVE-2024-XXXXX  # base image dep, no fix yet, revisit 2026-09-01
```

When we tightened this up on a service at Cubet, the first run failed on eleven findings across a Node base image and two npm packages. Turned out three were fixed by bumping the base image tag, four had patches waiting in a `npm audit fix`, and the rest were genuinely unfixable and went into the ignore file with review-by dates. Took an afternoon. The alternative — leaving it soft-failing — would have taken zero afternoons and cost us nothing until the day it cost us everything.

## Scan the Thing You Ship, Not the Thing You Built Yesterday

The other trap: scanning at build time and never again. An image built clean today can have a CVE disclosed against one of its base layers next Tuesday, and if you only scan on push, that image sits in your registry — and possibly in production — looking green forever. Pair build-time gating with a scheduled scan of what's actually deployed:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'   # daily, catches CVEs disclosed after the build
```

Point that job at your registry or your running cluster, not your Dockerfile, and route findings to whoever owns the service — not a shared channel that's really nobody's inbox.

## What Actually Makes This Stick

- **Fail the build, don't just report.** A scan with `exit-code: 0` is a suggestion. Suggestions get ignored under deadline pressure, which is the exact moment a shortcut like an unpinned `latest` base tag sneaks in.
- **Only gate on fixable findings.** Blocking the unfixable teaches people to route around the gate entirely.
- **Exceptions are reviewed code, not a flag someone flips once.** Put an expiry on every entry in the ignore list.
- **Rescan what's deployed, not just what's built.** The threat landscape moves after your last build did.
- **Route findings to the owning team**, not a shared dumping ground. Alerts nobody's accountable for might as well not fire.

None of this is exotic. Trivy, Grype, Snyk, and your registry's native scanner all support this exact shape — build-time gate plus scheduled rescan plus reviewed exceptions. The tooling was never the hard part. The hard part is somebody deciding the build is allowed to actually fail, and then not quietly turning that back off the first time it's inconvenient.

If your pipeline has a scan step right now, go check what its exit code is set to. I'll wait. If it's `0`, you don't have a scanner — you have a very expensive way to generate logs nobody reads.
