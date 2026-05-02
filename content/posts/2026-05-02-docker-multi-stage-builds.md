---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Compiler to Production"
date: 2026-05-02
excerpt: "Your Docker images are carrying around build tools, dev dependencies, and half a Node.js ecosystem that your app never needs at runtime. Multi-stage builds are the diet your containers deserve."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

# 🐳 Docker Multi-Stage Builds: Stop Shipping Your Compiler to Production

Let me paint you a picture. You've got a sleek Go microservice — maybe 5,000 lines of code, doing exactly one job, doing it well. You containerize it, push it, and your Docker image comes out at **1.2 GB**. You could fit the entire Lord of the Rings trilogy in that image, with room to spare.

The culprit? You're shipping your build environment along with your application. The compiler, the build cache, the test fixtures, `node_modules` with its infamous 87,000 files — all of it riding shotgun to production. Multi-stage builds are here to end this nonsense.

## What Are Multi-Stage Builds, Actually?

Introduced in Docker 17.05, multi-stage builds let you use **multiple `FROM` statements** in a single Dockerfile. Each `FROM` starts a fresh image layer, and you can selectively copy artifacts between stages. The final image only contains what you explicitly copy into the last stage — all the intermediate chaos stays behind.

Think of it like baking bread. You need flour, yeast, a mixing bowl, a stand mixer, and an oven. But when you hand someone the loaf, you don't also hand them the kitchen. Multi-stage builds are that distinction.

## The Before: A Dockerfile That Ships the Kitchen

Here's a typical "just make it work" Node.js Dockerfile:

```dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

This pulls in the full `node:20` image (~1.1 GB), installs every dependency including `devDependencies`, runs the build, and then calls it a day. Your final image contains TypeScript, Jest, ESLint, and a hundred other packages your app will never touch at runtime. It also means every `npm install` cache miss in CI takes 3 minutes.

Let's fix it.

## The After: Multi-Stage Done Right

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
```

Same application. The image goes from **~1.1 GB down to ~180 MB**. That's not a rounding error — that's an 84% reduction. Your Kubernetes nodes will thank you, your pull times in CI will improve, and your security surface area just shrank dramatically because you're no longer shipping a TypeScript compiler to prod.

A few things worth calling out in that Dockerfile:

- **`npm ci` instead of `npm install`** — respects the lockfile exactly, no surprises in CI
- **`--omit=dev`** in the production stage — only runtime dependencies make the cut
- **`USER node`** — never run your container as root if you can avoid it; the official Node images include a non-root `node` user for exactly this reason

## Real-World Win: Go Binaries Are Tiny, But the Builder Isn't

This pattern shines even brighter with compiled languages. A Go service is a single statically-linked binary — you can copy it into a `scratch` or `distroless` base image with almost nothing else:

```dockerfile
FROM golang:1.22 AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM gcr.io/distroless/static-debian12 AS production

COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

The `golang:1.22` builder image is ~800 MB. The `distroless/static` image is about **2 MB**. Your final image? Around 10-15 MB including your binary. That's legitimately smaller than most profile pictures.

`distroless` images contain no shell, no package manager, no nothing — just your binary and its dependencies. This is a huge security win: there's no shell for an attacker to drop into even if they somehow get code execution.

## Lessons Learned the Hard Way

**Cache your dependency layer.** Always `COPY package*.json ./` and `RUN npm install` *before* `COPY . .`. Docker caches layers — if your source changes but your dependencies didn't, it'll reuse the cached install layer and your builds will be fast. Reverse that order and every source change triggers a full reinstall.

**Name your stages.** `FROM node:20 AS builder` beats `FROM node:20` stage 0, 1, 2. Names make the intent readable and let you target specific stages with `docker build --target builder` for debugging.

**Don't ignore `.dockerignore`.** If you don't have a `.dockerignore` file, you're probably `COPY . .`-ing your `node_modules`, `.git` directory, and local `.env` files into the build context. Add a `.dockerignore` with at minimum: `node_modules`, `.git`, `.env*`, and `*.log`.

**Test your multi-stage builds locally before CI.** Subtle issues — like forgetting to copy a static asset directory, or a runtime dependency that was masking a missing env var — tend to surface only after you've pushed and watched the deploy fail. Run `docker build` and `docker run` locally first.

## The Payoff Is Real

Multi-stage builds aren't a micro-optimization. They affect:

- **Deployment speed** — smaller images pull faster, which means faster rollouts and quicker pod startup in Kubernetes
- **Security** — less software in the image means fewer CVEs, and tools like Trivy or Snyk have less to complain about
- **Cost** — image storage in ECR/GCR/Docker Hub isn't free, and bandwidth for large images adds up at scale
- **Developer experience** — CI pipelines that took 8 minutes start finishing in 3

The barrier to entry is low. If you've written a Dockerfile before, you already know everything you need to get started. Add a `FROM ... AS builder`, copy your artifacts with `COPY --from=builder`, and ship a leaner image.

---

**What's your biggest Docker image size win?** Drop it in the comments — I've seen teams go from 4 GB to 80 MB and I never get tired of hearing those numbers. If you're still running monolithic Dockerfiles in production, today's a great day to split them up. Your ops team will notice the difference before you even announce the change.
