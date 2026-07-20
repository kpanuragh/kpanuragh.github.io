---
title: "🔏 Anyone Can Push an Image Called `myapp:latest` — Signing Is How You Prove It Was You"
date: "2026-07-20"
excerpt: "Your registry doesn't check who pushed an image, only that they had a token. Here's how cosign and Sigstore let your cluster refuse to run anything that isn't provably yours — without you having to manage a single private key by hand."
tags:
  - devops
  - containers
  - security
  - supply-chain
  - kubernetes
featured: true
---

# 🔏 Anyone Can Push an Image Called `myapp:latest` — Signing Is How You Prove It Was You

Quick thought experiment: if I got a leaked CI token for your registry right now, how would your cluster know the image I pushed at 3am wasn't the one your pipeline built?

If the honest answer is "it wouldn't, it'd just pull it and run it" — congratulations, you have the same setup as basically every team I've worked with, right up until someone asks the question out loud in a security review.

Container registries authenticate *pushes*, not *provenance*. A valid token gets you in. Nothing downstream checks whether the bytes it's about to run on a node actually came from your build pipeline versus a compromised laptop, a supply-chain attacker, or a very confident intern. That gap is exactly what image signing closes.

## Signing Used to Be a Nightmare, So Nobody Did It

Old-school image signing (think Docker Content Trust / Notary) involved managing your own key pairs, rotating them, distributing public keys to every verifier, and hoping nobody committed the private key to a public repo. It technically worked. Almost nobody actually ran it in production because the operational overhead outweighed the paranoia.

[Sigstore](https://www.sigstore.dev/) and its CLI, `cosign`, fixed the actual blocker: **keyless signing**. Instead of managing a long-lived private key, your CI job authenticates with an OIDC identity (GitHub Actions' built-in OIDC token, for example), and Sigstore's `Fulcio` issues a short-lived certificate binding that identity to a one-time signing key. The signature — plus a transparency-log entry in `Rekor` — is all that gets stored. No key custody problem, because there's no long-lived key to lose.

## Signing an Image in CI

Here's the whole thing in a GitHub Actions job, no secrets required:

```yaml
permissions:
  id-token: write   # required for keyless OIDC signing
  contents: read

jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push image
        run: |
          docker build -t ghcr.io/myorg/myapp:${{ github.sha }} .
          docker push ghcr.io/myorg/myapp:${{ github.sha }}

      - name: Install cosign
        uses: sigstore/cosign-installer@v3

      - name: Sign image (keyless)
        run: cosign sign --yes ghcr.io/myorg/myapp:${{ github.sha }}
```

That `--yes` just skips the interactive confirmation — `cosign` still goes off and does the OIDC dance with GitHub's identity token, gets a cert from Fulcio, signs, and writes the record to the public Rekor log. Nothing to store, nothing to rotate, nothing to leak.

## Actually Enforcing It (the Part Everyone Skips)

Signing an image that nothing checks is a nice audit trail and zero actual security. The value shows up when your cluster *refuses to run unsigned images*. On Kubernetes, that's usually [`sigstore-policy-controller`](https://docs.sigstore.dev/policy-controller/overview/) or Kyverno with the `verifyImages` rule:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  rules:
    - name: verify-image-signature
      match:
        resources:
          kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*"
                    issuer: "https://token.actions.githubusercontent.com"
```

That `subject`/`issuer` pair is the whole point — it's not just checking "is this signed by *someone*", it's checking "is this signed by *my org's GitHub Actions*, specifically". Someone else's valid Sigstore signature doesn't help them; the identity has to match.

The first time we turned `validationFailureAction: Enforce` on for this at Cubet, we broke a deploy within the hour — not from an attack, from our own hotfix path that built images locally and pushed with a personal token, bypassing CI entirely. Which, in hindsight, was the policy working exactly as intended. It just felt like an outage until we figured out why.

## The Lesson: Enforce First in `Audit` Mode

If you're rolling this out, don't jump straight to `Enforce`. Start with `Audit` (or your admission controller's equivalent — logs violations without blocking), let it run for a couple of weeks, and see what actually breaks. You'll find:

- Base images your team pulls straight from Docker Hub that never go through your pipeline
- Debug/scratch images built by hand during incidents
- That one legacy service still deployed via a shell script from 2023

Fix those paths, *then* flip to enforce. Otherwise you're the person who took prod down at 6pm rolling out a "security improvement," and nobody remembers the CVE you prevented — they remember the outage you caused.

## SBOMs Are the Natural Next Step

Once signing is in place, attaching a signed SBOM (`cosign attach sbom` + `cosign sign`) to the same image gives you a queryable, tamper-evident record of exactly what's inside — which pairs nicely with whatever vulnerability scanner you're already running in CI. Signing answers "did this come from us"; the SBOM answers "what's actually in it." You want both, but get the identity problem solved first — it's the cheaper win and it's the one that stops the 3am mystery-token scenario cold.

If your cluster currently trusts any image with a valid registry token, that's the gap worth closing this quarter. Keyless signing removes the excuse of "key management is too hard" — there's no key to manage anymore.
