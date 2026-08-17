---
title: "Signing Container Images with Cosign: So Your Cluster Can Tell Good From Forged 🔏"
date: "2026-08-17"
excerpt: "Your image scanner tells you an image is clean. Nothing tells your cluster that the image it's about to run is the exact one your CI built. Cosign fixes that gap — and it's less painful than the PGP-key-ceremony version of this you're picturing."
tags:
  - devops
  - containers
  - security
  - ci-cd
featured: true
---

Quick question that most pipelines can't actually answer: when a pod starts on your cluster right now, how do you know the image it's pulling is the one your CI built, and not something that got pushed to the registry by someone with a stolen token, or swapped in by a compromised build step upstream?

If your answer involves the words "well, the tag matches" — I have bad news. Tags are just pointers. Anyone with registry push access can move `myapp:prod` to point at whatever they want, and every layer of your stack downstream will happily pull it and run it. Image scanning tells you a specific digest was clean at scan time. It says nothing about whether the digest your cluster is running right now is the one that got scanned.

That's the gap signing closes, and thanks to Sigstore's `cosign`, it no longer requires the PGP key-ceremony nightmare you might remember from a previous decade.

## The Old Way Was Bad Enough That Nobody Did It

Classic image signing meant generating a keypair, protecting the private key like a state secret, wiring it into every CI runner, and rotating it manually when someone left the team. Most orgs looked at that cost, shrugged, and shipped unsigned images forever. Rational choice, bad outcome.

Cosign's keyless mode replaces the long-lived private key with a short-lived one, minted per-signature, tied to your CI identity via OIDC — the same trust chain GitHub Actions already gives you for free.

```yaml
# .github/workflows/build.yml
permissions:
  id-token: write   # <-- this is the whole trick
  contents: read

steps:
  - name: Build and push
    run: |
      docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
      docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

  - name: Install cosign
    uses: sigstore/cosign-installer@v3

  - name: Sign the image
    run: cosign sign --yes ghcr.io/${{ github.repository }}:${{ github.sha }}
```

No `COSIGN_KEY` secret anywhere in that workflow. `--yes` skips the confirmation prompt because there's no human at a terminal to answer it. Cosign asks GitHub's OIDC provider for a short-lived token proving "this run, in this repo, on this commit, requested a signature," trades it for an ephemeral certificate from Sigstore's Fulcio CA, signs the image digest, and publishes the signature — plus a transparency-log entry in Rekor — right next to the image in the registry. The signing key exists for seconds and is never stored anywhere.

## Verifying Is Where the Actual Value Shows Up

A signature nobody checks is a `.trivyignore` file with extra steps. The payoff is on the consuming side — CI verifying before deploy, or better, the cluster itself refusing to run anything unsigned:

```bash
cosign verify ghcr.io/myorg/myapp:abc123 \
  --certificate-identity-regexp "https://github.com/myorg/myapp/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

That `--certificate-identity-regexp` is doing the real work — it's not just checking "was this signed by *someone*," it's checking "was this signed by *the build workflow on the main branch of this exact repo*." A signature from a fork's PR workflow, or a different repo entirely, fails verification even though it's a perfectly valid Sigstore signature. Specificity is the whole point; a verify step that accepts any Sigstore signature is barely better than no verification at all.

For Kubernetes, don't leave this as a manual `cosign verify` someone remembers to run — enforce it at admission with something like [`sigstore-policy-controller`](https://github.com/sigstore/policy-controller) or Kyverno's `verifyImages`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  rules:
    - name: verify-signature
      match:
        resources:
          kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*/.github/workflows/build.yml@refs/heads/main"
                    issuer: "https://token.actions.githubusercontent.com"
```

Now an unsigned image — or one signed by the wrong pipeline — never becomes a running pod. Not a Slack alert, not a dashboard finding. A rejected admission request.

## Where This Actually Bit Us

Rolling this out on a service at Cubet, the first thing it caught wasn't an attack — it was our own staging environment. We had a habit of manually `docker push`-ing debug builds straight from laptops when chasing a hard-to-reproduce bug, tagged the same as CI builds. The admission policy rejected every one of them, loudly, which was mildly annoying for about a day and then became the thing that made us fix the actual problem: staging needed a real "debug build" path through CI instead of relying on someone's local Docker daemon having registry push creds at all. The policy didn't just block forged images — it surfaced a shortcut we'd normalized that was, itself, a supply-chain hole.

## What's Worth Doing Versus What's Overkill

- **Sign in CI, keyless, on every build that reaches a shared registry.** It's a few lines and no secrets to manage — there's no real reason not to.
- **Verify at admission for anything that matters, not just at deploy-time CI.** A CI check can be skipped by whoever has cluster access directly; admission control can't be.
- **Scope the identity check tightly.** `--certificate-identity-regexp` matched to the exact workflow and branch is what turns this from "theater" into an actual control.
- **Don't bother with long-lived keys anymore** unless you have a specific compliance requirement forcing your hand — keyless removes an entire category of "where did that private key end up" incident.
- **Pair it with scanning, don't replace it.** Signing proves provenance — this is the image CI built. Scanning proves quality — this image has no known bad dependencies. You need both; they answer different questions.

Go check whether anything currently verifies image signatures before your cluster runs a pod. If the honest answer is "we don't sign images at all," that's a Tuesday-afternoon fix, not a quarter-long initiative — and unlike a lot of security work, this one doesn't even ask you to remember a password.
