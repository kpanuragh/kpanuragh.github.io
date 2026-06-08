---
title: "🔢 Container UID/GID Gotchas: Why Your 'root' Isn't (and Why That Matters)"
date: "2026-06-08"
excerpt: "Running containers as root is bad, but the fix is full of traps — volume permission errors, Kubernetes admission webhooks blocking you, and Docker Desktop weirdness that only happens on your laptop. Here's the mental model that makes it click."
tags:
  - containers
  - docker
  - kubernetes
  - security
  - devops
featured: true
---

# Container UID/GID Gotchas: Why Your 'root' Isn't (and Why That Matters)

Here's a fun game. Spin up any random Docker image pulled from the internet, exec into it, and run `whoami`. Eight times out of ten: `root`. Now ask your security team what they think about that. Watch the colour drain from their faces.

But here's the twist — that root might not be *real* root, or it might be *way more* root than you wanted. Container UID/GID semantics are one of those topics where surface-level understanding leads to either paranoia or false comfort, often simultaneously.

Let me break down the gotchas I've shipped around (and since fixed) at Cubet Techno Labs.

## The Fundamental Confusion: Container Root vs Host Root

Inside a container, UID 0 is root. On the host, UID 0 is also root. These are the **same UID number** unless you're using user namespaces. This is the part people gloss over.

If your container process runs as UID 0 and somehow escapes (container breakout via kernel vuln, misconfigured mount, etc.), it lands on the host as UID 0. Game over.

If your container runs as UID 1000, even a breakout lands as some unprivileged user on the host. Not great, but dramatically less catastrophic.

The fix everyone knows: add a `USER` directive to your Dockerfile.

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Create a dedicated user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 3000
CMD ["node", "server.js"]
```

Simple enough. Except now your volume mounts will ruin your day.

## The Volume Permission Trap

You've dutifully set `USER appuser` (UID 1001, say) in your Dockerfile. You mount a host directory into the container. And your app immediately crashes trying to write to it because the host directory is owned by your laptop user (UID 1000 on Linux, some weird dynamic UID on macOS/Docker Desktop, who knows on CI).

The container process is UID 1001. The mounted directory is owned by UID 1000. Permission denied.

The naive fix — `chmod 777` everything — makes your security team cry twice in one day.

The actual fix depends on *what* you're mounting:

**For data directories you own**, pre-create them with the right ownership:

```bash
# On the host, before running the container
mkdir -p ./data
# Match the UID your container will use
sudo chown 1001:1001 ./data
```

Or in Docker Compose, use the `user` key:

```yaml
services:
  app:
    image: myapp:latest
    user: "1001:1001"
    volumes:
      - ./data:/app/data
```

**For named volumes** (not bind mounts), Docker manages ownership — but only if you set it up in your entrypoint or use an init container.

**The `fixuid` approach** — some images bundle a small tool that remaps the container's UID to match whatever the mounted volume owner is. Useful for development images where the UID varies per developer machine. Terrible idea for production.

## The Kubernetes Curveball: `runAsNonRoot: true` Is Not Enough

Kubernetes lets you set security contexts. Most teams learn about `runAsNonRoot: true` and pat themselves on the back.

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001
```

The `runAsNonRoot: true` flag tells Kubernetes to reject the pod if the container image has `USER 0` (or no USER directive, which defaults to root). But it doesn't *change* the UID — it just refuses to start. If your image has `USER 1001`, it passes. If it has `USER root` or nothing, the pod never starts.

The `runAsUser` override actually sets the UID at runtime, overriding whatever the Dockerfile specified. This is powerful and also a footgun: if your app wrote files as UID 1001 during the image build (think `RUN npm ci` creating `node_modules` owned by root), those files are now unreadable by your runtime UID 1001 user... wait, no. Built-in files in the image layer are owned by whoever ran the RUN command, which is UID 0 unless you've already set `USER` before that layer.

