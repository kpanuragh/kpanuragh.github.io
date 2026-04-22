---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Toolbox to Production"
date: 2026-04-22
excerpt: "You wouldn't pack your entire garage into your suitcase for a weekend trip. So why are you shipping compilers, dev dependencies, and build tools to production? Let's fix that with Docker multi-stage builds."
tags: ["Docker", "DevOps", "Containers", "Best Practices"]
featured: true
---

# 🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Toolbox to Production

Picture this: you've just deployed your slick Node.js app to production. The container image is a cool **1.2 GB**. Inside that image, buried like archaeological artifacts, are: the full Node.js build toolchain, TypeScript compiler, ESLint, your test runner, and about 400 MB of `devDependencies` that will never, ever run in production.

You're basically packing your entire workshop — band saw, welding torch, the works — into a suitcase for a weekend trip.

Docker multi-stage builds are the intervention you didn't know you needed.

## What's the Problem, Really?

Let's look at what most people write when they're in a hurry:

```dockerfile
# The "I just want it to work" Dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install          # installs ALL deps, dev included

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

This works. It ships. Your manager is happy. But your production container is hauling around TypeScript, ts-node, nodemon, and everything else your laptop uses during development. The blast radius if something goes wrong is enormous, and your attack surface is unnecessarily wide.

Check the image size:

```bash
$ docker images my-app
REPOSITORY   TAG       IMAGE ID       SIZE
my-app       latest    a1b2c3d4e5f6   1.18GB
```

That's not a container. That's a cry for help.

## Enter Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each `FROM` starts a fresh layer, and you can selectively **copy artifacts** from one stage into another. The final image only contains what you explicitly include — no build tools, no dev dependencies, no tears.

Here's the same app, done right:

```dockerfile
# Stage 1: The Builder (does the heavy lifting)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build


# Stage 2: The Runner (lean, mean, production machine)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy ONLY the compiled output from the builder
COPY --from=builder /app/dist ./dist

# Don't run as root — future you will thank present you
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Now check the image size:

```bash
$ docker images my-app
REPOSITORY   TAG       IMAGE ID       SIZE
my-app       latest    f6e5d4c3b2a1   142MB
```

**142 MB vs 1.18 GB.** That's an 88% reduction. Your DevOps lead just got a little misty-eyed.

## Why This Actually Matters in the Real World

**Faster deployments.** Smaller images pull faster from your registry. When you're auto-scaling under load and a new pod needs to spin up in 10 seconds, a 1 GB image is a serious liability. A 140 MB image is not.

**Reduced attack surface.** Every package in your image is a potential vulnerability. A TypeScript compiler sitting idle in production isn't doing anything useful — but it *is* something for a CVE scanner to flag at 2 AM. Fewer packages = fewer CVEs = fewer midnight pages.

**Cleaner separation of concerns.** Your build environment and runtime environment are now officially separate entities. You can update one without touching the other. When Node.js 22 drops, you can test your build on it without touching your carefully-tuned production runtime.

## The Lesson Learned the Hard Way

I once inherited a Go service where the production image included the full Go toolchain. The image was 800 MB. The actual compiled binary? 12 MB. The remaining 788 MB was compiler, source code, intermediate object files — all just... sitting there.

When we rewrote the Dockerfile with multi-stage builds:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

FROM scratch AS runner
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

We went from 800 MB to **12 MB**. `FROM scratch` — an empty base image — gives you *only* what you copy in. For a statically compiled Go binary, that's all you need. The team lead printed that `docker images` output and taped it to the wall.

## Tips to Get the Most Out of This

1. **Name your stages** with `AS <name>` — it makes `COPY --from=` readable and lets you target specific stages during development: `docker build --target builder .` to debug build issues without running the full pipeline.

2. **Use Alpine or distroless base images** in your final stage. Alpine brings a full shell and package manager in ~5 MB. Google's distroless images go even further if you don't need a shell at all.

3. **Pin your base image versions.** `FROM node:20-alpine` today might be a different image in six months. `FROM node:20.12.2-alpine3.19` is the same image forever. Reproducibility is a feature.

4. **Leverage layer caching aggressively.** Copy your dependency manifests (`package.json`, `go.mod`, `requirements.txt`) and install dependencies *before* copying source code. This way, Docker reuses the dependency layer on every build unless your dependencies actually change.

## Your Turn

If you have a Dockerfile in your project right now, do this: run `docker build -t myapp:before .` and check the size. Then spend 20 minutes refactoring it into a multi-stage build. Run `docker build -t myapp:after .` and compare.

I'd bet serious money the "after" number will make you smile — and probably make your team's CI/CD pipeline measurably faster in the same stroke.

Multi-stage builds are one of those rare improvements where you pay 20 minutes of effort and get back smaller images, faster deploys, better security posture, and bragging rights. It's the DevOps equivalent of finding a $20 bill in an old jacket.

Go clean up those Dockerfiles. Your future self (and your production cluster) will thank you.

---

*Got a before/after story of your own? Containerized a 2 GB image down to something sane? Drop it in the comments — I want to celebrate your wins.*
