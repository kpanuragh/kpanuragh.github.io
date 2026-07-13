---
title: "🪪 Container UID/GID Gotchas: The Silent Permission War Nobody Warns You About"
date: "2026-07-13"
excerpt: "Your container runs fine locally, then face-plants in prod with 'permission denied' on a volume mount that definitely exists. Welcome to the UID/GID gotcha club — where numbers, not names, decide who owns your files."
tags: ["docker", "kubernetes", "containers", "devops", "security"]
featured: true
---

There's a special kind of dread that comes from a container that builds cleanly, runs perfectly on your laptop, and then throws `EACCES: permission denied` the second it touches a mounted volume in staging. No stack trace worth reading, no code change to blame, just a process politely refusing to write a file it swears it owns.

Welcome to UID/GID hell — one of the most underrated gotchas in container land, and one that has nothing to do with your application code and everything to do with a number nobody thought to check.

## The core misunderstanding: names are a lie

Inside a container, `whoami` might proudly tell you `appuser`. Outside the container, on the host filesystem, Linux doesn't know or care what `appuser` means. It only cares about the UID — a plain integer. Usernames are just a lookup table (`/etc/passwd`) that maps a number to a label, and that table is **local to whichever filesystem namespace is reading it**.

So when your container process (UID 1000 inside the container) writes to a bind-mounted host directory, the host doesn't see "appuser." It sees UID 1000, and it checks that number against whatever UID 1000 happens to mean *on the host* — which might be a completely different user, or nobody at all.

```bash
# Inside the container
$ id
uid=1000(appuser) gid=1000(appuser)

# On the host, that same UID might belong to someone else entirely
$ ls -ln ./data
-rw-r--r-- 1 1000 1000 42 Jul 13 09:12 output.log
$ getent passwd 1000
jenkins:x:1000:1000::/home/jenkins:/bin/bash
```

Your container thinks it's "appuser." The host thinks it's "jenkins." Nobody's wrong. That's the trap.

## Where this actually bites you

**1. Bind-mounted volumes with a non-root container user.** Best practice says "don't run as root in containers" — great advice, and then you switch to a non-root `USER` in your Dockerfile and suddenly your app can't write to a mounted directory because the host directory is owned by a UID that doesn't match.

**2. Kubernetes `fsGroup` surprises.** Kubernetes tries to help by chowning mounted volumes to a `fsGroup` you specify — but on large volumes (think: a multi-GB PVC), that recursive `chown` on pod startup can take minutes, and people mistake it for a hung container.

```yaml
securityContext:
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000        # k8s recursively chowns the volume to this GID on mount
  fsGroupChangePolicy: "OnRootMismatch"  # skip the chown if it's already correct — huge win on big volumes
```

That `fsGroupChangePolicy` line is criminally underused. Without it, every pod restart pays the recursive chown tax again, even when nothing changed.

**3. Base image UID drift.** You pin `node:20-slim`, and the `node` user inside is UID 1000. Six months later a base image update ships and now it's UID 1001, because upstream reshuffled something. Your CI, which bakes host-side directories with hardcoded permissions for UID 1000, quietly starts failing builds. Nothing in your Dockerfile changed. The base image moved the ground under you.

**4. Multi-container pods disagreeing.** A sidecar and a main container mounting the same `emptyDir`, each with a different `USER` directive in their respective images. One writes, the other can't read. This is a fantastic way to lose an afternoon to `readiness probe failed` with zero useful logs.

## The fixes that actually hold up

**Match UIDs deliberately, don't guess.** Pick a UID/GID for your app (1000 is conventional but arbitrary) and set it explicitly in every image and every manifest that touches the same data — don't rely on whatever the base image ships with.

```dockerfile
FROM node:20-slim
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -m appuser
USER appuser
```

Now that UID is a promise, not an accident of what upstream shipped this week.

**Use `chmod`/ACLs instead of chasing UID matches when the mount is shared across many writers.** Setting the setgid bit on a shared directory means new files inherit the group, which saves you from chasing UID parity across five different services.

```bash
chmod g+s /data/shared
setfacl -R -m g:appgroup:rwx /data/shared
```

**In Kubernetes, prefer `runAsNonRoot: true` with an explicit `runAsUser`** rather than trusting the image default — it turns a silent permission mismatch into a startup failure you catch in CI instead of a 2 a.m. page.

**For CI-built artifacts landing in a mounted volume, chown as an explicit step**, not an assumption:

```bash
docker run --rm -v "$(pwd)/dist:/out" my-builder \
  sh -c "build.sh && chown -R 1000:1000 /out"
```

## A real one from the trenches

At Cubet, we had a CI pipeline where a build container (running as root, because the base image never bothered dropping privileges) wrote artifacts into a mounted directory. The deploy stage ran as an unprivileged UID and choked trying to read its own build output. It "worked" for months because the deploy stage happened to also run as root in an earlier iteration of the pipeline — someone tightened the deploy container's security context as a hardening pass, and the build stage's root-owned files became instantly unreadable. The fix wasn't clever, it was just making the build stage chown its output before handing off, and pinning both stages to the same explicit UID going forward. Fifteen minutes of work once we actually understood *why* — the annoying part was the two hours before that spent assuming it was a Kubernetes RBAC issue because "permission denied" makes everyone reach for RBAC first.

## The takeaway

UID/GID mismatches are boring, unglamorous, and they will absolutely eat your afternoon if you don't respect them. The fix isn't exotic tooling — it's treating UIDs as an explicit contract between every container and volume that touches the same data, instead of an implicit assumption that "it'll just work because it's all Linux under the hood."

Next time you see `permission denied` on a mount that clearly has the file, run `id` in the container and `ls -ln` on the host before you touch RBAC, SELinux, or anything else. Nine times out of ten, it's just two numbers that don't agree.
