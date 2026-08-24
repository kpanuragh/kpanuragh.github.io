---
title: "🪪 Container UID/GID Gotchas: The Permission Denied That Follows You Home"
date: "2026-08-24"
excerpt: "Your container runs great on your laptop and throws Permission denied in the cluster. The culprit almost never shows up in the logs: it's a number, and it's the same number on every machine whether you asked for it or not."
tags:
  - containers
  - docker
  - kubernetes
  - devops
  - linux
  - security
featured: true
---

# 🪪 Container UID/GID Gotchas: The Permission Denied That Follows You Home

Here's a sentence that should terrify anyone who's shipped a container to production: "it works on my machine, and also on the cluster, until it doesn't, and only for the mounted volume, and only sometimes."

That sentence is almost always about UIDs and GIDs. Not passwords, not RBAC, not some exotic seccomp profile — just a plain integer that means something different depending on which side of the container boundary you're standing on.

## The number that isn't a name

Inside a container, `whoami` might proudly tell you `appuser`. Outside the container, the kernel doesn't know or care what `appuser` is. It only knows the number. Usernames are a userspace convenience — a lookup in `/etc/passwd`. The kernel enforces permissions purely on UID and GID integers, and those integers are **shared with the host**, because containers aren't VMs. They're processes with a fancier hat on, using the same kernel, the same filesystem, the same UID space as everything else on that machine.

So when your Dockerfile does this:

```dockerfile
FROM node:20-slim
RUN useradd --uid 1001 appuser
USER appuser
WORKDIR /app
COPY --chown=appuser:appuser . .
CMD ["node", "server.js"]
```

...it looks self-contained. It isn't. UID 1001 inside the container is UID 1001 on the host node. If the host already has a user or process running as 1001 — maybe a Kubernetes node agent, maybe another tenant's workload — your container's "isolated" identity is sharing a permission boundary with something you've never heard of. This is precisely why running containers as root (UID 0) is dangerous even inside a container: UID 0 in the container is UID 0 on the host. A container escape as root isn't a privilege escalation, it's already done.

## Where this actually bites you

The classic trigger is a volume mount. You write a `docker-compose.yml` for local dev:

```yaml
services:
  app:
    build: .
    volumes:
      - ./data:/app/data
```

On your Mac, this works fine — Docker Desktop's VM layer smooths over ownership differences. Ship the same image to a Linux CI runner or a bare-metal node, and suddenly:

```
Error: EACCES: permission denied, open '/app/data/output.log'
```

The bind-mounted host directory `./data` is owned by whatever UID created it on the *host* — often `1000` (the first regular Linux user) or root. Your container process is running as UID `1001` from the Dockerfile above. Those don't match, the mount doesn't inherit any `--chown` magic (that only applies to `COPY`, and only at build time, and never to bind mounts), and the kernel says no. `chmod -R 777` "fixes" it the way duct tape fixes a leak — it works until someone questions why your data directory is world-writable in an audit.

Kubernetes has the same problem, dressed up nicer. A `PersistentVolume` backed by NFS or a cloud disk gets provisioned with some default ownership, your pod's container wants to write as UID 1001, and you get `CrashLoopBackOff` with a stack trace that, if you're lucky, mentions permissions at all.

## The fix that actually holds up

`fsGroup` in the pod's `securityContext` is the Kubernetes-native answer for volumes — it tells the kubelet to `chown`/`chgrp` the volume's contents (or set the setgid bit, depending on volume type) to a GID before the container starts:

```yaml
spec:
  securityContext:
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001
  containers:
    - name: app
      image: myapp:latest
      securityContext:
        allowPrivilegeEscalation: false
        runAsNonRoot: true
```

That last line, `runAsNonRoot: true`, is worth pinning to your team's baseline PodSecurity policy — it makes the scheduler *refuse* to start a container that's going to run as UID 0, instead of finding out during an incident. Pair it with an explicit `runAsUser` so a compromised base image can't quietly default back to root because someone forgot a `USER` line in a Dockerfile three FROM-layers up.

For plain Docker Compose bind mounts, the boring but reliable fix is matching UIDs deliberately rather than hoping:

```dockerfile
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} appuser && useradd -u ${UID} -g appuser appuser
USER appuser
```

```bash
docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t myapp .
```

Now the container's user matches whoever's running it locally, and the "who owns this file" question stops being a coin flip. It's not elegant, but it's the difference between a five-minute onboarding step and a Slack thread titled "why does docker hate me."

## The lesson that doesn't fit in a Dockerfile

At Cubet Techno Labs we had a shared EFS-backed volume across a handful of worker pods, each built from slightly different base images with slightly different default UIDs for their app user — 1000 in one, 999 in another, because one Dockerfile came from a Node base image and the other from a Python one with a pre-baked service account. Nobody had *chosen* those numbers; they were just whatever the upstream image maintainer picked. The pods that shared the volume stepped on each other's file permissions randomly depending on scheduling order, because whichever pod wrote first "owned" the files as far as the others were concerned. The fix wasn't clever — we pinned every image in that pipeline to the same explicit UID/GID and put it in a lint check so nobody could silently drift again. Boring, but it's stayed fixed since.

The underlying rule is simple even if the debugging isn't: a UID is not an identity, it's a number the kernel trusts blindly, and containers don't change that. Pin your UIDs explicitly, never let `USER` default to root, and set `fsGroup` on anything backed by a volume. It's cheap insurance against a bug that otherwise looks like it's mocking you specifically.

If you've been bitten by this — a mount that worked in dev and exploded in prod, or a "which user owns 1000 here" archaeology dig — I'd genuinely like to hear the war story. Find me wherever this blog is linked from and tell me about it.
