---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Toolbox to Production"
date: 2026-04-26
excerpt: "Your Docker image doesn't need a compiler, 47 dev dependencies, and the ghost of npm install past. Let's talk multi-stage builds and how they'll shrink your containers from \"moving truck\" to \"carry-on luggage\"."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Picture this: you finally containerize your Node.js app. You run `docker build`, wait three minutes, and proudly check the image size. **1.4 GB.** For a REST API that handles form submissions. Your production server is now hauling `node_modules`, TypeScript source files, the entire npm cache, and somehow a copy of `vim` you don't remember installing.

This is the origin story of every developer who eventually discovers **Docker multi-stage builds** — and immediately goes back to refactor every Dockerfile they've ever written.

---

## What Even Are Multi-Stage Builds?

Before multi-stage builds existed (Docker 17.05+), you had two options:

1. Build everything in one fat container and ship it all to prod.
2. Maintain *two* Dockerfiles — one for building, one for running — and a bash script that duct-taped them together like some kind of infrastructure horror movie.

Multi-stage builds let you define multiple `FROM` stages in a single Dockerfile. You build in one stage, copy only the artifacts you need into a lean final stage, and leave all the build-time mess behind. The compiler doesn't go to production. The dev tools don't go to production. The guilt stays, but at least the image is small.

---

## A Real-World Example: Node.js API

Here's a typical Node.js Dockerfile *before* multi-stage — the one that ends up 1.4 GB:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

Nothing wrong with it logically — it works. But you're shipping `node_modules` (including every dev dependency), TypeScript, ts-node, eslint, and your local `.env.example` into production. That's not lean, that's a buffet.

Now, the multi-stage version:

```dockerfile
# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

The `--from=builder` line is the magic. It pulls *only* the compiled `dist/` folder from the build stage and drops it into the clean runtime image. Your compiler, your TypeScript source, your 300MB of dev dependencies? Gone. Left behind in the ephemeral build stage like a hotel coffee machine you never touched.

**Result:** 1.4 GB → ~180 MB. Same app. No functionality lost.

---

## Go Even Leaner: Scratch and Distroless

If you're writing Go, Rust, or any language that compiles to a static binary, you can go even more extreme:

```dockerfile
# --- Stage 1: Build ---
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# --- Stage 2: Absolute minimal ---
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`distroless/static` is a Google-maintained image with *nothing* in it except libc and SSL certs. No shell. No package manager. No attack surface. Security teams love it because there's nothing to exploit. Attackers hate it for the same reason. It's a 2 MB base image running a statically compiled binary. Your entire production container can come in under 20 MB.

Yes, debugging is harder when there's no shell. That's a trade-off worth knowing upfront. For ephemeral prod containers where you log everything anyway, it's often the right call.

---

## Lessons Learned the Hard Way

**Cache your dependency layers aggressively.** Copy `package.json` and `go.mod` *before* copying source code. Docker caches layer-by-layer — if your dependencies haven't changed, it'll skip the `npm install` step entirely. The order of `COPY` statements is not cosmetic; it's performance.

**Name your stages.** `FROM node:20 AS builder` is infinitely clearer than `FROM node:20` when you have three stages. Future-you at 11pm on a Friday will thank present-you.

**Use `npm ci` instead of `npm install` in CI/Docker.** It's faster, it's deterministic, and it fails loudly if `package-lock.json` is out of sync. `npm install` silently updates the lockfile. In a Dockerfile, that's a footgun.

**Don't forget `.dockerignore`.** Even with multi-stage builds, you're still sending your build context to the Docker daemon on every build. A `.dockerignore` with `node_modules`, `.git`, `*.log`, and local env files prevents you from accidentally uploading gigabytes of garbage and bloating the build context. It's the `.gitignore` of Docker, and it's just as important.

---

## Why This Matters in CI/CD

In a GitHub Actions or Jenkins pipeline, smaller images mean:

- **Faster push/pull times** — your 180 MB image deploys in seconds instead of a minute
- **Lower storage costs** — registry bills add up when every PR creates a tagged image
- **Faster pod startup in Kubernetes** — nodes pull images before starting containers; smaller = faster cold starts
- **Smaller security blast radius** — fewer packages means fewer CVEs to patch

Multi-stage builds are one of those changes that cost you 15 minutes to implement and pay dividends every single deploy for the lifetime of the service. It's the rare DevOps win that's both a performance improvement *and* a security improvement.

---

## Go Refactor That Dockerfile

Seriously. Open the Dockerfile for whatever project you're working on right now. If it's a single-stage build, you have an action item.

The pattern is always the same:

1. Heavy base image with all your build tools → do your build
2. Slim runtime image → `COPY --from=builder` only what runs
3. Ship that

Your production environment doesn't need your compiler. It doesn't need your linter. It definitely doesn't need the existential dread of `npm audit` running in a prod container.

Give your containers a diet. They'll perform better, cost less, and sleep easier — and so will you.

---

*What's the most bloated Docker image you've ever accidentally shipped? I want to hear the horror stories. Drop a comment below or find me on GitHub — misery loves company, and so does DevOps.*
