---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Dev Environment to Production"
date: 2026-04-30
excerpt: "Your Docker image is 4GB. Production is crying. Your ops team has filed a formal complaint. Let's fix that with multi-stage builds — the Marie Kondo method of containerization."
tags: ["Docker", "DevOps", "Containers", "CI/CD", "Best Practices"]
featured: true
---

Let me paint you a picture. It's 2 AM. Your deployment pipeline just finished pushing a 4.2GB Docker image to production. Your ops team is awake, your S3 bill is weeping, and somewhere in that bloated image is a dev dependency you added six months ago and completely forgot about.

We've all been there. And most of us have also shipped a `node_modules` folder to production inside a Docker image and quietly hoped nobody would notice.

The good news: Docker multi-stage builds exist, and they will save your soul (and your storage costs).

## What's the Problem, Exactly?

When you write a naive Dockerfile, everything you use to *build* your app ends up in the same image you use to *run* it. Compilers, test frameworks, build tools, that one npm package you installed "just to try it" — all of it comes along for the ride.

Here's what a typical before-photo looks like:

```dockerfile
# The "I'll clean it up later" Dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install        # 847 packages. Many are for testing. None spark joy.
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This works. It also produces an image north of 1GB for a simple Express API. You're shipping `jest`, `eslint`, `typescript`, and the entire TypeScript compiler to a container that will never, ever run a test or compile a file. That's like bringing your entire workshop to a job site when all you need is a screwdriver.

## Enter: Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each `FROM` starts a fresh image, and you can selectively copy artifacts from previous stages. The final image only contains what you explicitly put in it.

Here's the same app, Marie Kondo'd:

```dockerfile
# Stage 1: The Builder — let it use all the tools it wants
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Stage 2: The Runner — only what sparks joy (i.e., actually runs the app)
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev   # production deps only

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The magic is `COPY --from=builder`. That line reaches back into the `builder` stage and pulls out only the compiled `dist/` folder. The TypeScript compiler? Left behind. The 300MB of dev dependencies? Gone. Your image just went from 1.1GB to around 180MB. Your ops team sends you a thank-you note.

## Real-World Lessons Learned (The Hard Way)

**Lesson 1: Use `npm ci` instead of `npm install` in Docker.** `npm ci` installs exactly what's in your lockfile and is faster in CI environments because it skips the dependency resolution step. `npm install` can silently upgrade packages and produce non-reproducible builds. I learned this after spending three hours debugging a production bug that "worked on my machine" — turns out `npm install` had pulled in a minor version bump overnight.

**Lesson 2: Order your layers strategically.** Docker caches layers. If you `COPY . .` before installing dependencies, *any* source file change invalidates the dependency cache and forces a full reinstall. Always copy `package.json` first, install, *then* copy your source. This one change can turn a 4-minute build into a 40-second one.

**Lesson 3: Alpine images are smaller, but not always better.** `node:20-alpine` is great for production, but Alpine uses `musl` instead of `glibc`, which occasionally causes issues with native modules. If something breaks in Alpine but works in the full image, that's your culprit. The fix is usually switching to `node:20-slim` — still much smaller than the full image, but with fewer compatibility surprises.

## Bonus: Multi-Stage for Go (Because Why Not)

Go is an even better showcase for multi-stage builds because the final binary needs zero runtime dependencies:

```dockerfile
# Stage 1: Build the Go binary
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Stage 2: Literally just scratch — the empty base image
FROM scratch

COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`FROM scratch` is a zero-byte base image. The final image contains *only* your compiled binary. We're talking 8MB total. I once deployed a Go microservice this way and the ops team thought something had broken because the image was "too small." It was not broken. It was perfect.

## The Payoff

Multi-stage builds aren't just a storage optimization — they're a security improvement too. Every package you don't ship is a package that can't have a CVE. Every tool you leave in the builder stage is a tool an attacker can't use if they somehow get into your container. Smaller images mean a smaller attack surface, and your security team will love you for it (or at least stop sending you passive-aggressive Slack messages).

The build time increase is minimal — Docker is smart enough to cache the builder stages. And your CI/CD pipeline will thank you with faster image pushes and pulls across your entire cluster.

## Start Today

Pick one Dockerfile in your project. Check its image size with `docker images`. If it's over 500MB for a web app, you've got room to slim down. Add a second stage, move your runtime to a fresh Alpine base, and copy only what you need.

Your storage bill, your deployment speed, and your future self at 2 AM will all be grateful.

Now go clean up those images. Marie Kondo would be proud. 🧹
