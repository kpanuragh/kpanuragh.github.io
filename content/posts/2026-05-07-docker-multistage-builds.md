---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Build Tools to Production"
date: 2026-05-07
excerpt: "Your Docker image is 1.4GB. Production doesn't need your node_modules, your compiler, or the entire Ubuntu kitchen sink. Here's how multi-stage builds shrink that to under 100MB — and make your team actually happy."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Let me paint you a picture. It's 3 PM on a Friday. Your CI pipeline is chugging along, pushing a fresh Docker image to your registry. The image is... 1.4 gigabytes. Your colleague opens a Slack thread titled "why is our image so fat" and tags you. We've all been there.

The fix? Multi-stage builds. And once you use them, you'll wonder how you ever lived without them.

## The Problem With Naive Dockerfiles

Most developers start with something like this for a Node.js app:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/server.js"]
```

Looks innocent. But that final image contains:
- The entire Node.js runtime + npm
- All your `devDependencies` (TypeScript, ESLint, Webpack, the whole circus)
- Source maps, test fixtures, maybe your `.env.example`
- Whatever the `node:20` base image dragged in (spoiler: a lot)

You're shipping your build workshop to production when you only need the finished table.

## Enter Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each stage can copy artifacts from previous stages — and crucially, the final image only contains what you explicitly put in it.

Here's that same Node.js app, done right:

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
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Two stages. The `builder` stage does the heavy lifting — compiling TypeScript, bundling assets, whatever your build process demands. The `production` stage starts fresh, installs only runtime dependencies, and copies just the compiled output.

The result? A 90MB image instead of 1.4GB. Your ops team sends you a gift basket.

## Real-World Lessons From the Trenches

**Lesson 1: `npm ci` vs `npm install`**

Use `npm ci` in Docker, always. It respects your lockfile exactly, skips the dependency resolution dance, and is meaningfully faster in clean environments (which Docker always is). `npm install` in a Dockerfile is a red flag in code review — circle it.

**Lesson 2: Layer caching is your best friend (until you break it)**

Notice how both stages copy `package*.json` before copying the rest of the source? This is intentional. Docker caches each layer. If your source code changes but your dependencies don't, Docker reuses the cached `npm ci` layer and skips straight to `COPY . .`. This turns a 3-minute build into a 20-second one.

Mess up the order — `COPY . .` before `npm ci` — and every single code change busts the dependency cache. Your CI minutes will evaporate. Your wallet will feel it.

**Lesson 3: Alpine images are small but not always safe**

`node:20-alpine` is based on Alpine Linux, which uses `musl libc` instead of `glibc`. Most things work fine. Occasionally, a native npm module will refuse to cooperate and you'll spend an afternoon compiling from source. If that happens, `node:20-slim` (Debian-based, but stripped down) is a happy middle ground — slightly larger, far fewer surprises.

## Bonus: Multi-Stage Builds for Go (The Extreme Edition)

If you want to see this pattern at its most powerful, Go is the poster child:

```dockerfile
# Stage 1: Build
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Stage 2: Minimal runtime
FROM scratch
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`FROM scratch` — no base image at all. Just your statically compiled binary and nothing else. The final image is often under 15MB. Some Go images clock in under 5MB. It's absurd in the best possible way.

You can't do this with Node.js (the runtime is required), but for compiled languages, the `scratch` base is the final boss of small images.

## The CI/CD Angle

Multi-stage builds integrate cleanly with GitHub Actions. The Docker layer cache doesn't persist between runs by default, but you can fix that:

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`type=gha` uses GitHub Actions cache as a Docker layer cache backend. Your first run after a cache miss will be slow. Every run after that? Fast. Combine this with multi-stage builds and your CI pipeline stops being the thing everyone complains about in standups.

## Quick Wins Checklist

Before you ship your next image, run through this:

- [ ] Does every stage use a specific tag, not `latest`? (`node:20-alpine`, not `node:latest`)
- [ ] Are dependencies copied and installed before source code? (cache optimization)
- [ ] Is the final stage using only what production needs?
- [ ] Have you run `docker history myapp:latest` to see what's eating your image size?
- [ ] Is `.dockerignore` excluding `node_modules`, `.git`, and test files?

That last one is a silent killer. If you forget `.dockerignore`, `COPY . .` happily copies your local `node_modules` into the image — overwriting the ones you just installed inside the container. Fun debugging session, 0/10 recommend.

## Go Shrink Your Images

Multi-stage builds aren't a niche optimization. They're the baseline for any Dockerfile that goes to production. Small images pull faster, scan faster, and give attackers less surface area to work with. The only downside is a slightly more complex Dockerfile — and "slightly more complex" means two `FROM` lines instead of one.

Open your repo right now, run `docker images`, and find your fattest offender. Then apply what you just read. If you go from 1GB+ to under 200MB, tag me in the victory lap — I love seeing those numbers drop.

Your future self, debugging a production incident at 2 AM with a fast container restart, will thank you.
