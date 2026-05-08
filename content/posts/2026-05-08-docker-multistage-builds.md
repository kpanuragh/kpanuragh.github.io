---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Dev Environment to Production"
date: 2026-05-08
excerpt: "Your Docker image is 2.4 GB. Production is crying. Your SRE is crying. The cloud bill is crying. Let's fix that with multi-stage builds — the single best Docker trick most developers skip."
tags: ["docker", "devops", "containers", "best-practices", "ci-cd"]
featured: true
---

Picture this: You've just containerized your Node.js app. You run `docker build`, grab a coffee, come back, and see it. The image size. **2.4 gigabytes.** For a REST API that serves JSON. Your SRE sends you a meme of a dumpster fire. Your cloud bill arrives. You briefly consider a career in beekeeping.

This is the story of how Docker multi-stage builds save you from yourself — and why they should be your default, not an afterthought.

## What Even Is a Multi-Stage Build?

Before multi-stage builds existed, developers had two bad options:

1. **Ship everything** — compiler, test dependencies, `node_modules` for your `node_modules`, the ghost of packages past. Fast to write, catastrophic to deploy.
2. **Write shell script gymnastics** — a Dockerfile that installs tools, builds the artifact, then desperately tries to clean up after itself in the same layer. This never works as well as you hope.

Multi-stage builds let you use **multiple `FROM` statements** in a single Dockerfile. Each `FROM` starts a fresh image, but you can selectively copy artifacts from previous stages. The final image only contains what you explicitly put in it. Everything else disappears like your motivation on a Monday morning.

## A Tale of Two Dockerfiles

Here's a typical Node.js app Dockerfile *before* multi-stage thinking:

```dockerfile
# The "ship everything and pray" approach
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install          # includes devDependencies!
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This image includes TypeScript, ts-node, Jest, your entire `node_modules` (including things you installed for one test two years ago), and probably some dotfiles you forgot about. The final image is **800MB+** for something that's going to serve JSON.

Now here's the multi-stage version:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runtime

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev      # production deps only
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The `--from=builder` line is the magic. We're telling Docker: "grab the compiled output from the `builder` stage, but don't bring along the compiler." The result? **~150MB**. An 80% reduction. Your SRE sends you a thumbs up. The cloud bill is a little less terrifying.

## Real-World Lessons (Learned the Hard Way)

### 1. Always Pin Your Base Images

`FROM node:20-alpine` is fine. `FROM node:alpine` will eventually betray you when Alpine bumps Node from 20 to 22 during a routine CI run and your build breaks in a way that takes two hours to debug. Pin versions. Your future self will write you a thank-you note.

### 2. Layer Order Is Cache Order

Docker caches layers. If you `COPY . .` before `RUN npm install`, every single code change invalidates the dependency cache and reinstalls everything. Always copy `package.json` first, install, *then* copy your source. This one change alone can cut CI times by several minutes.

### 3. The Alpine Trap

Alpine-based images are tiny and great — until you need a library that requires glibc (which Alpine doesn't have). You'll spend an afternoon debugging a cryptic error before realizing your native dependency doesn't speak musl. When in doubt, use `node:20-slim` (Debian-based, minimal, but compatible) instead of Alpine for apps with native dependencies.

### 4. Build Args for Flexibility

```dockerfile
FROM node:20-alpine AS builder
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
```

Pass `--build-arg NODE_ENV=staging` in your CI pipeline for environment-specific builds without maintaining multiple Dockerfiles. One Dockerfile to rule them all.

## Bonus: The Go Pattern (Almost Too Good)

If you work with Go, multi-stage builds are almost unfair. Go compiles to a single static binary, which means your production image can be `FROM scratch` — literally nothing:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM scratch
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

Final image size: **~10MB**. No OS. No shell. No attack surface. Just your binary. Security teams weep tears of joy.

## Does This Actually Matter in CI/CD?

Absolutely. Smaller images mean:

- **Faster pulls** in your CD pipeline — going from 800MB to 150MB shaves real seconds off every deployment
- **Smaller attack surface** — you can't exploit `gcc` if `gcc` isn't in the image
- **Lower registry storage costs** — multiplied across dozens of services and hundreds of tags, it adds up
- **Faster autoscaling** — when a Kubernetes pod needs to spin up quickly under load, image pull time is often the bottleneck

One team I know reduced their average deployment time from 4 minutes to 90 seconds just by adopting multi-stage builds across their microservices. That's not a small thing when you're deploying 15 times a day.

## The Takeaway

Multi-stage builds aren't an advanced Docker technique you get to graduate into someday. They're the sane default. If your Dockerfile doesn't have at least two `FROM` statements for anything going to production, it's worth a five-minute refactor.

The rule is simple: **build with everything you need, ship only what you use.**

Your containers will be leaner, your deploys faster, your cloud bill slightly less horrifying, and your SRE will maybe — *maybe* — stop sending you memes.

---

**Your turn:** Look at your biggest Docker image. What's actually in it? Run `docker image inspect <image>` and `dive <image>` (a fantastic layer explorer) to see exactly where the bytes are hiding. I'd bet there's a multi-stage opportunity waiting for you.

Drop your before/after sizes in the comments — I love a good weight-loss story.
