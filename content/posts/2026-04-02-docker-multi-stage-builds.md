---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Build Tools to Production"
date: 2026-04-02
excerpt: "Your Docker image is 2GB and you're shipping a Node.js app. Something has gone terribly wrong. Multi-stage builds are the cure — let's shrink that beast down to something you'd actually want to run in production."
tags: ["docker", "devops", "containers", "best-practices", "ci-cd"]
featured: true
---

Let me paint you a picture. You've got a shiny new Node.js app. You write a Dockerfile, run `docker build`, push it to your registry, and then deploy it. Your ops team messages you: "Why is this image **1.8GB**?"

You've just shipped your `node_modules`, your TypeScript compiler, your test runner, your linter configs, and probably the ghost of every `npm install` you've ever run — all living rent-free in your production container.

Enter **multi-stage builds**: the Docker feature that lets you build with everything and ship with nothing you don't need.

---

## The Problem: Your Build Environment ≠ Your Runtime Environment

When you compile code, you need compilers. When you run code, you don't. This is not a revolutionary concept, and yet Dockerfiles around the world continue to include `gcc`, `typescript`, `webpack`, and a small country's worth of dev dependencies in production images.

Single-stage builds look like this nightmare:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install          # includes devDependencies!
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

This ships everything: TypeScript, ts-node, nodemon, jest, eslint — all of it. Your container runtime will never use any of that. It just adds attack surface, image bloat, and the mild shame of knowing you could have done better.

---

## Multi-Stage Builds: Build Heavy, Ship Light

Here's the same app done right:

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci                     # includes devDependencies for building
COPY . .
RUN npm run build              # compile TypeScript → dist/

# ---- Stage 2: Production ----
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev          # only production dependencies

# Copy ONLY the compiled output from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The magic line is `COPY --from=builder`. You're reaching back into the builder stage and grabbing only the artifacts you actually need. The TypeScript compiler? Gone. The 300MB of `devDependencies`? Never heard of them.

**Before:** ~1.8GB image  
**After:** ~180MB image

That's a 90% reduction. Your ops team will bake you a cake.

---

## Real-World Pattern: Go Binary Builds

Multi-stage builds shine brightest with compiled languages. Here's a Go service going from "needs the entire Go toolchain" to "needs literally nothing":

```dockerfile
# Stage 1: Compile
FROM golang:1.22-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Stage 2: Scratch (yes, an empty image)
FROM scratch
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`FROM scratch` is a zero-byte base image. No shell, no package manager, no OS utilities — just your binary. The final image is whatever your compiled binary weighs, often under 20MB. It also has an essentially non-existent attack surface because there's nothing *to* attack.

The tradeoff: debugging is painful when things go wrong (no shell to exec into). For critical production services where security matters more than debuggability, scratch images are excellent. For day-to-day workloads, `alpine` or `distroless` hit a nice middle ground.

---

## Lessons Learned the Hard Way

**1. `npm ci` over `npm install` in Dockerfiles**  
`npm ci` is deterministic, uses the lockfile, and fails loudly if the lockfile is out of sync. `npm install` in CI/CD is a gamble you don't need to take.

**2. Order your COPY instructions carefully**  
Docker caches layers. If you copy your source code before installing dependencies, *every source change* invalidates the dependency cache and you're running `npm install` from scratch every build. Always copy `package.json` first, install, then copy source.

**3. Don't `COPY . .` into production stages**  
Only copy what you need. A stray `.env` file or `secrets.txt` (yes, these exist in repos) doesn't belong in your image. Be explicit: `COPY --from=builder /app/dist ./dist`.

**4. Tag your stages**  
The `AS builder` naming isn't just cosmetic — you can target a specific stage with `docker build --target builder .` to run tests in CI without building the production stage. One Dockerfile, multiple purposes.

---

## CI/CD Integration

In GitHub Actions, you can cache Docker layers between builds to make this even faster:

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

The `type=gha` cache stores intermediate layers in GitHub Actions cache. Your builder stage (the slow part with all the installs) gets cached between runs. Only changed layers rebuild. Build times drop from 5 minutes to under a minute on a warm cache.

---

## The Takeaway

Multi-stage builds aren't an advanced Docker technique — they're table stakes for any production image. The principles are simple:

- **Build stage**: use whatever you need, install freely, compile everything
- **Production stage**: copy artifacts only, install only runtime deps, keep it lean

Your final image should contain exactly what needs to run. Nothing more.

Next time you're writing a Dockerfile, ask yourself: *does this need to be here at runtime?* If the answer is no, keep it in a build stage. Your image sizes, your deployment speeds, and your security posture will all thank you.

---

**Now go audit your existing Dockerfiles.** Run `docker image ls` and sort by size — I promise you'll find something that makes you wince. The fix is usually three lines of Dockerfile surgery away.

Have a multi-stage build pattern that saved your team real pain? Drop it in the comments — the best Docker configs are the ones learned from someone else's production incident.
