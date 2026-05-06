---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Make a Sandwich"
date: 2026-05-06
excerpt: "Your Docker image is 2GB and your app is 20MB. Something has gone terribly wrong. Learn how multi-stage builds let you build fat, ship thin, and stop embarrassing yourself in production."
tags: ["Docker", "DevOps", "Containers", "CI/CD", "Best Practices"]
featured: true
---

Let me paint you a picture. It's 2 AM. Your on-call phone is screaming. Your Kubernetes pod is crash-looping. You SSH into the node, run `docker images`, and stare at this:

```
myapp    latest    2.1GB
```

Your app serves JSON. It has 12 routes. It does **not** need to be 2 gigabytes.

Somewhere along the way, your Dockerfile became a hoarder's paradise — carrying compilers, build tools, test dependencies, and probably the ghost of a Node.js version that hasn't been supported since 2019. Multi-stage builds are the Marie Kondo of the Docker world. Does this layer spark joy? No? Then it doesn't ship.

## What Even Is a Multi-Stage Build?

The classic Dockerfile problem looks like this: you need a bunch of tools to *build* your app (compilers, package managers, build scripts), but those tools are completely useless at *runtime*. Yet they all end up in your final image, making it bloated, slow to pull, and full of attack surface for security scanners to flag.

Multi-stage builds solve this by letting you chain multiple `FROM` statements in a single Dockerfile. Each stage gets its own base image and environment. You build in one stage, then copy *only the artifacts you need* into a clean, minimal final stage. The build tools never make it to production. It's beautiful.

## A Tale of Two Dockerfiles

Here's the before — a Node.js app Dockerfile written by someone (definitely not me) who had just discovered Docker and was feeling confident:

```dockerfile
# The "I Have No Idea What I'm Doing" Dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

This ships `node:20` (which includes Python, make, gcc, and a small city's worth of utilities), your `node_modules` with every dev dependency, your TypeScript source files, and basically your entire development environment. Image size: somewhere between "embarrassing" and "criminal."

Now, the after — multi-stage glory:

```dockerfile
# Stage 1: The Builder (stays home, never ships)
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY . .
RUN npm run build

# Stage 2: The Runner (lean, mean, production machine)
FROM node:20-alpine AS runner

WORKDIR /app

# Only bring what we need
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .

# Don't run as root — your security team will love you
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Same app. Different philosophy. The builder stage does all the heavy lifting. The runner stage shows up fresh, with just the compiled output and production dependencies. Image size drops from `~1.2GB` to `~180MB`. That's not optimization — that's an intervention.

## The Real-World Lesson That Hurt

Here's a story I can't possibly be making up: a team I knew was deploying a Go microservice. Go compiles to a single static binary. The binary was 12MB. Their Docker image was 800MB.

Why? Because their Dockerfile was:

```dockerfile
FROM golang:1.22
COPY . .
RUN go build -o app .
CMD ["./app"]
```

They were shipping the entire Go toolchain, all the source code, all the build cache, just to run a 12MB binary. With multi-stage builds and a `scratch` or `distroless` base image, that 800MB becomes 15MB. Pull times go from "go get a coffee" to "blink and you missed it." Cold starts in Kubernetes? Dramatically faster.

The fix was two extra lines in the Dockerfile:

```dockerfile
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o app .

FROM scratch
COPY --from=builder /app/app /app
CMD ["/app"]
```

12MB. Done. No compiler. No source. No regrets.

## Three Things You'll Learn the Hard Way (or Just Read This)

**1. Layer order matters.** Put things that change rarely (installing system deps) before things that change often (copying your source code). Docker caches layers, and a cache miss invalidates everything after it. Copy your `package.json` first, run `npm install`, *then* copy your source. Future-you will thank present-you.

**2. `.dockerignore` is not optional.** If you're doing `COPY . .` without a `.dockerignore`, you're probably copying your `.git` folder, your local `.env` file, your `node_modules`, and maybe a folder called `temp-stuff-delete-later`. Add a `.dockerignore`. It's the Docker equivalent of not committing your API keys.

**3. `alpine` is your friend, until it isn't.** Alpine-based images are tiny, but they use `musl libc` instead of `glibc`. Most apps are fine with this. Some native dependencies are not. If you're chasing a weird runtime error that only happens in Docker, check if your base image is Alpine. Sometimes `debian-slim` is the better call.

## The Payoff Is Real

Multi-stage builds aren't just about image size vanity metrics. Smaller images mean:

- **Faster CI/CD pipelines** — less to push and pull
- **Faster Kubernetes pod scheduling** — nodes pull images quicker
- **Smaller attack surface** — fewer installed packages means fewer CVEs lighting up your security dashboard at 4 PM on a Friday
- **Lower storage costs** — your registry bill will be measurably smaller

This is the rare DevOps win where you do *less* and everything gets *better*.

## Go Refactor Your Dockerfile

Open your project's Dockerfile right now. If it has a single `FROM` and it's not a tiny side project, there's a 90% chance you're shipping more than you need to. Add a build stage. Move your compilation there. Copy only the artifacts into a minimal runtime image.

Your containers will be faster, safer, and lighter. Your team will be happier. Your Kubernetes nodes will stop sweating. And the next time someone opens `docker images`, nobody will have to avert their eyes in shame.

Now go make that sandwich — just leave the kitchen at home.

---

*Have a multi-stage build win (or horror story) of your own? Hit me up — I collect these the way some people collect vintage baseball cards, except mine are actually useful.*
