---
title: "Stop Saying 'Works on My Machine' — Local-Prod Parity Tricks That Actually Stick 🖥️"
date: 2026-06-21
excerpt: "The gap between your laptop and production is where bugs hide in plain sight. Here are the tools and tricks I use at Cubet to keep local dev embarrassingly close to the real thing."
tags: ["devops", "developer-tooling", "platform-engineering", "local-dev", "docker-compose", "productivity"]
featured: true
---

We've all been there. A feature works flawlessly in your local environment, sails through staging, and then the moment it hits production — chaos. An environment variable is slightly different. A dependency version doesn't match. Postgres is 14 locally and 16 in prod. The S3 bucket has a different CORS policy. The queue isn't running. Some config flag that nobody wrote down is toggled the wrong way.

"Works on my machine" is the original distributed systems problem, and it's been embarrassing developers since the dawn of the `diff` command.

The good news: local-prod parity isn't magic. It's mostly discipline plus a few tools that stop you from drifting. Here's the setup I've settled on at Cubet after too many incidents traced back to a misconfigured local environment.

## Why the Gap Exists (And Why It Widens Over Time)

The gap isn't usually created in a single moment. It accumulates. A developer installs a newer version of Redis because the old one didn't compile on their M2 Mac. Someone tweaks an env var locally to skip OAuth during development and forgets to document it. A new service dependency gets added to production but doesn't make it into `docker-compose.yml` for three sprints.

Before you know it, your local environment is running a completely different software stack than production — it just doesn't *look* like it.

The fix isn't to perfectly mirror production down to every detail (you can't, and you'd hate the result). The goal is **meaningful parity**: same versions of core dependencies, same config shape, same service topology. Close enough that bugs in prod reproduce locally in under five minutes.

## Trick 1: Lock Everything, Seriously

The fastest way to drift is to leave versions un-pinned. In your `docker-compose.yml`, this:

```yaml
services:
  db:
    image: postgres
  cache:
    image: redis
```

…will silently pull different versions every time someone `docker compose pull`s. Three months later, your CI is on Postgres 15, half the team is on 14, and production is on 16 because DevOps upgraded it "to stay current."

Pin the minor version and call it a day:

```yaml
services:
  db:
    image: postgres:16.3-alpine
  cache:
    image: redis:7.2-alpine
  queue:
    image: rabbitmq:3.13-management-alpine
```

Put these in a `versions.env` file at the repo root, reference it in the Compose file with `env_file`, and create a single PR when you want to upgrade. Now everyone's running the same versions, the upgrade is visible in git history, and your CI can pin to the same file.

## Trick 2: Use a `.env.example` That's Actually Useful

Most projects have a `.env.example` file that's a cemetery of commented-out keys with placeholder values like `YOUR_VALUE_HERE`. Developers copy it, fill in five of the thirty keys, and wonder why things break.

The trick that changed things for us at Cubet: make `.env.example` a **working default** for local development. Real values — safe local credentials, feature flags set to the right defaults, service URLs pointing at the Docker Compose stack.

```bash
# .env.example — copy to .env, override what you need
APP_ENV=local
APP_DEBUG=true

DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=myapp
DB_PASS=localdevonly

REDIS_HOST=localhost
REDIS_PORT=6379

# AWS — point at localstack in dev, real credentials in prod
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1

FEATURE_NEW_ONBOARDING=true
```

The rule: if a new developer can clone the repo, copy `.env.example` to `.env`, run `docker compose up`, and have a working app in ten minutes — your parity is good. If they can't, something is broken and you've just discovered it before production did.

## Trick 3: Run the Real Dependencies, Not the Fakes

This one's a bit uncomfortable: **stop mocking AWS services locally**. Mock S3 in your unit tests, sure. But for integration and manual testing, run LocalStack instead.

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack:3.5
    ports:
      - "4566:4566"
    environment:
      SERVICES: s3,sqs,secretsmanager,ses
      DEFAULT_REGION: us-east-1
    volumes:
      - ./scripts/localstack-init:/etc/localstack/init/ready.d
```

That init directory can hold bootstrap scripts that pre-create your S3 buckets and SQS queues automatically:

```bash
#!/bin/bash
# scripts/localstack-init/01-setup.sh
awslocal s3 mb s3://my-app-uploads
awslocal sqs create-queue --queue-name job-queue
awslocal secretsmanager create-secret \
  --name /myapp/api-key \
  --secret-string "local-dev-key-not-real"
```

Now when you test file uploads locally, they go through the same S3 SDK path they'd use in production, complete with presigned URLs and lifecycle policies. Bugs that only surface due to SDK behavior — and there are more of those than you'd expect — show up locally instead of on a Tuesday at 3am.

## Trick 4: Teach Your Compose File to Know the Environment

One pattern I've seen work well on larger teams: a thin wrapper script that assembles the Compose stack based on `APP_ENV`. Developers run `./dev up` instead of `docker compose up`, and the script layers in the right override files.

```bash
#!/bin/bash
# dev
ENV=${APP_ENV:-local}
docker compose \
  -f docker-compose.yml \
  -f "docker-compose.${ENV}.yml" \
  "$@"
```

The base `docker-compose.yml` defines the service topology. `docker-compose.local.yml` overrides ports, mounts code as volumes for hot reload, and adds LocalStack. `docker-compose.ci.yml` removes volume mounts (CI doesn't need live reload) and tweaks health check intervals for faster startup.

Same topology. Different tuning. No surprises when something works in CI but not locally.

## The Parity Contract

Local-prod parity isn't a destination, it's a contract you keep with your future self. The way I think about it: every time you add a new service to production, a PR should exist that adds it to `docker-compose.yml`. Every new env var in production should have a sensible default in `.env.example`. Every version bump in production should come with a version bump in Compose.

If that discipline slips — and it will, because shipping features is always more urgent — do a quarterly parity audit. Run `docker compose config` locally, compare it against your actual infrastructure config, and close the gaps. It's boring work. It will save you hours of production debugging.

The goal isn't perfection. It's that when something breaks in production, your first instinct is "let me reproduce this locally" — and that actually works.

---

What does your local dev setup look like? Are you running the real dependencies or stitching together mocks and hoping? I'd love to hear what's working (or what's haunting you) — find me on [GitHub](https://github.com/kpanuragh) or drop a comment below.
