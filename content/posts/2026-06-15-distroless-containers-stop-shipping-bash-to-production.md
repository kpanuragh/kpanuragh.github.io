---
title: "🕳️ Distroless Containers: Stop Shipping Bash to Production"
date: "2026-06-15"
excerpt: "Your container image doesn't need a shell, a package manager, or curl. Distroless images strip all of that away — leaving only your app and the runtime it needs. Here's why that matters and how to actually use them."
tags:
  - containers
  - docker
  - security
  - devops
  - platform-engineering
featured: true
---

Here is a fun game: pull a random production container image from your registry, exec into it, and run `which curl`. If it prints `/usr/bin/curl`, congratulations — you've just confirmed that an attacker who escapes your app can immediately start making network requests, downloading tools, and pivoting to the next target. You've shipped a fully equipped hacking workstation disguised as a Node.js server.

Distroless images exist to fix exactly this. The idea is brutally simple: put only your application and the runtime libraries it actually needs into the image. No bash. No sh. No apt. No curl. No wget. Not even a `/bin` directory in many cases. Just the binary and its dependencies.

## What "Distroless" Actually Means

The term was coined by Google, who open-sourced a set of base images under `gcr.io/distroless/`. These images are built from Debian packages but contain none of the usual OS scaffolding — no package manager, no shell, no coreutils. Each variant targets a specific runtime:

- `gcr.io/distroless/static-debian12` — for statically linked binaries (Go, Rust)
- `gcr.io/distroless/base-debian12` — glibc + libssl, for dynamically linked C binaries
- `gcr.io/distroless/python3-debian12` — Python interpreter only
- `gcr.io/distroless/nodejs20-debian12` — Node.js runtime only
- `gcr.io/distroless/java21-debian12` — JRE only

The `:debug` tag for each adds busybox (a tiny shell), which lets you exec in during development. In production you use the tag without `:debug`. An attacker who pops a shell exploit gets... nothing to work with. `execve("/bin/sh")` just fails.

## The Multi-Stage Build Pattern

Distroless only makes sense with multi-stage builds. You build in a fat image with all your tooling, then copy the artifact into a distroless final stage.

Here's a Go service:

```dockerfile
# Stage 1: build
FROM golang:1.22-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# Stage 2: run — nothing but the binary
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

The final image contains your binary, the distroless base (ca-certificates, tzdata, a passwd file), and nothing else. Typical size: 10–20 MB versus 300+ MB for a golang:bookworm image. The attack surface is measured in kilobytes.

For a Node.js service it looks slightly different because you need `node_modules`:

```dockerfile
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER nonroot:nonroot
CMD ["dist/index.js"]
```

At Cubet, we switched our internal Go microservices to this pattern and the image size dropped from ~350 MB to ~18 MB. CI push times to ECR went down noticeably, and our vulnerability scanner stopped finding CVEs in packages we didn't even know existed in the base image.

## The Real Security Win

Smaller images scan cleaner, but the bigger gain is behavioral. Consider what an attacker needs after an initial exploit:

1. A shell to run commands interactively
2. A way to download tools (curl, wget, python -c urllib)
3. A way to enumerate the OS (ls, ps, cat /etc/passwd)
4. A way to persist (cron, SSH keys, crontab)

Distroless nukes steps 1–4 simultaneously. You can still get RCE if your application code has a vulnerability, but pivoting from that RCE into infrastructure becomes significantly harder. This is defense-in-depth that runs at zero CPU overhead.

It pairs well with read-only root filesystems and dropped capabilities:

```yaml
securityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
  runAsNonRoot: true
  runAsUser: 65532  # nonroot uid in distroless images
```

## The Trade-Off: Debugging Is Annoying

Let's be honest. The first time you need to debug a production issue in a distroless container and you can't `kubectl exec` into a shell, you will briefly regret all your choices.

The modern answer is ephemeral containers. You attach a debug sidecar at runtime without modifying the running pod:

```bash
kubectl debug -it my-pod \
  --image=busybox \
  --target=my-container \
  --share-processes
```

This injects a temporary container that shares the process namespace with your app. You can inspect `/proc/<pid>/fd`, check network connections with `ss`, and poke at the filesystem — all without the production container having any of those tools baked in.

The `:debug` distroless variant (with busybox) is a useful middle ground for staging. Enforce the non-debug tag in production via your admission controller or a Kyverno policy:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: no-distroless-debug-in-prod
spec:
  rules:
    - name: block-debug-tag
      match:
        resources:
          kinds: [Pod]
          namespaces: [production]
      validate:
        message: "distroless :debug images are not allowed in production"
        pattern:
          spec:
            containers:
              - image: "!*:debug"
```

## What About Alpine?

Alpine (`alpine:3.x`) is the other common "small image" choice, and it is excellent — but it is not distroless. Alpine still has `sh`, `apk`, and a full userland. Its attack surface is smaller than Debian-based images, but it is categorically different from distroless. Use Alpine when you need a shell-accessible image during development or for tooling containers. Use distroless for services that run in production and should never need to be exec'd into.

## Getting Started Without Breaking Everything

1. **Start with Go or Rust services.** Statically compiled binaries drop into `gcr.io/distroless/static` with zero drama. No dependency resolution, no missing `.so` files.
2. **Test with the `:debug` tag first.** Build the image, run it with `:debug`, exec in, and confirm your service actually works before switching to the non-debug variant.
3. **Watch for runtime file writes.** Many services write to the filesystem at startup (temp files, sockets, pid files). With a read-only rootfs you'll need a `tmpfs` volume for `/tmp`.
4. **Update your health-check scripts.** If you have a `CMD` that runs `curl http://localhost/health`, that breaks. Use your app binary to expose a healthcheck endpoint instead, or use `wget` from within the container during build tests.

The tooling is mature, the images are maintained by Google and rebuilt with security patches, and the migration for a typical microservice takes an afternoon. There's no reason your production Node.js API needs a full Debian userland — leave that at home.

Your containers should be boring, minimal, and hard to misuse. Distroless gets you most of the way there for free.
