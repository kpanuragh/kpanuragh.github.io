---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen Just to Serve One Dish"
date: 2026-03-28
excerpt: "Your Docker image doesn't need gcc, npm, and three years of build cache to run a Node.js app in production. Multi-stage builds let you keep the build mess out of your final image — here's how to actually use them."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Picture this: you Dockerize your Node.js app, push it to production, and your ops team comes back with a Slack message that just says "why is this image 1.4 GB?" You nervously check... and yep. You shipped `node_modules`, the TypeScript compiler, a dev dependency for a linting rule you added in 2022 and never removed, and somehow the entire Alpine package cache.

We've all been there. The good news? Multi-stage builds are the fix, and once you start using them, you'll never go back.

## What Even Is a Multi-Stage Build?

A multi-stage build lets you use **multiple `FROM` statements** in a single Dockerfile. Each `FROM` starts a fresh image stage. The trick is you can **copy specific artifacts** from one stage into the next — so your final image only gets what it actually needs to *run*, not everything you needed to *build*.

Think of it like cooking. Your kitchen is a disaster zone of flour, dirty bowls, and seventeen utensils you used to make a cake. But the guest only sees the cake on the plate. Multi-stage builds are how you serve the cake without bringing the kitchen to the table.

## A Real-World Node.js Example

Here's a Dockerfile without multi-stage builds:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/server.js"]
```

Functional? Yes. Lean? Absolutely not. That image is dragging in the full Node.js runtime, all `devDependencies`, TypeScript, ts-node, and whatever else landed in `node_modules`. Final size: probably 800MB–1.2GB.

Now here's the same app with a multi-stage build:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

That final image? Somewhere around **150–200MB**. You're shipping only the compiled output and production dependencies. The TypeScript compiler never left the build stage. Your ops team owes you a coffee.

## Going Further: The "Distroless" Trick

If you really want to nerd out on image size (and who doesn't?), combine multi-stage builds with a distroless base image for the final stage. Distroless images contain only your application and its runtime dependencies — no shell, no package manager, no bash for attackers to poke around in.

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

# Stage 2: Minimal production image
FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["dist/server.js"]
```

The downside: no shell means `docker exec -it container bash` won't work. Debugging gets more creative. But in production, that's often a feature, not a bug — less attack surface, fewer ways for things to go sideways.

## Lessons Learned the Hard Way

**1. Use `npm ci` over `npm install` in Docker.** `npm ci` is deterministic and respects your lockfile. `npm install` can update things quietly and produce different builds on different machines. In a container, "works on my machine" is doubly embarrassing.

**2. Order your COPY and RUN commands strategically.** Docker caches layers top-to-bottom. Copy your `package.json` and install dependencies *before* copying your source code. That way, a code change doesn't bust your dependency cache and reinstall 400 packages every single build.

**3. Tag your stages with `AS name`.** It's tempting to skip the `AS builder` alias when you only have two stages. Don't. The moment you add a third stage (maybe a test runner stage, maybe a migration runner), you'll be glad your stages have readable names.

**4. `.dockerignore` is not optional.** If you're not using a `.dockerignore` file, you're copying your `node_modules`, `.git` directory, and local `.env` files into the build context. Add one. Minimum contents:

```
node_modules
.git
.env
*.log
dist
```

This alone can cut your build time in half because Docker doesn't have to send 300MB of `node_modules` to the daemon at the start of every build.

## Why This Matters for CI/CD

In a GitHub Actions or GitLab CI pipeline, image build time is pipeline time is money. A 1.4GB image takes longer to build, longer to push to your registry, longer to pull on the deploy target, and longer to scan for vulnerabilities. Multiply that across 50 deploys a day across a team and you're burning serious compute minutes.

Multi-stage builds also make security scanning more meaningful. Tools like Trivy or Snyk are scanning your *final* image. If that final image still contains the build toolchain, you're flagging vulnerabilities in packages that don't even run in production — just noise that trains your team to ignore alerts.

Leaner images = faster pipelines = happier on-call rotations = better sleep. That's the whole chain.

## The Takeaway

Multi-stage builds aren't an advanced Docker trick reserved for infrastructure engineers. They're a basic hygiene practice that every team shipping containers should have in their Dockerfile from day one. The overhead is one extra `FROM` and a couple of `COPY --from=` lines. The payoff is smaller images, faster deploys, and a dramatically reduced attack surface.

Start with the builder/runner split. Add `.dockerignore` if you haven't. Graduate to distroless when you're ready. Your future self — and whoever is on-call when your container registry bill comes in — will thank you.

---

**Got a Docker image that's ballooned out of control? Drop the `docker images` output in the comments — we can diagnose the culprit together.** And if your team is still on single-stage builds, send them this post. Consider it a gift.
