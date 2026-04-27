---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Production"
date: 2026-04-27
excerpt: "Your Docker image shouldn't weigh more than a car. Learn how multi-stage builds slash image sizes from gigabytes to megabytes — and why your production container has no business knowing what a compiler is."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Picture this: you've just built a slick Node.js API. You run `docker build`, grab a coffee, come back, and stare at your terminal in horror. **1.8 GB.** Your entire application — which serves JSON and occasionally formats a date — is now heavier than most AAA video games. Your teammate's Slack message arrives: "Uh... the ECR push has been running for 40 minutes."

We've all been there. And the culprit is almost always the same: you're shipping your build tools to production like a chef who brings the entire industrial kitchen to the dinner table.

Enter **multi-stage builds** — Docker's solution to this very human problem.

---

## What Even Is a Multi-Stage Build?

A multi-stage build lets you use multiple `FROM` statements in a single Dockerfile. Each `FROM` starts a fresh image, and you can selectively copy artifacts from earlier stages. The beauty? Only the *last* stage makes it into your final image. Everything else — compilers, build caches, dev dependencies, that 400 MB JDK — gets left behind.

Think of it like packing for a trip. You don't bring the entire hardware store because you *might* need a screwdriver. You just bring the screwdriver.

---

## A Tale of Two Dockerfiles

Here's a before/after that'll make you feel things.

**The naive approach (please don't do this):**

```dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This image clocks in at around **1.1 GB**. It contains `npm`, all your `devDependencies`, the TypeScript compiler, and whatever other chaos lives in `node_modules`. Your production container is walking around with a full compiler toolchain it will never, ever use.

**The multi-stage approach:**

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Result? **~180 MB**. That's an **84% reduction** without changing a single line of application code. Your CI pipeline is suddenly not the thing your team blames for slow deploys.

---

## The Go Developer's Dream

If you're writing Go, multi-stage builds feel almost custom-made for you. Go compiles to a single static binary — which means your final image can literally just be `scratch` (an empty base image with nothing in it).

```dockerfile
# Stage 1: Compile
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/api

# Stage 2: Minimal runtime
FROM scratch

COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

The final image size? **~8 MB**. Eight. Megabytes. For a production-grade HTTP server. At this point your Docker image is smaller than most profile pictures. It has no shell, no package manager, no attack surface — just your binary and vibes.

---

## Real-World Lessons Learned (The Hard Way)

**1. Cache your dependency layers aggressively.**
Always copy your lock file *before* your source code. If you `COPY . .` first and then install dependencies, Docker can't cache the install step because *any* file change invalidates the layer. This is the number one reason CI builds feel like they're downloading the internet every time.

**2. Use `npm ci` instead of `npm install` in CI.**
`npm ci` is deterministic, respects your lock file, and is faster in clean environments. `npm install` is for development. `npm ci` is for builds. Tattoo this somewhere.

**3. Named stages make debugging less painful.**
`--from=builder` is much more readable than `--from=0`. Name your stages. Future you — debugging a production incident at 2 AM — will not curse your name.

**4. Watch out for SSL certificates in `scratch` images.**
If your Go (or Rust, or whatever) binary makes HTTPS calls, you need CA certificates. A `scratch` image has none. Copy them from the builder: `COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/`. Miss this and you'll spend a fun afternoon wondering why your service can't talk to anything.

---

## The Security Angle

Beyond size, there's a real security argument here. A 1.8 GB image full of build tools has a massive attack surface. Compilers, interpreters, package managers — all potential vectors if someone finds a way into your container. A minimal image with only your binary reduces blast radius dramatically.

This is why Distroless images (from Google) and Alpine-based images exist — they strip everything non-essential. Multi-stage builds let you *compose* them intelligently: use whatever fat image you need to build, then land in something minimal for runtime.

---

## Quick Wins to Take Away

- Measure your current image sizes: `docker images | grep your-app`
- Add multi-stage builds to your most-used services first — the ROI is immediate
- Set up image size checks in CI so nobody accidentally ships a 2 GB image again
- Consider Distroless as a runtime base for extra security points

---

## Go Shrink Something

Multi-stage builds are one of those rare DevOps improvements where the effort is low and the payoff is immediate and visible. Faster pushes, faster pulls, faster cold starts in Kubernetes, smaller attack surfaces, and the smug satisfaction of showing your team a 90% size reduction.

Pick your biggest, fattest Docker image this week and give it the multi-stage treatment. Then brag about the results. You've earned it.

Have a before/after story of your own? Drop it in the comments — I love a good "we accidentally shipped a 3 GB image to prod" tale as much as the next person.
