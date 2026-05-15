---
title: "Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Serve One Sandwich 🐳"
date: "2026-05-15"
excerpt: "Your Docker image weighs 2GB and takes 8 minutes to pull. Meanwhile, your actual app is 20MB. Multi-stage builds are the diet plan your containers desperately need."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

# Docker Multi-Stage Builds: Stop Shipping Your Entire Kitchen to Serve One Sandwich 🐳

Picture this: you've containerized your Node.js app. Proud moment. You push it to your registry, your team pulls it, and someone messages you: *"Hey, why is this 2.1GB?"*

You go silent. You check. They're right. Your 15MB Express API is wrapped in 2 gigabytes of... build tools, dev dependencies, the TypeScript compiler, and somehow three copies of `node_modules` from a dark timeline.

Welcome to the "I just shoved everything into one Dockerfile" club. We've all been there. 🎉

The fix? **Multi-stage builds** — one of Docker's most powerful and most underused features. Let's fix your image weight problem today.

## Why Your Docker Images Are Overweight 🍔

A typical Node/Python/Go project has two distinct phases:

1. **Build time** — you need compilers, dev dependencies, linters, TypeScript, webpack, your college roommate's test framework
2. **Runtime** — you need *none of that*. Just the compiled output and prod dependencies.

The classic mistake is doing both in one stage and shipping the whole disaster to production. You're basically packing your entire woodworking workshop into the furniture delivery truck.

Multi-stage builds let you say: *"Build here. Copy only the finished product. Throw the rest away."*

## The Before: One Giant Stage of Sadness 😢

```dockerfile
# 🚨 DON'T DO THIS
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install           # installs devDependencies too 💀

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Image size: **~1.8GB**. Pull time on a fresh CI runner: 3-4 minutes. Cold start in production: painful. Your ops team: quietly judging you.

## The After: Multi-Stage Glory ✨

```dockerfile
# Stage 1: The Builder (we throw this away after)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci                         # clean install for reproducibility
COPY . .
RUN npm run build                  # compile TypeScript → dist/


# Stage 2: The Runner (this is what actually ships)
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev              # production deps only
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Image size: **~180MB**. That's a 90% reduction. Your ops team: cautiously impressed.

The magic line is `COPY --from=builder` — it reaches into the builder stage and grabs exactly what you need. The compiler, dev packages, and all that intermediate junk never make it into the final image.

## Real-World Lesson: The CI Pipeline That Ate Our Budget 💸

At a previous job, we had a GitHub Actions pipeline pulling a 3GB image on every PR build. Sixty engineers. Multiple PRs per day. We were paying for gigabytes of network egress on image pulls that were 95% dead weight.

After switching to multi-stage builds, our CI pull step dropped from ~6 minutes to under 45 seconds. Deployment time to Kubernetes cut in half. And our container registry bill went from "oof" to "fine."

The lesson: **image size is a cascading problem.** It's not just storage — it's pull time, startup latency, egress costs, and attack surface. A smaller image has fewer packages, which means fewer CVEs, which means your security scanner stops screaming at you every Monday morning.

## Bonus: GitHub Actions Cache for Even Faster Builds ⚡

Multi-stage builds pair beautifully with layer caching in CI:

```yaml
# .github/workflows/build.yml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha          # restore cache from GitHub Actions
    cache-to: type=gha,mode=max   # save cache after build
```

With `cache-from: type=gha`, Docker reuses unchanged layers from previous builds. If your dependencies didn't change, the `npm ci` step is a cache hit — essentially free. Only changed code gets rebuilt.

Combined with multi-stage builds, you get images that are small *and* fast to build. It's the DevOps equivalent of having your cake, eating it, and the cake only being 50 calories.

## Quick Wins Checklist ✅

- Use `alpine` or `distroless` base images in your final stage (not the full OS)
- Use `npm ci` instead of `npm install` for reproducible, faster installs
- Split your Dockerfile into explicit `AS builder` and `AS runner` stages
- Add `.dockerignore` to exclude `node_modules`, `.git`, test files, and local `.env`
- Run containers as a non-root user (`USER node`) — your security team will love you

## The Takeaway

Multi-stage builds aren't an advanced Docker trick — they're just good hygiene. If you're shipping a container with build tools in it, you're shipping unnecessary risk, unnecessary size, and unnecessary cost.

Your app's job is to run, not to carry its entire construction crew with it.

Start with one project this week. Measure the before and after. Then go enjoy the look on your teammate's face when they pull your newly svelte 150MB image instead of the 2GB monster they were expecting. 😄

**Now go put your Dockerfiles on a diet. They'll thank you for it.** 🥗

---

*Found this useful? Share it with the person on your team who's still running `FROM ubuntu:latest` in production. They need this more than you do.*
