---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Serve One Sandwich"
date: 2026-04-25
excerpt: "Your Docker image weighs 2GB but your actual app is 20MB. Sound familiar? Multi-stage builds are the diet plan your containers desperately need — no gym membership required."
tags: ["Docker", "DevOps", "Containers", "CI/CD", "Best Practices"]
featured: true
---

Let me paint you a picture. It's 3 AM. Your CI pipeline just finished. You deploy a "simple" Node.js API and your Docker image is **1.8 gigabytes**. You accidentally shipped the compiler, the test framework, your node_modules with every dev dependency known to mankind, and possibly a ghost from a `npm install` you ran in 2019.

We've all been there. Multi-stage builds are the intervention your Dockerfiles need.

## What's Actually Wrong With Your Dockerfile

Most developers start with something like this:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

This *works*. It also ships your entire Node.js toolchain, all dev dependencies, TypeScript compiler, source maps, test files, and anything else that happened to be in your build context. To run `node dist/index.js`.

That's like hiring a full construction crew to hand someone a finished apartment key.

## Enter Multi-Stage Builds: Build Fat, Ship Lean

The idea is beautifully simple: use **multiple `FROM` statements** in a single Dockerfile. Each stage starts fresh, but you can cherry-pick files from previous stages. Your build stage can be an absolute unit — compilers, dev tools, the works. Your final stage is a minimalist dream.

Here's the same Node.js app, now with a glow-up:

```dockerfile
# Stage 1: The "I need everything" builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Stage 2: The "I run in production" runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Only grab the compiled output from the builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The magic is `COPY --from=builder`. You're reaching back into the `builder` stage and grabbing exactly what you need — just the compiled `dist/` folder. Everything else stays behind like luggage you never needed.

**Before:** ~1.4 GB  
**After:** ~180 MB  

That's not a typo. You just made your image **8x smaller** by changing your Dockerfile.

## A Real-World Go Example (Because Go Loves This Pattern)

Multi-stage builds shine even brighter with compiled languages. Go binaries are self-contained, so you can go from a full Go toolchain to... nothing but the binary itself:

```dockerfile
# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# Stage 2: Run on basically nothing
FROM scratch AS runtime
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`FROM scratch` means an empty image. Zero OS. Zero shell. Zero attack surface. Your image is literally just your binary and the SSL certs it needs to make HTTPS calls. We're talking **10-15 MB** for a production Go service.

The `-ldflags="-w -s"` strips debug info and the symbol table, shrinking the binary further. It's the compiler equivalent of rolling your clothes instead of folding them.

## Lessons Learned the Hard Way

**Lesson 1: Use `npm ci` instead of `npm install`**  
`npm ci` respects your lockfile exactly and is faster in CI. `npm install` is for humans exploring packages. Know the difference before your CI pipeline starts resolving different versions than your local machine.

**Lesson 2: Layer order is everything**  
Put things that change rarely (dependencies) before things that change often (source code). Docker caches layers — if you `COPY . .` before `RUN npm install`, every source change invalidates your dependency cache and you're downloading packages from scratch every build.

**Lesson 3: `.dockerignore` is not optional**  
You almost certainly don't want `node_modules/`, `.git/`, `*.log`, `coverage/`, or your `.env` file in your build context. A missing `.dockerignore` doesn't just slow down builds — it can accidentally leak secrets into image layers. Add it. Now. I'll wait.

**Lesson 4: `--no-cache` in CI is your enemy**  
Running `docker build --no-cache` in CI "for safety" throws away the entire point of layer caching and makes your builds painfully slow. Use proper cache invalidation (lockfile hashes, `--build-arg`) instead of nuking everything.

## The GitHub Actions Bonus Round

When you add multi-stage builds to your CI pipeline, cache them properly:

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    cache-from: type=gha
    cache-to: type=gha,mode=max
    tags: myapp:latest
```

`type=gha` uses GitHub Actions cache storage. Combined with efficient layer ordering and multi-stage builds, you'll go from 10-minute Docker builds to 2-minute builds. Your colleagues will think you're a wizard. You don't have to tell them it was just a Dockerfile fix.

## Try It Today

Pick one service in your stack. Check its current image size with `docker images`. Then rewrite its Dockerfile with multi-stage builds. I guarantee you'll cut the size by at least 50%, probably more.

Smaller images mean faster deploys, smaller attack surfaces, lower registry storage costs, and the quiet satisfaction of knowing you're not shipping a backhoe to dig a flower bed.

Your containers deserve better. Give them a multi-stage build.

---

*Got a before/after image size story? I'd love to hear the most egregious bloated image you've ever inherited. Drop it in the comments — no judgment, we've all been there.*
