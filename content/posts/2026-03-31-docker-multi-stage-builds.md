---
title: "🐳 Docker Multi-Stage Builds: Your Images Are Embarrassingly Chonky"
date: 2026-03-31
excerpt: "Shipping a 2GB Docker image to production because it has the full Node.js dev toolchain, test runners, and your lunch order from 2019 is not a personality. Multi-stage builds are here to save you from yourself."
tags: ["docker", "devops", "containers", "optimization", "ci-cd"]
featured: true
---

Let me paint you a picture. It's 3 AM. Your CI pipeline just finished. You proudly ship your brand-new microservice to production. One tiny service. One job. And it weighs **2.1 gigabytes**.

Somewhere, a Kubernetes cluster is crying.

If you've ever wondered why your container pulls take forever, why your registry bill looks like a car payment, or why your ops team keeps giving you *the look* — multi-stage Docker builds are the intervention you didn't know you needed.

## What Even Is a Multi-Stage Build?

The concept is beautifully simple: use multiple `FROM` statements in a single `Dockerfile`. Each stage can be a different base image. The magic trick? **You only keep what you need in the final image.**

Think of it like packing for a camping trip. You use a massive workshop to prep your gear — you need all the tools. But you don't *carry the workshop with you*. You just take what you packed.

Your current Dockerfile is carrying the workshop.

## The Before: A Crime Against Disk Space

Here's a classic Node.js Dockerfile that makes platform engineers age rapidly:

```dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This ships with:
- The full Node.js runtime + npm
- All `devDependencies` (TypeScript compiler, ESLint, Jest, the works)
- Source files that were compiled away
- Build artifacts no one asked for
- Approximately 900MB of your regrets

## The After: Sleek, Mean, Production Machine

```dockerfile
# Stage 1: The Builder — does the heavy lifting
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Stage 2: The Runner — lean and clean
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only copy what matters
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Same app. Final image? **~150MB**. That's a 93% diet. Your registry just exhaled.

The `--from=builder` flag is the star here — it plucks the compiled output from the build stage and drops it into your production stage. The build tools, source files, and dev dependencies never make it through the door.

## Real-World Wins (and One Embarrassing War Story)

We had a Go service at a previous gig that was being shipped in a `golang:1.21` base image. The Go compiler, standard library, all tooling — baked right in. The image was **1.3GB**.

Go compiles to a single static binary. You don't need *any* of that at runtime.

After a multi-stage build with a `scratch` base image (literally empty, no OS):

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# The final stage is an empty image
FROM scratch

COPY --from=builder /app/server /server

EXPOSE 8080
ENTRYPOINT ["/server"]
```

Final image size: **12MB**.

Twelve. Megabytes.

The PR got merged so fast it left skid marks. The ops team sent a fruit basket. (Okay, they sent a Slack emoji, but still.)

## Tips From the Trenches

**1. Use `alpine` variants as your runner base.** Unless you need glibc-specific binaries, Alpine Linux gives you a minimal OS (~5MB) with just enough to run most apps. `node:20-alpine` vs `node:20` is a 200MB difference out of the box.

**2. Order your COPY and RUN statements to maximize layer cache.** Always copy dependency manifests (`package.json`, `go.mod`, `requirements.txt`) first, install dependencies, *then* copy source code. This way, if only your source changes, Docker reuses the cached dependency layer. A build that was taking 4 minutes can drop to 30 seconds.

**3. Name your stages.** `AS builder`, `AS tester`, `AS runner` — descriptive names make your Dockerfile readable and let you target specific stages in CI:

```bash
# Only run up to the test stage in CI to catch failures fast
docker build --target tester -t myapp:test .
```

**4. Don't copy secrets into any stage.** Seriously. Even if you delete a file in a later layer, it still exists in the image history. Use build secrets (`--secret`) for sensitive values, or better yet, inject them at runtime via environment variables or a secrets manager.

## The CI/CD Angle

Multi-stage builds play incredibly well with GitHub Actions and other CI systems. You can build the `builder` stage, run your tests against it, and only push the final `runner` stage if everything passes — all in one Dockerfile, no extra orchestration needed.

Your pipeline gets cleaner. Your images get smaller. Your deploys get faster. Everything wins.

## The Bottom Line

Multi-stage builds are one of those rare things in software where there's almost no downside. You get:

- Dramatically smaller images (faster pulls, cheaper storage)
- Better security posture (fewer tools = smaller attack surface)
- Cleaner separation of build-time vs runtime concerns
- A pipeline that feels professional instead of "we'll fix it later"

The next time you `docker build`, ask yourself: *does production really need my TypeScript compiler?* The answer is no. Production needs one thing: your compiled app, doing its job quietly and efficiently.

Give your images a diet. Your cluster will thank you.

---

**Got a before/after image size story?** Drop it in the comments — I love a good "we went from 4GB to 80MB" tale. And if you're still shipping dev dependencies to prod, no judgment. We've all been there. Now go fix it. 🐳
