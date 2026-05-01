---
title: "🐳 Docker Multi-Stage Builds: How I Shrunk My Image from 2GB to 47MB"
date: 2026-05-01
excerpt: "Your Docker image is not a suitcase — you don't need to pack everything in it. Learn how multi-stage builds can slash your image size by 97%, speed up deployments, and make your ops team actually like you."
tags: ["docker", "devops", "containers", "ci-cd", "best-practices"]
featured: true
---

Picture this: you've just finished a feature, you run `docker build`, grab a coffee, come back, and your image is **2.1 gigabytes**. Your CI pipeline takes 18 minutes. Your ops team is sending passive-aggressive Slack messages. Your Kubernetes node is out of disk space.

Been there. I've lived that nightmare.

The good news? Multi-stage builds are the cheat code nobody told you about, and once you see them, you'll never go back to bloated single-stage Dockerfiles again.

---

## Why Are Docker Images So Chonky?

Before we fix the problem, let's diagnose it. When you write a naive Dockerfile for a Node.js app, it usually looks something like this:

```dockerfile
# The "just make it work" Dockerfile (don't do this)
FROM node:20

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
```

Looks innocent, right? Wrong. You've just shipped:

- The **full Node.js runtime** (including npm, npx, and every dev tool known to mankind)
- Your **node_modules** directory (including webpack, TypeScript, ESLint, and 47 other build-time dependencies that have zero business being in production)
- Your **TypeScript source files** (which compiled down to 3 JavaScript files)
- Possibly your `.env.example`, your `.git` folder if you forgot a `.dockerignore`, and your CEO's performance review from 2019

The result? A container that is 95% "stuff that was needed to build the app" and 5% "the actual app."

---

## Enter Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in one Dockerfile. Each stage is isolated — you build your app in one stage, then copy **only the artifacts you need** into a lean final stage.

Here's the same Node.js app, done right:

```dockerfile
# Stage 1: The builder — all the tools, all the deps, zero judgment
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: The runner — lean, mean, production machine
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

USER node
CMD ["node", "dist/index.js"]
```

That's it. Two stages. The `--from=builder` flag is the magic wand — it reaches back into the builder stage and pulls only what you explicitly ask for.

**Before:** 2.1 GB  
**After:** 47 MB  
**CI time:** 18 minutes → 4 minutes  
**Ops team mood:** Hostile → Mildly tolerant

---

## Real-World Lessons (Learned the Hard Way)

**1. Always use alpine base images when you can.** `node:20` is 1.1GB. `node:20-alpine` is 170MB. Alpine is a minimal Linux distro that strips out everything you don't need. The tradeoff is occasional compatibility quirks with native modules (looking at you, `bcrypt`), but 99% of the time it just works.

**2. Copy `package.json` before your source code.** Docker caches layers. If you copy everything first and *then* run `npm install`, Docker busts the cache every time any file changes — including a comment in your README. Copy `package*.json` first, run `npm ci`, *then* copy source. This alone can cut repeated build times by 60%.

**3. Run as a non-root user.** Notice the `USER node` in Stage 2? By default, Docker containers run as root. That's a security nightmare. Node's official image ships with a `node` user — use it. If your container ever gets compromised, an attacker running as `node` has far less blast radius than one running as `root`.

**4. Use `npm ci` instead of `npm install`.** In CI and Docker contexts, `npm ci` is your best friend. It installs exactly what's in `package-lock.json`, fails loudly on discrepancies, and is generally faster. Think of `npm install` as "please figure it out" and `npm ci` as "follow the recipe exactly."

---

## The Payoff Goes Beyond Image Size

Smaller images aren't just about bragging rights (though the bragging rights are real). They mean:

- **Faster deploys** — less data to push to your registry and pull on your nodes
- **Faster autoscaling** — when Kubernetes needs to spin up 10 new pods in a hurry, a 47MB pull is a lot friendlier than a 2GB one
- **Reduced attack surface** — fewer binaries in your container means fewer potential vulnerabilities
- **Lower storage costs** — container registries charge by the gigabyte, and those gigabytes add up

My team reduced our ECR costs by 40% just by adopting multi-stage builds across our services. The finance team didn't send a thank-you card, but I like to think they felt something.

---

## The Pattern Works Everywhere

This isn't Node.js-specific. Multi-stage builds shine in any language with a build step:

- **Go**: Build with the full Go toolchain, run with `FROM scratch` (yes, literally an empty image — your binary is self-contained)
- **Java/Spring Boot**: Compile with Maven or Gradle, run with just a JRE instead of a full JDK
- **Python**: Install all the build-time dependencies, copy only the virtualenv and app code to the final stage
- **React/Next.js**: Run `npm run build`, then serve the static output from `nginx:alpine`

The mental model is always the same: **separate "what you need to build" from "what you need to run."**

---

## Your Turn

If you've got a Dockerfile in your project right now, go run `docker images` and look at the size column. If you're seeing anything over 500MB for a web service, you've got low-hanging fruit.

Add multi-stage builds this week — it's a one-afternoon change that pays dividends for the life of the project. Your future self, deploying at 2am during an incident, will appreciate those faster pull times.

And your ops team might even say hi in the hallway.

---

*Got a before/after Docker image size story? I'd love to hear it — drop it in the comments or find me on X/Twitter. The more dramatic the shrinkage, the better.*
