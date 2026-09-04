---
title: "Signed Commits and SLSA Provenance: Proving Your Code Actually Came From You 🔏"
date: "2026-09-04"
excerpt: "Anyone can set git config user.name to your name and author a commit that says it's you. Signed commits and SLSA provenance are how you make that lie provable — and how your CI can prove the artifact it shipped actually came from the source you think it did."
tags:
  - security
  - supply-chain
  - git
  - ci-cd
featured: true
---

Try this right now, in any repo you have write access to:

```bash
git commit --allow-empty -m "fix: critical patch" --author="Linus Torvalds <torvalds@linux-foundation.org>"
```

Congratulations, you just authored a commit as Linus Torvalds. `git log` will show his name, his email, everything — because `git log` is just reading text fields out of a commit object, and nothing stopped you from writing whatever text you wanted in them. The "author" of a git commit is, by default, an honor system. A very large amount of your supply chain trust rests on an honor system.

This is the kind of thing that sounds academic until it isn't. It's exactly the mechanism behind real incidents where attackers impersonated maintainers in commit history to sneak backdoors past reviewers who trusted the "From:" field more than they should have. If your review process is "I recognize that name, ship it," you have a process built on a field anyone can forge.

## Signing Fixes "Who Wrote This," Not "Is This Good"

Commit signing doesn't make bad code good. What it does is make the *authorship claim* cryptographically checkable instead of a trust-me string.

```bash
# generate (or reuse) a signing key, tell git about it
git config --global user.signingkey ABCD1234EFGH5678
git config --global commit.gpgsign true

# now every commit is signed automatically
git commit -m "fix: patch the thing"

# verify a commit's signature
git log --show-signature -1
```

GitHub/GitLab will show a "Verified" badge next to signed commits, checked against keys you've uploaded to your account. That badge is the difference between "this text field says Linus" and "this commit was signed by a private key that Linus's public key can verify, and Linus's public key is the one on file for that account." One of those you can fake in ten seconds with `--author`. The other you can't, unless you've stolen a private key — which is a much higher bar, and one your key-rotation and hardware-key policies actually address.

SSH signing is the version most people actually adopt now, since you probably already have an SSH key for GitHub anyway:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

Same guarantee, no separate GPG key ceremony. This is the one I'd actually push a team toward — GPG key management is exactly the kind of friction that gets a policy quietly abandoned three months in.

## Signing the Commit Doesn't Sign the Build

Here's where a lot of teams stop, and where they're still exposed. A signed commit proves a human authored that source. It says nothing about what happened between "source committed" and "artifact deployed" — which build server ran, what flags it used, whether a compromised runner injected something before the compiler saw it. That gap is exactly what bit a widely publicized build-system compromise a few years back: the source was fine, the pipeline that touched it wasn't, and nothing in the artifact could prove which one you were looking at.

That's the problem SLSA (Supply-chain Levels for Software Artifacts) provenance targets. Instead of trusting "our CI built this," provenance is a signed, machine-checkable attestation: this exact artifact, this exact digest, was produced by this exact workflow, from this exact source commit, on this date. GitHub Actions ships this as close to free:

```yaml
# .github/workflows/release.yml
permissions:
  id-token: write     # for keyless signing of the attestation
  contents: read
  attestations: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - name: Attest build provenance
        uses: actions/attest-build-provenance@v1
        with:
          subject-path: "dist/**"
```

Now anyone downstream — your deploy pipeline, a security-conscious consumer of your package, an auditor — can run `gh attestation verify dist/bundle.js -o your-org` and get a real answer to "did this come from the workflow I think it did, from the commit I think it did," instead of just trusting that whoever uploaded it didn't swap something first.

At Cubet, we rolled SSH commit signing out gradually — enforced first on the handful of repos that feed our release pipeline, not org-wide on day one, specifically because a blanket mandate on repos nobody had audited just generates "unverified" noise that trains people to ignore the badge entirely. Provenance attestations came later, tied to the release workflow rather than every branch push, because that's the boundary that actually matters: the artifact someone downloads should be attestable, not every intermediate commit in a feature branch.

## Where This Actually Matters

- **Branch protection that requires "Verified" commits** turns an honor-system field into an enforced control — GitHub can reject unsigned pushes to protected branches outright.
- **Provenance verification in your deploy step** catches the "wait, why does this artifact's digest not match what the attestation says" case before it reaches production, not after.
- **Neither replaces code review.** A malicious actor with a legitimate signing key can still sign garbage. Signing answers "who," provenance answers "how" — review still has to answer "should this exist at all."

None of this is exotic anymore. SSH commit signing is a five-minute config change you already have the key for, and `attest-build-provenance` is a stock GitHub Action. The honor-system version of supply chain trust has been free for decades, which is exactly why so much of the internet is still running on it — do the five-minute version instead.

Signing your commits, or found a forged-author commit in the wild? I want to hear about it — find me on [GitHub](https://github.com/kpanuragh), [Twitter/X](https://twitter.com/anuragh_kp), or [LinkedIn](https://linkedin.com/in/anuraghkp).
