---
title: "🔑 BuildKit Secrets: Stop Baking Credentials Into Your Docker Images"
date: "2026-05-25"
excerpt: "Every time you copy a .env file into a Docker image or run pip install with a private token, you're writing credentials into an immutable layer that anyone with docker history can read. Here's how BuildKit secrets actually fix this."
tags: ["docker", "buildkit", "security", "containers", "devops"]
featured: true
---

You've done it. I've done it. We've all done it at 2am when CI is failing and the private npm registry just won't authenticate.

```dockerfile
COPY .npmrc /root/.npmrc
RUN npm ci
RUN rm /root/.npmrc  # it's fine, I deleted it
```

It's not fine. The credentials are still there. They will always be there.

## Layers Are Forever (Or At Least Until You Squash Them)

Docker images are built in stacked layers. Every `RUN`, `COPY`, and `ADD` instruction creates a new one. When you delete a file in a subsequent layer, you're not removing it — you're adding a "whiteout" marker on top. The original data sits in the lower layer, completely intact, readable by anyone who runs:

```bash
docker history my-app:latest
docker save my-app:latest | tar xf - | grep -r "npm_token"
```

Or the tool that makes this painfully obvious:

```bash
dive my-app:latest
```

`dive` will walk you through every file added and removed in every layer. Including your `.npmrc` with the auth token. Including the SSH key you "only temporarily" added for that one private repo. Including the `.env` file someone thought was `.dockerignored` but wasn't — because they had a typo in the filename.

At Cubet we had a team member who added a private PyPI registry token as a `--build-arg`, hit a cache miss, and watched it print to plain text in the CI logs. The image was already pushed to the registry. Two hours of credential rotation across three environments followed. Great afternoon.

## Enter BuildKit Secrets

BuildKit (Docker's build engine, enabled by default since Docker 23) has a `--mount=type=secret` feature that solves this properly. The secret is made available inside a single `RUN` step as a file at `/run/secrets/<id>`, and it is **never included in any image layer**. Not as a whiteout. Not in history. Not anywhere.

```dockerfile
# syntax=docker/dockerfile:1.4

FROM node:20-alpine AS build

# This .npmrc exists only for the duration of this RUN step
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci

COPY . .
RUN npm run build

FROM node:20-alpine
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
```

Build it like this:

```bash
docker build \
  --secret id=npmrc,src=$HOME/.npmrc \
  -t my-app:latest .
```

That's it. The `.npmrc` exists for the duration of that one `RUN` command, then it's gone. `dive` finds nothing. `docker history` shows `RUN --mount=type=secret...` but not the file contents. The credential never touched a layer.

## SSH Agent Forwarding for Private Repos

Private Git dependencies are the other classic footgun. The instinct is to copy in an SSH key:

```dockerfile
# DON'T DO THIS — key ends up in a layer forever
COPY id_rsa /root/.ssh/id_rsa
RUN git clone git@github.com:your-org/private-lib.git
RUN rm /root/.ssh/id_rsa
```

BuildKit handles this with `--mount=type=ssh`:

```dockerfile
# syntax=docker/dockerfile:1.4

FROM golang:1.22 AS build

RUN --mount=type=ssh \
    go mod download

COPY . .
RUN go build -o /app ./cmd/server
```

Build it with your SSH agent loaded:

```bash
ssh-add ~/.ssh/id_rsa

docker build \
  --ssh default \
  -t my-go-app:latest .
```

The build container gets a socket to forward SSH auth through. Your private key never touches the image filesystem. Works cleanly for private Go modules, private Python packages, Composer private repos — anything that needs SSH auth during the build.

## CI/CD Integration

This is where the payoff is obvious. In GitHub Actions:

```yaml
- name: Build and push image
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ghcr.io/your-org/your-app:latest
    secrets: |
      npmrc=${{ secrets.NPMRC_TOKEN }}
```

The `docker/build-push-action` handles the `--secret` flag for you. Your GitHub Actions secret goes directly into the BuildKit secret mount, never touches disk on the runner, never ends up in a layer, never appears in build logs. That's the whole chain locked down.

## Wait, Doesn't `.dockerignore` Fix This?

It helps for `COPY` mistakes, but it's not sufficient on its own.

`.dockerignore` prevents files from being sent to the build context. If you never `COPY .env` into the image, it won't be there. But:

- `ARG` values are visible in `docker history` — logging `RUN echo $SECRET_TOKEN` for debugging will immortalize it in the layer
- `.dockerignore` glob patterns are easy to get wrong; files sneak through
- CI systems that inject credentials via `--build-arg` also land them in history
- Multi-stage builds where you `COPY --from=build` can accidentally carry secrets across stages if you're not careful

BuildKit secrets sidestep all of this. The credential is never in the build context, never in the Dockerfile text, never in a layer.

## Auditing Existing Images

Not sure whether your production images have credentials baked in? Check now:

```bash
# Install dive: github.com/wagoodman/dive
dive your-image:tag

# Or the manual layer inspection approach
docker save your-image:tag | tar xO --wildcards '*/layer.tar' 2>/dev/null \
  | tar tv 2>/dev/null \
  | grep -E '\.(env|npmrc|pem|key|cfg|token)'
```

If you find something, rotate the credential immediately — before you fix anything else. Then fix the Dockerfile.

## The Pattern to Follow

1. **Never use `ARG` for secrets.** `ARG` ends up in `docker history`.
2. **Never copy credential files and delete them in a later layer.** Layers are immutable.
3. **Use `--mount=type=secret` for file-based credentials** — tokens, `.npmrc`, pip config, service account keys.
4. **Use `--mount=type=ssh` for SSH-authenticated operations** — private repos, private Composer packages, anything that needs `git clone` over SSH.
5. **Audit with `dive`** after any Dockerfile change that touches credentials.

BuildKit's secret mounting has been production-ready for years, but it's one of those features that only surfaces after you've already made the expensive mistake. The Docker docs cover it, but nobody reads the docs until something burns.

If your containers touch private infrastructure — internal registries, private GitHub repos, cloud credentials for build-time config pulls — this is table stakes, not a nice-to-have. Your images are artifacts that get pushed, cached, copied, and sometimes leaked. What's in their layers is permanent.

Go audit your `docker history` output right now. I'll wait.
