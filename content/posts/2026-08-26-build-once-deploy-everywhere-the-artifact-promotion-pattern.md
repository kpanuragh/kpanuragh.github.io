---
title: "📦 Build Once, Deploy Everywhere: The Artifact Promotion Pattern"
date: "2026-08-26"
excerpt: "If your pipeline runs `npm run build` three times for three environments, you're not testing what you ship — you're testing three different things that happen to share a name."
tags: ["cicd", "devops", "pipelines", "release-engineering"]
featured: true
---

Here's a question that ends more retros than it should: "did staging actually test what's in prod right now?" And here's the uncomfortable answer a lot of teams give: not exactly, because the pipeline rebuilt the app for every environment.

Dev gets a build. QA gets a build. Staging gets a build. Prod gets a build. Four separate `npm run build` (or `mvn package`, or `docker build`) invocations, four separate opportunities for a flaky dependency resolution, a slightly different base image tag, or a stray environment variable baked in at compile time to quietly change what actually ships. You promoted a *process*, not an *artifact*. That's the bug.

## The pattern: build once, promote the same bytes

The fix has a name — build-once, deploy-everywhere — and it's older than most of us have been writing YAML. The idea is boring in the best way: compile and package **exactly once**, per commit, and every environment after that just moves that same immutable artifact forward.

```yaml
# .github/workflows/build.yml — runs once per push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: docker build -t myapp:${{ github.sha }} .
      - run: docker push myapp:${{ github.sha }}
```

No `NODE_ENV` branching inside that build. No "if staging, build with staging config" logic baked into the compile step. Config gets injected at *deploy* time — env vars, mounted secrets, a `ConfigMap` — never at build time. The tagged image `myapp:${{ github.sha }}` is the one and only artifact that will ever be called "this release."

## Promotion is a pointer move, not a rebuild

Once you have that artifact, every later environment just re-tags or re-references it:

```yaml
# .github/workflows/promote.yml — triggered manually or on approval
jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - run: docker pull myapp:${{ inputs.sha }}
      - run: docker tag myapp:${{ inputs.sha }} myapp:staging
      - run: docker push myapp:staging
      - run: kubectl set image deployment/myapp myapp=myapp:${{ inputs.sha }} -n staging
```

The staging job never touches source code again. It doesn't run `npm ci`, it doesn't hit the package registry, it doesn't roll dice with a `latest` tag on some transitive dependency that got published an hour ago. It moves a pointer. That's the whole trick — and it's why "works in staging" starts meaning something again.

## The lesson that usually costs an incident first

At Cubet, we had a service where the Dockerfile did `RUN npm install` (not `npm ci`) inside three separate build stages triggered by three separate pipeline runs — one per environment, hours apart. A transitive dependency bumped a patch version between the staging build and the prod build later that afternoon. Staging passed every check. Prod threw an error nobody had seen twenty minutes earlier because the "same" build wasn't the same build at all — it was three different `npm install` runs that happened to target the same `package.json`.

The fix wasn't clever. Build the image once, push it to a registry keyed by commit SHA, and every subsequent environment pulls that exact tag. `npm ci` instead of `npm install` closed the lockfile gap; the promotion pipeline closed the "which bytes actually ran" gap. Two separate problems, same root cause: nothing forced the artifact to stay identical across stages.

## What actually needs to be environment-specific

The pushback I hear most: "but staging and prod *do* need different config — different DB hosts, different feature flags, different scaling." Sure. That's exactly why config injection is a runtime concern, not a build concern:

```yaml
# deploy time, not build time
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: myapp-secrets-${{ inputs.environment }}
        key: database-url
```

The binary/image never changes. The environment variables it reads at startup do. If your app needs to be recompiled to know which database to talk to, that's a code smell worth fixing on its own — it usually means config got hardcoded somewhere it shouldn't have been.

## Where this pays off beyond "fewer surprises"

- **Faster promotions.** Re-tagging an image takes seconds; rebuilding takes minutes. Your path to prod after an approval gets shorter.
- **Real rollback.** Rolling back means pointing the deployment at the previous SHA's artifact — not re-running a build against a commit from three days ago and hoping the dependency tree resolves the same way it did then.
- **Provable traceability.** "What's running in prod" becomes a single SHA you can look up, not a guess based on "whatever the pipeline produced that day."

## Try this on your own pipeline

Go look at your CI config right now and count how many times `build`, `compile`, or `docker build` appears across your environment stages. If the answer is more than one, you're not promoting a release — you're re-rolling the dice at every stage and hoping they land the same. Collapse it to one build job, push a SHA-tagged artifact, and make every later stage a promotion, not a rebuild. Your staging environment will finally mean what everyone assumes it means.
