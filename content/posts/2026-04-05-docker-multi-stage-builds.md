---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Production"
date: 2026-04-05
excerpt: "Your Docker images are probably way too fat. Learn how multi-stage builds let you compile, test, and ship lean production images — without the 2GB bloat that comes from dragging your build tools into production."
tags: ["Docker", "DevOps", "Containers", "Best Practices", "CI/CD"]
featured: true
---

Let me paint you a picture. You write a beautiful Go service, Dockerize it, push to production, and your ops team messages you: "Why is your image 1.8GB?" You shrug. "It needs the build tools?" They stare at you. You stare at the floor.

Sound familiar? We've all been there. But there's a better way — **Docker multi-stage builds** — and once you use them, you'll never go back to shipping your entire kitchen just to serve a sandwich.

## The Problem: Fat Images Are a Tax on Everything

Every megabyte in your Docker image costs you:

- **Slower CI/CD pipelines** — pulling and pushing 1.5GB images on every deploy is painful.
- **Larger attack surface** — every compiler, package manager, and debug tool you leave in production is a potential vulnerability.
- **Higher storage costs** — registries aren't free, and your finance team will eventually notice.
- **Slower container startup** — especially painful in auto-scaling scenarios where you need those pods up *now*.

The classic mistake is building everything in one stage: install dependencies, compile, run. Your final image drags along gcc, npm, pip, make, and a hundred transitive packages that production will never touch.

## Enter Multi-Stage Builds: The Art of Leaving Things Behind

Multi-stage builds let you use multiple `FROM` statements in a single Dockerfile. Each stage can copy artifacts from previous stages — leaving the junk behind. It's like moving apartments and only packing what you actually use.

Here's the classic example with a Go application:

```dockerfile
# Stage 1: Builder — where the mess happens
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# Stage 2: Production — lean, mean, and clean
FROM scratch

COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080
ENTRYPOINT ["/server"]
```

The builder stage pulls the full Go toolchain (~300MB). The final stage? Built on `scratch` — literally nothing. Just your binary and the TLS certs it needs. Final image size: **~8MB**. That's a 97% reduction. Your ops team will send you a thank-you card.

## A Real-World Node.js Example With Testing

Multi-stage builds shine even more when you add a testing stage. This way, your tests run in CI *inside Docker* using the same environment as production — no more "it works on my machine" excuses.

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && cp -R node_modules prod_modules
RUN npm ci

# Stage 2: Test
FROM deps AS test
COPY . .
RUN npm run lint && npm test

# Stage 3: Build
FROM deps AS build
COPY . .
RUN npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=deps /app/prod_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Notice what's happening here: the `test` stage runs your lint and tests, the `build` stage compiles your TypeScript or bundles your assets, and the `production` stage gets *only* the compiled output and production dependencies. Dev dependencies stay in CI where they belong.

## Lessons Learned the Hard Way

**1. Use specific base image versions.** `FROM node:latest` is a lie you tell yourself. Pin versions (`node:20.11-alpine`) so your builds are reproducible six months from now when `latest` has silently become something else entirely.

**2. Order your COPY statements wisely.** Docker caches layers. Put things that change least often at the top. `COPY package.json` before `COPY . .` means your `npm install` layer is cached unless you change your dependencies — which saves minutes on every build.

**3. `--from` can reference external images too.** Need a specific binary from another image? `COPY --from=alpine:3.19 /bin/wget /usr/local/bin/wget`. It's a powerful trick for grabbing utilities without bloating your base image.

**4. Name your stages or regret it.** `FROM golang:1.22 AS builder` beats `FROM golang:1.22` every time. Named stages make `COPY --from=builder` readable and let you target specific stages with `docker build --target builder` for debugging.

**5. The test stage is optional at build time.** In CI, you run everything. Locally, you might run `docker build --target build .` to skip tests during rapid development. Flexibility without duplication — that's the dream.

## Wiring It Into Your CI/CD Pipeline

In GitHub Actions, multi-stage builds slot in naturally:

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    target: production
    push: true
    tags: myapp:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

The `target: production` tells Docker to stop at the production stage. Combined with GitHub Actions cache (`type=gha`), subsequent builds reuse cached layers and your pipeline goes from 8 minutes to 90 seconds. Engineers rejoice.

## The Takeaway

Multi-stage builds aren't a fancy trick — they're just good hygiene. Separate concerns, ship less, deploy faster, sleep better. Your build environment and your production environment have different needs, and treating them as separate things is the right mental model.

The next time you find yourself writing `RUN apt-get install build-essential` in the same Dockerfile that ships to prod, hear that little voice: *"Wait — does production actually need this?"*

Usually, it doesn't.

Go trim those images. Your pipeline, your registry bill, and your security team will thank you.

---

*Got a particularly satisfying image size reduction story? Or a multi-stage build pattern that saved your bacon? Drop it in the comments — I'd love to hear what creative layers people are assembling out there.*
