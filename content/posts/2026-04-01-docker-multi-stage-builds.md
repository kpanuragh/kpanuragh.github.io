---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Production"
date: 2026-04-01
excerpt: "Your Docker images are bloated, slow, and carrying more baggage than a European backpacker. Multi-stage builds are here to put your containers on a diet — without the suffering."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

# 🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Production

Let me paint you a picture. You've just built a beautiful Node.js app. You write a simple `Dockerfile`, run `docker build`, and proudly check the image size.

**1.4 GB.**

For a REST API that returns JSON. You could fit the entire works of Shakespeare in less space. Several times. With room for the audiobook.

This, dear developer, is the Docker bloat problem — and multi-stage builds are the cure.

## The Problem: You're Shipping the Kitchen Sink

When you build a typical application, you need a bunch of tools: compilers, build dependencies, dev tooling, test runners, and package managers. You need all of this *to build* the app. But once the app is built? You need almost none of it to *run* the app.

A naive Dockerfile doesn't know the difference:

```dockerfile
# The "I'll clean it up later" Dockerfile
FROM node:20

WORKDIR /app
COPY package*.json ./
RUN npm install          # Installs 847 packages including left-pad
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

That image now contains Node.js, npm, your entire `node_modules` folder (including every dev dependency your intern added "just in case"), TypeScript compiler, source maps, and probably your `.env` file if you weren't careful. Yikes.

## Enter Multi-Stage Builds: The Marie Kondo of Dockerfiles

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each `FROM` starts a fresh stage, and you can selectively copy artifacts from previous stages. The final image only contains what you explicitly bring over.

Here's that same Node.js app, done right:

```dockerfile
# Stage 1: The Builder — does all the heavy lifting
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false   # Install everything, including devDeps
COPY . .
RUN npm run build                    # Compile TypeScript, bundle, whatever

# Stage 2: The Runner — lean, mean, production machine
FROM node:20-alpine AS runner

WORKDIR /app

# Only copy what we actually need to run the app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .

# Run as non-root (security win!)
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The result? We went from 1.4 GB down to around **180 MB**. That's an 87% reduction. Your DevOps team will send you a gift basket.

## A Real Go Example: Even More Dramatic

Go is where multi-stage builds really flex. Go compiles to a single static binary — meaning your final image can be *literally just the binary* running on a minimal base:

```dockerfile
# Stage 1: Build the Go binary
FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Stage 2: Run on scratch (no OS at all!)
FROM scratch AS runner

# Copy only the binary and any certs you need
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/server /server

EXPOSE 8080
ENTRYPOINT ["/server"]
```

The final image size? **~12 MB.** Your entire production server fits in a tweet thread. Well, almost.

The `scratch` base image is literally empty — no shell, no package manager, no utilities. Attackers can't exploit what doesn't exist. Security teams love this. (And honestly, you should too.)

## Lessons Learned the Hard Way

**1. Tag your stages or regret it.** Using `AS builder`, `AS tester`, `AS runner` makes your Dockerfile readable and lets you target specific stages during development (`docker build --target builder .`). Unnamed stages are a debugging nightmare at 2 AM.

**2. Order your COPY and RUN commands strategically.** Docker caches layers. If you `COPY . .` before `RUN npm install`, every single code change busts the npm cache. Always copy dependency manifests first, install, *then* copy source code. This alone will save you hours of build time over a year.

**3. `.dockerignore` is not optional.** Before multi-stage builds even matter, make sure you're not `COPY . .`-ing your `node_modules`, `.git` folder, or local `.env` files into the build context. Create a `.dockerignore` that mirrors your `.gitignore` and add `**/.env` for good measure.

**4. Use specific base image tags.** `FROM node:latest` is how you get surprised on a Tuesday morning when a major version ships and breaks your build. Pin to `node:20.11-alpine3.19`. Future-you will be grateful.

## The CI/CD Bonus Round

Multi-stage builds compose beautifully with CI/CD pipelines. You can run your tests *inside* Docker, ensuring the environment is always consistent:

```yaml
# GitHub Actions snippet
- name: Build and test
  run: |
    docker build --target tester -t myapp:test .
    docker run --rm myapp:test npm test

- name: Build production image
  run: docker build --target runner -t myapp:latest .
```

Add a `tester` stage between builder and runner that runs your test suite. If the tests fail, the build fails. No more "it works on my machine" shipped to production.

## The Takeaway

Multi-stage builds aren't a fancy optimization for large teams — they're a basic hygiene practice that every Docker user should adopt from day one. Smaller images mean:

- **Faster deploys** — less to pull, less to push
- **Better security** — smaller attack surface
- **Lower costs** — less storage in your container registry
- **Happier ops teams** — they will literally thank you

Your Dockerfile should tell a story: "Here's how I *built* this thing, and here's what you actually need to *run* it." Keep those two chapters separate.

---

**Ready to put your containers on a diet?** Start with your most bloated image. Run `docker image ls`, sort by size, and pick the worst offender. I'd bet a free coffee it doesn't have a multi-stage build yet.

Drop your before/after sizes in the comments — I'd love to see how much you trim. My personal record is 2.1 GB down to 23 MB. Can you beat it?

*Happy shipping — and may your images always be slim.* 🚢
