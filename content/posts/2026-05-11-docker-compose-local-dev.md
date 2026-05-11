---
title: "🐳 Docker Compose for Local Dev: Stop Saying 'It Works on My Machine'"
date: 2026-05-11
excerpt: "The classic excuse that haunts every engineering team. Your laptop runs the app flawlessly; production explodes on deploy. Docker Compose is the cure — if you wire it up correctly. Let's build a local environment so tight that 'it works on my machine' becomes a flex, not an apology."
tags: ["docker", "devops", "docker-compose", "local-development", "ci-cd"]
featured: true
---

We've all been there. You demo a feature to your team, everything's silky smooth. Thirty minutes later, a colleague clones the repo, runs the app, and it immediately crashes with some cryptic database connection error that you've *never* seen in your life.

"Weird," you say. "It works on my machine."

This phrase is the engineering equivalent of "the cheque is in the mail." Nobody believes it, and everyone's had to say it at least once. The good news? Docker Compose exists, and when set up properly, it makes your local environment virtually identical to production — which means fewer surprises, faster onboarding, and a lot less blame-shifting.

## What Is Docker Compose, Actually?

Docker Compose is a tool for defining and running multi-container applications. Instead of spinning up a Postgres database manually, then a Redis cache, then your API, then your frontend — each with their own config flags you'll forget by tomorrow — you describe the whole stack in a single `docker-compose.yml` file and run:

```bash
docker compose up
```

One command. Everything running. Reproducible across every developer's machine.

## The Setup That Actually Works in the Real World

Here's a battle-tested `docker-compose.yml` for a typical web app with a Node API, Postgres, and Redis:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - DATABASE_URL=postgres://user:password@db:5432/myapp
      - REDIS_URL=redis://cache:6379
      - NODE_ENV=development
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: myapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5

  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

A few things worth calling out here:

**`depends_on` with `condition: service_healthy`** — this is the bit most people skip, then wonder why their API crashes on startup because Postgres wasn't ready yet. The `healthcheck` on the `db` service tells Docker when it's actually accepting connections, not just when the container started.

**The double volume trick for Node** — mounting `.:/app` gives you live reloads, but `/app/node_modules` as a second volume prevents your host machine's `node_modules` from overwriting the container's. This one bites *everyone* the first time they develop across different operating systems.

**Named volumes for data** — `postgres_data:` means your database survives container restarts. Without this, every `docker compose down` wipes your local data. Surprise!

## The `.env` File: Your Secret Weapon (And Security Landmine)

Compose automatically picks up a `.env` file in the same directory. Use it for values that change between environments:

```bash
# .env.example  ← commit this
POSTGRES_PASSWORD=change_me_locally
API_SECRET_KEY=dev_key_not_for_prod

# .env  ← add to .gitignore immediately
POSTGRES_PASSWORD=my_actual_local_password
API_SECRET_KEY=supersecretdevkey123
```

Commit `.env.example` with placeholder values. Put `.env` in your `.gitignore`. This sounds obvious until you find a teammate's production database password in git history and have to rotate everything at 2am. Ask me how I know.

## Real Lessons Learned the Hard Way

**Lesson 1: Match your production image as closely as possible.** It's tempting to use `node:22` in dev and `node:22-alpine` in production because Alpine is smaller. Those are different base images with different system libraries. The day you ship a dependency that behaves differently on Alpine, you'll spend an afternoon debugging a problem that doesn't exist on your laptop.

**Lesson 2: `docker compose down -v` will ruin your afternoon if you're not careful.** The `-v` flag removes named volumes. Great for a clean reset, catastrophic if you've been seeding hours of test data. Make it a habit to run plain `docker compose down` by default.

**Lesson 3: Pin your image versions.** `image: postgres:latest` is a promise to future-you that something will break unexpectedly on a random Tuesday when Postgres releases a new major version. Use `postgres:16.3-alpine` and update deliberately.

**Lesson 4: Use `docker compose logs -f api` instead of hunting through combined output.** Tailing logs for a specific service saves serious sanity when you've got five containers shouting at once.

## Wire It Into Your CI Pipeline Too

Here's the kicker: the same Compose file can drive your CI tests. In GitHub Actions:

```yaml
- name: Run tests
  run: |
    docker compose -f docker-compose.yml up -d db cache
    docker compose run --rm api npm test
    docker compose down -v
```

Now CI uses the exact same database version and config as local development. The "it passes locally but fails in CI" problem shrinks dramatically.

## The Payoff

When Docker Compose is set up well, onboarding a new developer goes from "follow this 47-step setup doc and pray" to:

1. Clone the repo
2. Copy `.env.example` to `.env`
3. `docker compose up`
4. Start contributing

That's it. No "oh you also need to install this system dependency." No "actually that only works on macOS." Just a working environment, every time, on every machine.

The next time someone on your team says "it works on my machine," your answer should be: "Great — let's make sure it works in Docker Compose so it works on *every* machine." Then send them this post.

---

**Try it today:** Take one project where onboarding is painful and write a `docker-compose.yml` for it. Start simple — just the database and your app. You'll be surprised how quickly "it works on my machine" transforms into "it works, period."

What's your messiest local dev setup horror story? Drop it in the comments — I need validation that I'm not alone.
