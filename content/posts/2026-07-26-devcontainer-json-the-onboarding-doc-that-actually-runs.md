---
title: "🧑‍💻 devcontainer.json: The Onboarding Doc That Actually Runs"
date: "2026-07-26"
excerpt: "Every team has a stale onboarding wiki page. A devcontainer.json can't go stale the same way, because it's not documentation - it's the environment. Here's what breaks when you actually commit to that."
tags:
  - devops
  - containers
  - developer-experience
  - docker
  - tooling
featured: true
---

Every team I've worked on has the same artifact: a wiki page called something like "Local Setup" that was accurate the day someone wrote it and has been quietly lying ever since. Step 4 says "install Node 16." You're on Node 20. Step 7 references a Postgres extension nobody remembers enabling manually. New hire opens a ticket on day one asking why `npm run dev` throws a native module error, and the answer is always some combination of "oh yeah, you also need `libvips`" that lives only in a senior engineer's memory.

A `devcontainer.json` doesn't fix people forgetting to update docs. What it does is remove the option to skip the step, because the "documentation" is the thing that actually builds your environment. If it's wrong, the container doesn't start, not "the container starts but silently misses a step." That's a much better failure mode — loud beats quiet every time in a build step.

## The setup that actually earns its keep

The version that pays off isn't the copy-pasted `devcontainer.json` from a GitHub template. It's the one where you've deliberately separated "what the base image needs" from "what this repo needs":

```json
{
  "name": "billing-service",
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/aws-cli:1": {}
  },
  "postCreateCommand": "npm ci && npm run db:migrate",
  "postStartCommand": "npm run dev:healthcheck",
  "mounts": [
    "source=billing-service-node-modules,target=${containerWorkspaceFolder}/node_modules,type=volume"
  ],
  "remoteEnv": {
    "NODE_ENV": "development"
  }
}
```

Two lines in there are doing more work than they look like. `postCreateCommand` runs once, at container creation — that's your "set up the world" step. `postStartCommand` runs every single time the container starts, including after a rebuild-free restart — that's your "is the world still sane" step. Teams that dump everything into `postCreateCommand` end up with containers that build fine on day one and then silently drift out of sync with a schema migration nobody re-ran, because nothing forces a re-check on the next `code .`

The `mounts` entry is the other one people skip, and it's the one that actually determines whether your team likes this thing or quietly avoids it.

## The bind-mount tax nobody warns you about

If you don't name a volume for `node_modules` and instead let it live inside a bind-mounted workspace folder, everything still works — it's just slow, specifically on macOS and Windows, where filesystem I/O across the VM boundary is the bottleneck, not CPU. I watched a teammate at Cubet time a `npm install` at 4 minutes inside a naive bind-mounted devcontainer versus 40 seconds with the workspace folder cached and `node_modules` pulled onto a named Docker volume instead. Same lockfile, same network, same machine. The only difference was where the files physically lived relative to the VM boundary.

The fix is the `mounts` block above: give `node_modules` (or `vendor/`, or `.venv`, whatever your ecosystem's dependency folder is) its own named volume instead of letting it ride along inside the bind mount. It sounds like a micro-optimization until you multiply "4 minutes lost" by every engineer, every cold rebuild, every week.

## Where it quietly breaks

**Secrets.** The temptation is to bake an `.env` file into the image or commit example values into `devcontainer.json` "just for local dev." Don't. Use `remoteEnv` for non-sensitive defaults and pull real secrets at `postCreateCommand` time from whatever your team already uses — Vault, 1Password CLI, SSM. A devcontainer that requires a real API key baked into a Dockerfile is a devcontainer that eventually leaks a real API key into a public fork.

**Feature sprawl.** The `features` ecosystem is genuinely great for "I need `aws-cli` and don't want to write install steps," but every feature you add is another layer to rebuild and another thing that can silently update out from under you if you pin loosely. Pin versions the same way you'd pin a base image tag — `node:1` with no version constraint inside it is a future Tuesday-morning surprise waiting to happen.

**"Works in Codespaces, breaks locally" (or vice versa).** Codespaces and local Dev Containers use the same spec but not identical resource defaults — RAM and CPU limits differ, and a `postCreateCommand` that assumes 8 cores will time out quietly in a smaller Codespace machine type. If your team uses both, test the container in the smaller of the two environments, not the beefier one someone happened to be on when they wrote the config.

## The actual payoff

None of this is exciting work — it's fiddly YAML-adjacent config tuning, and it doesn't show up on a roadmap slide. But the number that made it worth doing on my team wasn't a benchmark, it was a support-ticket count: "local setup broken" tickets went from a weekly occurrence to something that happens maybe once a quarter, and when it does, the fix is a one-line change to a file every engineer already knows to look at, instead of a scavenger hunt through Slack history.

If your onboarding doc still has a step that says "ask Dave," that's not a documentation problem you can write your way out of — it's an environment your tooling should be building for you instead. Start smaller than you think: pick the one dependency install step your team complains about most, move it into a `postCreateCommand`, and see how many Slack messages it quietly prevents next month.