The pattern that actually works:

```dockerfile
FROM python:3.12-slim

# Do all root-requiring setup first
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps as root so they land owned correctly
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create user AFTER deps are installed
RUN useradd -r -u 1001 -g 0 appuser

# Copy app code with correct ownership
COPY --chown=1001:0 . .

USER 1001
```

Note the `useradd -g 0` — making the primary group root (GID 0) while running as non-root UID. This is OpenShift's recommended pattern because OpenShift assigns arbitrary UIDs at runtime but always uses GID 0. Your files need to be group-readable/writable by GID 0.

## The Supplemental Groups Rabbit Hole

Sometimes your app needs access to a specific resource that's gated by group membership — a Unix socket, a device, a mounted filesystem. You can pass supplemental groups via `fsGroup` and `supplementalGroups` in Kubernetes.

`fsGroup` is special: Kubernetes will `chown` the mounted volume's ownership to that GID and set the setgid bit on the directory. This means new files created in that volume will be owned by the `fsGroup` GID. Handy for shared volumes between init containers and main containers.

`supplementalGroups` just adds extra GIDs to the process without touching filesystem ownership. Use this when you need group membership but don't want Kubernetes recursively chowning your volume (which can be catastrophically slow on large volumes — I've seen pods take 10+ minutes to start because of this on a 50GB PVC).

```yaml
securityContext:
  runAsUser: 1001
  fsGroup: 2000          # owns the volume, new files get GID 2000
  supplementalGroups:
    - 3000               # just adds GID 3000 to the process
```

## The "I Used a Name, Not a Number" Mistake

Here's one that bit us at Cubet: in your Dockerfile you write `USER appuser`. In your Kubernetes security context you write `runAsUser: 1001`. These need to agree, but Kubernetes doesn't check the image's `/etc/passwd` — it just sets the numeric UID.

The failure mode: your image has `appuser` mapped to UID 1002 (maybe another layer added a system user first), but your securityContext says `runAsUser: 1001`. The pod starts as UID 1001, which doesn't exist in the container's `/etc/passwd`. Most apps are fine with this (Linux doesn't require an entry in passwd to run), but some apps and libraries call `getpwuid()` and crash or misbehave when they get no result.

**Rule**: always use numeric UIDs in both your Dockerfile and your Kubernetes manifests. Don't rely on name resolution across the boundary.

```dockerfile
# Fragile
USER appuser

# Robust
USER 1001
```

## A Quick Sanity Checklist

Before you ship a containerised service:

1. `docker inspect <image> | grep -i user` — verify the image declares a non-root USER
2. `docker run --rm <image> id` — see the actual UID/GID at runtime
3. Test your volume mounts locally with the same UID your K8s securityContext specifies
4. If using OpenShift or strict PSPs/PSAs, use GID 0 as the primary group
5. For volumes: prefer `fsGroup` over making everything world-writable
6. Pin UIDs to numbers, not names

The last lesson from production: document your chosen UID (we use 1001 across all our services at Cubet) in your internal platform docs. Nothing wastes an afternoon faster than "why can't container A's shared volume be read by container B?" when the answer is "they have different UIDs defined by different people on different Fridays."

## The 30-Second Test

If you want a quick gut-check on any image before promoting it:

```bash
docker run --rm --user 65534:65534 <your-image> whoami
```

UID 65534 is `nobody` — a completely unprivileged user that's unlikely to appear in any `/etc/passwd`. If your app starts and functions, it's genuinely non-root-capable. If it explodes, you have work to do.

---

Container UID/GID plumbing is unglamorous, but getting it wrong is the kind of thing that shows up in a CVE report or a 3am incident when a volume fills up with root-owned files your app can't delete. Five minutes of `id`-checking and `chown`-auditing now saves a lot of pain later.

What's your team's approach to UID standardisation across services? Hit me up — I'm always curious how others solve the "every developer has a different host UID" problem in local dev.
