---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Compiler to Production"
date: 2026-03-26
excerpt: "Your Docker images are bloated, your attack surface is massive, and your CI pipeline cries every time it pushes 2GB to a registry. Multi-stage builds are the cure — and they're easier than you think."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Let me paint you a picture. It's 2 AM. Your on-call alert fires. The new service is slow to start, the container image is 1.8 GB, and your security scanner just flagged 47 CVEs — most of them in tools that have absolutely no business being in a production image. GCC. Make. The entire Node.js build toolchain. In production.

We've all been there. Today we fix it.

## The Problem: Building ≠ Running

Here's the dirty secret of containerization: the stuff you need to *build* your app is almost never the stuff you need to *run* it. A Go binary? It's a single static executable. But to compile it, you needed Go's entire toolchain, module cache, and probably a partridge in a pear tree.

A naive Dockerfile drags all of that into your final image:

```dockerfile
# 🚨 The Naive Approach (please don't do this)
FROM golang:1.22

WORKDIR /app
COPY . .
RUN go build -o server .

EXPOSE 8080
CMD ["./server"]
```

Result? A 900 MB image. For a 12 MB binary. That's like shipping a whole IKEA warehouse to deliver one shelf.

## Enter Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each stage can copy artifacts from the previous one — so your final image only contains what it actually needs.

```dockerfile
# ✅ The Multi-Stage Approach
# Stage 1: Build
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server .

# Stage 2: Run
FROM scratch

COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080
CMD ["/server"]
```

That's it. That `FROM scratch` at the bottom means your final image is *just* your binary and TLS certificates. We went from 900 MB to about 12 MB. Your security scanner went from 47 CVEs to zero. Your ops team sent you a gift basket.

## Real-World Lesson: The Node.js Tax

The same pattern saves you enormously in the JavaScript world, where `node_modules` is basically a black hole that consumes disk space and developer will to live.

```dockerfile
# Stage 1: Install deps and build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# Stage 2: Production deps only
FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 3: Final image
FROM node:20-alpine

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Three stages. The builder compiles your TypeScript. The `deps` stage installs only production packages. The final stage copies just what it needs. Your dev dependencies — TypeScript, ts-node, Jest, ESLint — stay where they belong: in the build stage, never in production.

**Pro tip:** That `USER node` line at the end? Never run containers as root. I learned this one the hard way during a pen test that went extremely well for the pen tester.

## The Hidden Win: Layer Caching

Multi-stage builds also help you exploit Docker's layer caching more aggressively. Notice how we always `COPY package*.json` before `COPY . .`? That's intentional.

When you change your source code, Docker can reuse the cached `npm ci` layer because `package.json` didn't change. A full dependency install that used to slow down every CI run now only happens when you actually change dependencies.

Before: every CI build downloads the internet. After: it's just your changed files.

## Things I've Learned the Hard Way

**1. Alpine isn't always smaller in practice.** Alpine uses musl libc, not glibc. Some binaries compiled against glibc won't run on Alpine. Test your images. Don't find out in production at 2 AM.

**2. `COPY --from` can pull from external images too.** Need specific tools in your build stage? You can do `COPY --from=alpine:3.19 /bin/wget /usr/local/bin/wget`. Great for grabbing utilities without bloating your build image.

**3. Name your stages.** `AS builder`, `AS deps`, `AS tester` — name them. You can also run specific stages locally with `docker build --target builder .` to debug build issues without running the whole pipeline.

**4. Check your .dockerignore file.** If you're `COPY . .`-ing everything and you don't have a `.dockerignore`, you're probably sending your `.git` folder, local `.env` files, and `node_modules` into the build context. Add `.dockerignore` before anything else.

## Measuring the Gains

After migrating a real Node.js API service at a previous job, here's what we saw:

- Image size: **1.2 GB → 180 MB** (85% reduction)
- CVEs in production scanner: **31 → 3** (and those 3 were in node itself, not build tools)
- CI push time to registry: **4 minutes → 45 seconds**
- On-call wakeups related to slow container startup: down to zero (correlation, not causation, but we'll take it)

## Your Action Items

1. **Audit your current images.** Run `docker images` and look at your sizes. Anything over 500 MB for a standard web service is a red flag.
2. **Add a build stage.** Even if you just split your current Dockerfile into "install/build" and "run", you're ahead.
3. **Try `FROM scratch` or `FROM distroless`** for compiled languages like Go or Rust. Google's distroless images are great if you need libc without a shell.
4. **Set up a size check in CI.** Tools like `dive` or a simple `docker image inspect` check can fail your build if the image exceeds a threshold. Make image bloat a build failure, not a post-mortem agenda item.

Multi-stage builds aren't a niche optimization — they're the baseline for responsible containerization. Your future self, your security team, and your cloud bill will all thank you.

Now go slim down those images. The registry isn't a storage solution.
