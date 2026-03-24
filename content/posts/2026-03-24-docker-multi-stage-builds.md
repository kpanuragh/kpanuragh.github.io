---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Make a Sandwich"
date: 2026-03-24
excerpt: "Your Docker images are too fat. Like, embarrassingly fat. We're talking 1.2GB images to serve a 'Hello World' endpoint fat. Multi-stage builds are the diet plan your containers desperately need."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Let me paint you a picture. It's 3 AM. Your deployment is crawling. The CI pipeline that used to take 4 minutes now takes 22. Your Slack is lighting up like a Christmas tree. You `docker images` and see this:

```
my-app    latest    a3f9b2c1d4e5    2 hours ago    1.47GB
```

One. Point. Four. Seven. Gigabytes. For a Node.js API.

I've been there. We've all been there. And the fix is embarrassingly simple once you know it exists: **multi-stage builds**.

## What Even Is a Multi-Stage Build?

Think of building a Docker image like baking a cake. To make the cake, you need a mixing bowl, a stand mixer, measuring cups, an oven mitt, and flour everywhere. But when you *serve* the cake to guests, you don't bring all that equipment to the table — you just bring the cake.

Traditional Docker builds are like wheeling your entire kitchen to the dinner table. Multi-stage builds let you use all the tools you need during construction, then ship only the finished product.

Before multi-stage, people had elaborate shell scripts to build artifacts outside Docker, copy them in, and try to keep everything in sync. It was chaos. It was 2015. We don't talk about it.

## The Before: A Horror Story

Here's a typical "before" Dockerfile for a Node.js app that has the audacity to include its entire build toolchain:

```dockerfile
FROM node:20

WORKDIR /app

# Copy everything, including your messy node_modules and .env files
# (don't do this, but people do)
COPY . .

RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This image will contain: your source TypeScript files, all `devDependencies` (Jest, ESLint, TypeScript compiler, 47 Babel plugins), the npm cache, and whatever else was sitting in your project directory. Final size? Easily 800MB-1.4GB.

## The After: A Love Story

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS production

WORKDIR /app

# Only copy what we actually need to RUN the app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Final image size? Around **120-180MB**. That's a **7-8x reduction** without changing a single line of your application code.

The magic is `COPY --from=builder`. You're telling Docker: "Grab the compiled output from that previous stage, but leave everything else behind." The build tools, the source files, the TypeScript compiler — all gone. Never shipped. Never your problem.

## Real-World Lessons Learned (The Hard Way)

**Lesson 1: Alpine is your friend, but not always.** The `node:20-alpine` base image is ~130MB vs ~1.1GB for `node:20`. However, Alpine uses `musl` instead of `glibc`, which can cause mysterious failures with native Node modules. If you're using something like `sharp` for image processing or `bcrypt`, test on Alpine first. Sometimes `node:20-slim` (Debian-based but stripped) is the better middle ground at ~240MB.

**Lesson 2: Layer caching is your secret weapon.** Notice how `COPY package*.json ./` comes *before* `COPY . .`? That's intentional. Docker caches layers. If your source code changes but `package.json` didn't, Docker skips the entire `npm install` step and uses the cache. On a team with frequent deploys, this alone can shave minutes off every build.

**Lesson 3: `npm ci` over `npm install` in CI.** In production Dockerfiles, always use `npm ci`. It installs exact versions from `package-lock.json`, is faster than `npm install`, and fails loudly if the lockfile is out of sync. No surprise version bumps at 3 AM.

## Bonus: The Go Multi-Stage Build (The GOAT)

Go takes this pattern to absurd, beautiful extremes:

```dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# FROM SCRATCH. Zero base image.
FROM scratch

COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`FROM scratch` is an empty image. Nothing. No shell, no OS, no utilities. Just your compiled binary. The final image is literally just your binary — often **5-15MB**. Try pulling *that* image in a bandwidth-constrained environment.

(Security bonus: there's nothing to exploit. No shell to drop into, no package manager, no utilities. The blast radius of a container compromise shrinks to nearly zero.)

## The CI/CD Payoff

When you implement multi-stage builds across your services, the compound effect on your CI/CD pipeline is staggering:

- **Faster pushes to your registry**: 150MB vs 1.4GB — that's 9x less data over the network
- **Faster pulls during deployment**: your Kubernetes nodes aren't downloading a small operating system every rollout
- **Lower storage costs**: ECR, GCR, and Docker Hub charge for storage; smaller images = real money saved
- **Faster startup times**: smaller images load into memory faster, which matters at scale

One team I know cut their full deployment time from 18 minutes to 6 minutes purely from image size reduction. No code changes. No infrastructure changes. Just better Dockerfiles.

## Your Action Plan

1. Run `docker images` right now. Find your fattest image.
2. Open its Dockerfile.
3. Ask yourself: "Does the *running* container need this?" for every `RUN` and `COPY` step.
4. Add a second `FROM` stage. Move only the runtime necessities there.
5. Push, measure, celebrate.

The best part? Multi-stage builds are a zero-risk, pure-upside optimization. Your app behavior doesn't change. Your deployment pipeline gets faster. Your infrastructure costs go down. Your on-call rotations get a little less spicy.

Now go put your kitchen where it belongs: in the build stage.

---

*Got a particularly horrifying Docker image size story? Or a before/after that made you actually gasp? Drop it in the comments — misery loves company, and so does progress.*
