---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Serve a Sandwich"
date: 2026-04-17
excerpt: "Your Docker images are probably enormous, and you don't even know why. Multi-stage builds are the diet plan your containers desperately need — cut image size by 90%, ship faster, and stop embarrassing yourself in production."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Let me paint a picture. You write a beautiful Go service. Twelve lines of code. It does one thing, does it well. Then you containerize it and end up with a **1.2 GB Docker image**.

How? Why? *Who hurt you?*

The answer, almost always, is that your Dockerfile is dragging your entire build toolchain into production like someone who packs their whole house for a weekend trip. Multi-stage builds are the fix — and once you see the before/after, you'll wonder how you ever lived without them.

## The Problem: One Stage to Rule Them All

Here's what a typical "just make it work" Dockerfile looks like:

```dockerfile
# The naive approach (please don't do this in prod)
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Looks innocent, right? But that `node:20` base image weighs in at **~1 GB**. Plus your `node_modules` dev dependencies. Plus your source files. Plus every cache layer npm left behind like a messy roommate.

You built a sandwich. You're shipping the entire kitchen.

## The Solution: Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each stage can pull from a different base image, and you can **selectively copy artifacts** from one stage to the next. The final image only contains what you explicitly include — nothing else.

Here's the same Node.js app, done right:

```dockerfile
# Stage 1: The builder (fat, messy, we don't care)
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Stage 2: The runner (lean, clean, production-ready)
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The magic is `COPY --from=builder`. You grab only the compiled output from the builder stage. Dev dependencies, TypeScript source files, test configs — gone. Poof. Left behind in a stage that never makes it to the registry.

**Result:** Your image goes from ~1.1 GB to ~180 MB. That's not a rounding error. That's 85% smaller.

## Going Further: The Scratch Technique for Go

Go developers can take this even further with the `scratch` base image — an image so minimal it literally contains nothing. No shell, no OS, no libc. Just your binary.

```dockerfile
# Stage 1: Build the Go binary
FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# Stage 2: The final image is NOTHING but your binary
FROM scratch

COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080
ENTRYPOINT ["/server"]
```

That `-ldflags="-w -s"` strips debug symbols and the symbol table, shaving a few more MB off. The result? A production image that's **8-15 MB**. For an entire HTTP service. Running in production. Handling real traffic.

The first time you see a 12 MB Go image in your registry, you'll feel things.

## Real-World Lessons (a.k.a. Mistakes I've Made So You Don't Have To)

**1. Alpine vs. Distroless vs. Scratch**
Alpine is small (~5 MB) and has a shell — great for debugging. Distroless (from Google) has no shell but has basic OS libraries. Scratch has literally nothing. Match your choice to your paranoia level and your app's runtime needs. If your app calls system libraries at runtime, scratch will humiliate you in production.

**2. Layer Caching is Your Best Friend**
Copy `package.json` *before* copying source code. If your source changes but dependencies don't, Docker reuses the cached layer for `npm install`. This can shave minutes off CI build times. Minutes that add up to hours. Hours you could spend on literally anything else.

**3. Don't Forget Non-Root Users**
Small images are great. Small images running as root are a security incident waiting to happen. Add this to your runner stage:

```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

Two lines. Done. Your security team will love you.

**4. Build Arguments for Environment-Specific Builds**
Use `ARG` to parameterize your builds without baking environment-specific config into the image. Pass `--build-arg NODE_ENV=production` in CI and keep your Dockerfile generic.

## The CI/CD Payoff

Smaller images aren't just aesthetically pleasing — they have real operational impact:

- **Faster deploys:** Pulling a 150 MB image vs. a 1.2 GB image over a container network is not the same experience
- **Lower egress costs:** Registry bandwidth costs money, especially at scale
- **Better security posture:** Fewer packages = smaller attack surface = fewer CVEs in your vulnerability scans
- **Faster cold starts:** Especially relevant if you're using serverless containers (Cloud Run, Fargate, etc.)

In one project, switching to multi-stage builds cut our average deploy time from 4 minutes to 45 seconds. That's not engineering folklore — that's pipeline metrics from the real world.

## Your Action Items

1. **Audit your current images:** Run `docker images` and find the embarrassingly large ones
2. **Add a builder/runner split** to the worst offender this week
3. **Measure the difference:** `docker image inspect <image> --format='{{.Size}}'` before and after
4. **Set a size budget in CI:** Tools like `dive` or `hadolint` can enforce image hygiene automatically

Multi-stage builds are one of those rare techniques that are simultaneously easy to adopt, immediately impactful, and basically free. There's no reason not to use them. Stop shipping the kitchen. Serve the sandwich.

---

*Have a war story about a container that got out of hand? Or a particularly satisfying before/after from a refactor? Drop it in the comments — I collect these like trophies.*
