---
title: "🫙 Distroless Images: Actually Using Them (Without Losing Your Mind)"
date: "2026-05-18"
excerpt: "Distroless containers promise a smaller attack surface and leaner images — but most teams bounce off them the first time because debugging feels impossible. Here's how we actually ship distroless at Cubet without crying into our kubectl logs."
tags:
  - containers
  - docker
  - devops
  - security
  - platform-engineering
featured: true
---

Everyone knows distroless images are the *right* thing to do. They show up in every security talk, every hardening guide, every "10 tips for production containers" listicle. And then you try one in a real project, hit a wall at the first `kubectl exec` session, and quietly switch back to `node:20-alpine` while pretending you were planning to do that all along.

I've been there. The whole team at Cubet has been there. But we stuck with it, and now distroless is our default for production services. Here's the honest version of how to actually use them.

## What Even Is a Distroless Image?

Google's [distroless project](https://github.com/GoogleContainerTools/distroless) strips the container image down to *just the runtime* — no shell, no package manager, no coreutils, no `bash`, no `sh`, no `ls`, no `cat`. You get the language runtime and your app, nothing else.

The pitch is compelling:

- **Smaller image size** (a distroless Node.js image is ~150MB vs ~350MB for the full `node:20` Debian variant)
- **Massively reduced CVE surface** — if `apt`, `bash`, and `curl` aren't in the image, an attacker who breaks in can't do much with them
- **Immutable by design** — you literally cannot `apt install backdoor` because apt doesn't exist

The catch: no shell means debugging feels like working blindfolded.

## The Right Pattern: Multi-Stage Builds Are Non-Negotiable

You cannot build your app *in* a distroless image — there's no toolchain. The correct pattern is always a multi-stage build: build in a fat image, copy artifacts into a distroless final stage.

Here's a real-world Node.js example we use at Cubet for our API services:

```dockerfile
# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
# If you have a TypeScript compile step:
RUN npm run build


# Stage 2: Run (distroless)
FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app

# Copy only what the app needs to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Distroless Node images default to non-root (uid 1000)
# No USER instruction needed — it's already set

CMD ["dist/server.js"]
```

A few things worth noting here:

- Use `gcr.io/distroless/nodejs20-debian12`, not the bare `distroless/static`. The static image has *nothing* — not even glibc — and will segfault your Node binary immediately.
- The `CMD` takes the **path to the JS file**, not `node dist/server.js` as an array. The entrypoint for the Node distroless image is the `node` binary itself.
- You're already running as a non-root user. Distroless images set `USER nonroot` (uid 65532) by default. Most Alpine-based Dockerfiles forget this entirely.

## The Debugging Problem (And The Solution)

Here's where every team hits a wall. You deploy, something's wrong, you reach for `kubectl exec -it pod-name -- /bin/bash` and get:

```
OCI runtime exec failed: exec failed: unable to start container process:
exec: "/bin/bash": stat /bin/bash: no such file or directory
```

No bash. No sh. No nothing. It feels like someone took away your safety net.

The answer is the **debug variant**. Every distroless image ships a `:debug` tag that adds BusyBox — a tiny shell and a handful of Unix utilities — without inflating the production image:

```bash
# In production: gcr.io/distroless/nodejs20-debian12
# For debugging locally or in a staging incident:
docker run --rm -it --entrypoint /busybox/sh \
  gcr.io/distroless/nodejs20-debian12:debug
```

In Kubernetes, swap the image to the `:debug` variant in a one-off pod spec, exec in, poke around, then delete it. Never, ever push `:debug` to production — it defeats the whole point. We have a runbook entry at Cubet: "debug tag = incident tool, not a permanent fix."

For production observability, lean harder on structured logging and your APM tool. If you need to inspect the filesystem, `kubectl cp` can pull files out without a shell.

## The Java / Go / Static Binary Story

Distroless really shines for Go. Since Go compiles to a statically linked binary (with `CGO_ENABLED=0`), you can use `gcr.io/distroless/static-debian12` — the absolute minimal image with no runtime at all:

```dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM gcr.io/distroless/static-debian12

COPY --from=builder /app/server /server

CMD ["/server"]
```

The resulting image is often under 10MB. We shipped a gRPC service at Cubet with this pattern and the image went from 480MB (the old `golang:1.22` final stage) to 8MB. The security scan went from 47 CVEs to zero. That's not a typo.

For Java, use `gcr.io/distroless/java21-debian12`. For Python, `gcr.io/distroless/python3-debian12` — though Python distroless is more painful because of native dependencies; expect some trial and error.

## Things That Will Bite You

**Timezone data.** The static image has no `tzdata`. If your app does any timezone conversion, use `gcr.io/distroless/base-debian12` instead — it includes glibc, libssl, and tzdata.

**CA certificates.** Same deal for HTTPS. The `base` and `nodejs` variants include them; `static` does not. If you're hitting an HTTPS endpoint and getting cert errors, this is why.

**`/tmp` is read-only.** Some libraries write temp files to `/tmp`. Distroless images don't always have a writable `/tmp`. Mount a `tmpfs` volume in your Pod spec if you need one.

**Environment variables only.** No `.env` file loading, no reading secrets from the filesystem unless you explicitly mount them. This is actually a good forcing function — it pushes you toward proper secrets management.

## Is It Worth It?

Yes, but only if you commit to the workflow changes. The image size win is nice; the security posture improvement is real; the "zero unnecessary tools for an attacker to use" property is genuinely valuable.

The hidden benefit: it forces you to think about what your application actually needs at runtime. Every time we've adopted distroless for a service at Cubet, we've discovered we were shipping dev dependencies, test fixtures, or build artifacts into production without realising it. The strictness is a feature.

Start with your Go or static binary services — the path is nearly friction-free. Then tackle Node.js. Leave Python for last; it's the hardest.

The goal isn't a perfect distroless-everywhere policy on day one. It's shipping one service, learning the failure modes, building team muscle memory, then expanding from there. Boring incremental progress beats a grand migration that stalls after the first `exec` failure.

---

**Try it this week:** Pick one low-risk service, convert it to distroless, run the image through Trivy or Grype, and compare the CVE count before and after. The diff will be convincing enough to sell it to the rest of your team.

Questions? Ran into a weird distroless edge case? Hit me up — always happy to compare war stories.
