---
title: "⚡ Tiltfile Confessions: Making Kubernetes Feel Like npm run dev"
date: "2026-08-16"
excerpt: "Your app runs in Kubernetes in production, but your laptop still runs kubectl apply, wait, curl, repeat. Here's how Tilt turned our inner dev loop from 'go make coffee' into something that actually feels fast."
tags: ["kubernetes", "devops", "developer-experience", "platform-engineering", "tilt"]
featured: true
---

Here's a sentence that should never be true in 2026: "let me just push this, wait three minutes for the image to build, then re-apply the deployment to see if my one-line fix worked." And yet that was the exact inner loop on my team for longer than I'd like to admit. We had a beautifully engineered Kubernetes platform in production and a laptop workflow that belonged in 2016.

The irony is that we obsess over developer experience for *users* of our platform — golden paths, self-service infra, all of it — and then hand our own engineers a local dev loop that's basically "manually reconstruct production, badly, by hand." If your team ships to Kubernetes but develops against `docker-compose up` (or worse, a shared "dev" namespace everyone steps on), you already know the pain: config drift, "works on my cluster," and a 40-second feedback loop for a one-line change.

## The problem with pretending Kubernetes doesn't exist locally

Most teams solve the local-dev-vs-k8s-prod gap one of two ways, and both have a catch:

1. **docker-compose for local, Kubernetes for prod.** Fast locally, but you're testing against a different orchestrator than the one that actually breaks at 2am. Service discovery, resource limits, network policies — none of that gets exercised until staging.
2. **A shared dev/staging namespace everyone deploys to.** You get real Kubernetes behavior, but also five engineers fighting over the same pods, overwriting each other's changes, and debugging "why is my service returning someone else's response."

What actually works is developing *against* real Kubernetes, but making the edit-build-deploy loop fast enough that you forget it's happening. That's the whole pitch behind tools like [Tilt](https://tilt.dev) and Skaffold: watch your source files, rebuild just the layer that changed, sync it into a running pod, and reflect the result in seconds — not minutes.

## What this actually looks like

A `Tiltfile` is just Python-ish config that says "here's how to build this, here's how to deploy it, here's what to watch":

```python
# Tiltfile
docker_build(
    'myapp-api',
    '.',
    live_update=[
        sync('./src', '/app/src'),
        run('npm install', trigger=['package.json']),
    ],
)

k8s_yaml('k8s/dev/deployment.yaml')
k8s_resource('myapp-api', port_forwards=8080)
```

The `live_update` block is the magic. Instead of rebuilding the whole image and rolling a new pod every time you save a file, Tilt `rsync`s the changed files directly into the running container and, if needed, runs a targeted command (like reinstalling deps only when `package.json` actually changes). A code change goes from "rebuild image → push → redeploy → wait for readiness probe" to "save file → see it in the pod in under two seconds."

The other half of the trick is namespacing. Give each engineer (or each branch, if you want to go full ephemeral) their own throwaway namespace:

```yaml
# k8s/dev/kustomization.yaml
namePrefix: dev-anuragh-
namespace: dev-anuragh
resources:
  - deployment.yaml
  - service.yaml
```

Now everyone gets real Kubernetes — real service discovery, real config maps, real resource limits — without stepping on each other. `tilt up` spins it up, `tilt down` tears it down, and nobody's debugging a service that some other engineer's laptop half-deployed and abandoned.

## What actually went wrong for us

I'll be honest, the first rollout wasn't smooth. At Cubet, when we migrated a services team from compose to Tilt, two things bit us hard:

**Live-update rules were too broad.** We initially synced the entire repo root into the container on every save, including `node_modules` changes triggered by unrelated lockfile edits. Every save turned into a 30-second `npm install` inside the pod — slower than the compose workflow we were replacing. The fix was being deliberate about `trigger=` conditions instead of letting Tilt watch everything by default.

**Resource limits on dev clusters weren't the same as prod.** Because we were finally running against real Kubernetes locally, we discovered our staging resource requests were wrong — pods were getting OOMKilled locally that had "worked fine" under compose (which just ignores memory limits by default). Annoying in the moment, genuinely useful in hindsight: we caught a prod misconfiguration two weeks before it caused an incident, purely because local dev started behaving like the real thing.

The lesson that stuck: **the value of Tilt isn't just speed, it's honesty.** A fast local loop that lies to you about how your app behaves in Kubernetes is arguably worse than a slow one that tells the truth. You want both — and it turns out you can have both, you just have to be careful about what you sync and how you tune resource requests for a laptop-sized cluster (kind or a small remote dev cluster both work fine).

## Try it before you build your own thing

If your team has quietly built an internal script that does `kubectl apply` in a loop with `fswatch`, do yourself a favor and try Tilt or Skaffold first. Both are boring, well-maintained, and solve exactly this problem — you don't need to own the maintenance burden of a bespoke file-watcher forever.

Start small: pick your most-iterated-on service, write a 20-line Tiltfile for it, and time your next five bug fixes before and after. If your team's response is "wait, that's it?" — you've found your next platform investment.
