---
title: "🐳 Docker Multi-Stage Builds: Shrink Your Images from 1GB to 50MB"
date: 2026-05-12
excerpt: "Your Docker image is the size of a small country's GDP in bytes. Multi-stage builds are the diet plan it never knew it needed — and your CI pipeline will thank you."
tags: ["Docker", "DevOps", "Containers", "CI/CD", "Performance"]
featured: true
---

# 🐳 Docker Multi-Stage Builds: Shrink Your Images from 1GB to 50MB

Let me paint you a picture. You've just finished a slick Node.js API. You write a Dockerfile, run `docker build`, grab a coffee, come back, and stare at this:

```
Successfully built a8f3c9d1b2e4
Size: 1.2 GB
```

One point two gigabytes. For a REST API that returns JSON. Your image is now larger than the entire Linux kernel source tree, six seasons of a Netflix show, and your career regrets combined.

Welcome to the world before multi-stage builds. Pull up a chair — we're about to fix this.

---

## What Even Is a Multi-Stage Build?

The problem with a naive Dockerfile is that it conflates two very different jobs:

1. **Building** your application (needs compilers, dev dependencies, build tools)
2. **Running** your application (needs almost none of that)

A traditional single-stage build hauls all the build junk into production. It's like hiring a construction crew to build your house and then having them *live there permanently*. Your app doesn't need `gcc`, `make`, or `node_modules/` full of dev dependencies at runtime — but there they sit, bloating every layer.

Multi-stage builds let you separate these concerns cleanly. You build in one stage, copy *only the output* into a lean final stage, and leave the rest behind.

---

## The Before: A Chunky Node.js Dockerfile

Here's the kind of Dockerfile that haunts DevOps engineers at 2am:

```dockerfile
# ❌ The naive approach — don't do this
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install          # installs ALL deps, including devDependencies

COPY . .
RUN npm run build        # TypeScript compile, bundler, whatever

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

This image will typically land between **900MB–1.3GB**. It includes:
- The full Node.js runtime with npm
- Every devDependency you've ever installed
- TypeScript, ESLint, Prettier, and their entire dependency trees
- Build artifacts *and* the source files they came from
- Whatever you accidentally `COPY . .`'d (yes, that includes your `.env.local`)

---

## The After: Multi-Stage Slim Build

```dockerfile
# ✅ Multi-stage: build heavy, ship light
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci                        # clean install, respects lockfile

COPY . .
RUN npm run build                 # compile TypeScript → dist/


# --- Final stage: only what we need to run ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev             # production deps only

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Result: ~120MB.** That's a 10x reduction without changing a single line of application code.

The magic is `COPY --from=builder`. That instruction reaches back into the `builder` stage and grabs only the compiled output — the `dist/` folder. Everything else in the builder layer is discarded. Docker never includes it in the final image.

---

## Taking It Further: The Distroless Endgame

If you really want to go fast and make your security team smile, swap `node:20-alpine` in the final stage for Google's distroless images:

```dockerfile
FROM gcr.io/distroless/nodejs20-debian12 AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["dist/index.js"]
```

Distroless images contain *only* the language runtime — no shell, no package manager, no `bash`, no attack surface. Your image drops to **~60–80MB** and passes most container security scanners without breaking a sweat.

No shell means fewer CVEs. No shell also means no `docker exec mycontainer bash` debugging — which is either a minor inconvenience or a feature, depending on how much you trust your team.

---

## Real-World Lessons Learned

**Lesson 1: Layer order is everything.** Copy your `package*.json` and run `npm install` *before* copying your source code. `node_modules` changes rarely; your source changes constantly. This ordering means Docker cache invalidation only hits the expensive `npm install` step when your dependencies actually change. A well-ordered Dockerfile turns a 3-minute build into a 20-second one.

**Lesson 2: `.dockerignore` is not optional.** That `COPY . .` instruction copies your entire project directory — including `node_modules/`, `.git/`, `.env`, and that test fixtures folder with 200MB of sample PDFs. Create a `.dockerignore` with at minimum:

```
node_modules
.git
.env*
dist
*.log
```

**Lesson 3: Match your base image versions.** If you build on `node:20.11` and run on `node:20.9`, you'll eventually hit a subtle runtime difference at the worst possible time. Pin both stages to the same digest in production pipelines.

**Lesson 4: Name your stages.** `FROM node:20-alpine AS builder` isn't just for readability — you can also run `docker build --target builder .` to get a debug-friendly image with all your build tools intact. Lifesaver when you're hunting a build-time failure in CI.

---

## Your CI Pipeline Will Feel This

Image size isn't just a disk-space concern. Every CI runner that pulls your image, every Kubernetes node that schedules your pod, every developer running `docker pull` — they all pay for your lazy Dockerfile in time and bandwidth. A 1.2GB image across 50 deploys a day is 60GB of transfers. A 120MB image is 6GB. The math is not subtle.

Smaller images also mean faster pod startup in Kubernetes, lower ECR/GCR storage costs, and a smaller attack surface for your security scanning tools to complain about.

---

## TL;DR

| Approach | Image Size | Build Cache | Security Surface |
|---|---|---|---|
| Single-stage naive | ~1.2 GB | Poor | Large |
| Multi-stage alpine | ~120 MB | Good | Smaller |
| Multi-stage distroless | ~70 MB | Good | Minimal |

Go look at your current Dockerfiles right now. If you don't have a multi-stage build, you're shipping a construction site instead of a building.

One afternoon of refactoring, 10x smaller images, happier CI pipelines, and a security team that finally stops emailing you. That's the deal.

Go make it happen. 🚀
