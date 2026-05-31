---
title: "📦 Dev Containers: Stop Saying 'It Works on My Machine'"
date: "2026-05-31"
excerpt: "\"Works on my machine\" is a meme because it's true — local dev environments are a mess of mismatched Node versions, conflicting Python deps, and that one guy who still runs macOS Catalina. Dev containers fix this. Here's how to actually use them."
tags:
  - devops
  - platform-engineering
  - containers
  - developer-tooling
  - dx
featured: true
---

# 📦 Dev Containers: Stop Saying "It Works on My Machine"

"Works on my machine" is the phrase that ends friendships, derails deployments, and turns a two-hour onboarding into a two-day yak-shaving marathon. You've lived it. New engineer joins the team, spends day one installing the right Node version, day two figuring out why `npm install` explodes, and day three realizing the README was last updated in 2019 and now refers to a tool that no longer exists.

The root cause is always the same: **local development environments are snowflakes**. Every developer's machine is a unique combination of OS versions, package managers, shell configs, and deeply personal `.bash_profile` crimes. Production runs in a container. Your laptop does not.

Dev containers fix this. Not perfectly, not magically — but practically. Let me show you how.

## What Is a Dev Container?

A dev container is a Docker container that you do your development *inside*. Your editor (VS Code, Cursor, JetBrains) runs on your host machine, but the terminal, the language runtime, the database, the linter, the test runner — all of that runs inside a container defined by a `devcontainer.json` file checked into the repo.

The key insight: **the dev environment is code**. It lives next to your application code, gets reviewed like your application code, and changes when your application code changes.

If you onboard a new developer, they clone the repo, open it in VS Code, click "Reopen in Container," and they're running in the exact same environment as everyone else. No README, no setup script, no tribal knowledge required.

At Cubet, we adopted dev containers for a complex Laravel + Node + React monorepo that had accumulated years of "you need to install this one native extension manually" debt. Onboarding went from half a day of pain to under twenty minutes. That's the pitch.

## The devcontainer.json File

Everything starts with `.devcontainer/devcontainer.json`:

```json
{
  "name": "My API",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",

  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-azuretools.vscode-docker"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode"
      }
    }
  },

  "postCreateCommand": "npm install",
  "remoteUser": "node"
}
```

A few things worth noting here:

- **`features`** are pre-built dev container feature bundles. You pull in Node 20, the GitHub CLI, whatever you need, without writing a custom Dockerfile for each tool.
- **`customizations.vscode`** means every developer on the team gets the same extensions and settings automatically. No more "you need to install ESLint manually" in the README.
- **`postCreateCommand`** runs once after the container is created. Use it for `npm install`, `bundle install`, database migrations — whatever gets the project to a runnable state.

## Composing the Full Stack

Real projects aren't just an app — they need a database, a cache, maybe a message queue. Here's where dev containers get seriously powerful. Pair `devcontainer.json` with a `docker-compose.yml` that defines the whole local stack:

```yaml
# .devcontainer/docker-compose.yml
version: "3.9"

services:
  app:
    build:
      context: ..
      dockerfile: .devcontainer/Dockerfile
    volumes:
      - ..:/workspace:cached
      - node_modules:/workspace/node_modules
    command: sleep infinity
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/appdb
      REDIS_URL: redis://cache:6379

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: appdb
    volumes:
      - postgres_data:/var/lib/postgresql/data

  cache:
    image: redis:7-alpine

volumes:
  node_modules:
  postgres_data:
```

Notice `node_modules` as a named volume. This is a critical trick: if you mount your entire workspace from the host, `node_modules` on macOS runs through the OSXFS layer and becomes *painfully* slow. Isolating it to a named volume means npm installs happen at Linux speed inside the container. Your `npm run dev` goes from "I can get a coffee" to "it's already hot-reloading."

## Dockerfile for the Dev Container

The `devcontainer.json` points to a `Dockerfile` for the development image. Unlike your production Dockerfile, the dev one should be fat and friendly:

```dockerfile
# .devcontainer/Dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install global tooling once at image build time
RUN npm install -g tsx ts-node

WORKDIR /workspace

# Non-root user (node user ships with the base image)
USER node
```

You're not worried about image size here — this never ships to production. Include the postgres client so you can `psql` directly from the terminal. Add `git` so git operations work. Add `curl` for debugging. Your prod image stays lean; your dev image is a comfortable workshop.

## Lifecycle Scripts: More Than Just postCreateCommand

There are several lifecycle hooks worth knowing:

- **`postCreateCommand`**: runs once when the container is first created. Good for `npm install`.
- **`postStartCommand`**: runs every time the container starts. Good for starting background watchers.
- **`postAttachCommand`**: runs when you attach an editor session. Good for displaying a "you're ready" message.
- **`initializeCommand`**: runs on the *host* before the container starts. Good for pulling secrets from 1Password or Vault into a `.env` file that the container then reads.

That last one is underused. Instead of checking `.env` files into the repo (a bad habit) or writing a README step that says "ask someone for the `.env`," use `initializeCommand` to script the secret-fetch once. Everyone gets their secrets, and it's reproducible.

## What It Looks Like in Practice

After you've set this up, the developer experience is:

1. `git clone` the repo
2. Open in VS Code
3. VS Code detects `.devcontainer/` and prompts "Reopen in Container" — click it
4. First time: the image builds (takes a few minutes, cached after that)
5. You're in the container. `npm run dev` works. The database is running. The linter is installed. The right Node version is active.

For subsequent opens: container starts in ~5 seconds. Everything just works.

## The Limitations (Be Honest)

Dev containers aren't free:

- **Docker Desktop on macOS has performance quirks**. Volume mounts are slower than native. The `node_modules` named volume trick above is a patch, not a fix. For very I/O-heavy workflows, you might still feel it.
- **GPU access is awkward**. If you're doing ML work, getting GPU passthrough set up is non-trivial.
- **Image build times on CI**. If you're rebuilding the dev container in CI (for integration tests that mirror the dev env), you need a solid caching strategy or it'll eat your pipeline time.
- **Not everyone adopts**. Dev containers require VS Code, Cursor, or a JetBrains IDE with the right plugin. The engineer who lives in vim and refuses to change will route around it.

That last one is the organizational challenge, not the technical one. Tools only help if people use them.

## The Bigger Win

The reason I push dev containers on every new project at Cubet isn't really onboarding time. It's **consistency between development and production**. When your dev container runs the same Node version, the same Linux base, the same dependencies as your production container, a whole class of "but it worked locally" bugs simply doesn't happen.

The environment is code. Version it, review it, keep it in sync. Your future teammates — and your future self at 2am debugging a staging issue — will thank you.

---

If your team is still sharing a setup Notion doc that's six steps out of date, try adding a `.devcontainer/` directory to your next project. The first setup takes a couple of hours. The time it saves starts paying back immediately.

What's your dev environment setup right now — bare metal, dotfiles, VMs, or already on dev containers? Genuinely curious what's working.
