---
title: "🐳 Docker Compose in Production: The Controversial Setup That Actually Saves Small Teams"
date: "2026-03-20"
excerpt: "Everyone says 'don't use docker-compose in production, use Kubernetes.' After running it in prod for 3 years without incident, I'd like to respectfully disagree — for the right use case."
tags: ["\\\"devops\\\"", "\\\"docker\\\"", "\\\"deployment\\\"", "\\\"ci-cd\\\"", "\\\"infrastructure\\\""]
featured: "true"
---

# 🐳 Docker Compose in Production: The Controversial Setup That Actually Saves Small Teams

Let me say the quiet part loud: I've been running docker-compose in production for three years on multiple client projects, and I have never once regretted it.

Go ahead, take a moment. I'll wait.

Now before the Kubernetes evangelists in the back start drafting their replies — I know. I know K8s is the industry standard. I know it auto-heals and scales horizontally and has a cool logo. I also know that for a 3-person startup shipping a Laravel API and a React frontend to a single $20 DigitalOcean droplet, it is catastrophically overkill.

Let me show you what "good enough" actually looks like, and why that's sometimes the right answer.

## 🚨 The Deployment Horror Story That Changed My Thinking

Back in 2022, I inherited a project from a developer who had left in a hurry. The app was "containerized" — technically true. It was running in a Docker container. On the server. Started manually. With a `docker run` command copy-pasted into a notes app. No compose file. No restart policy. No nothing.

Every deployment was an SSH session, a panicked `docker ps`, and a prayer.

I didn't migrate to Kubernetes. I wrote a `docker-compose.yml` and a 20-line deploy script. The client got 99.9% uptime. The team got their sanity back. I got a thank-you card (okay, a Slack message, but still).

## 🏗️ What the Setup Actually Looks Like

Here's a real-world production `docker-compose.yml` for a Laravel + PostgreSQL + Redis stack:

```yaml
version: '3.8'

services:
  app:
    image: ghcr.io/yourorg/your-app:${APP_VERSION:-latest}
    restart: unless-stopped
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    volumes:
      - storage:/var/www/html/storage/app

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - app
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    env_file: .env.db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  queue:
    image: ghcr.io/yourorg/your-app:${APP_VERSION:-latest}
    restart: unless-stopped
    command: php artisan queue:work --tries=3 --timeout=60
    env_file: .env
    depends_on:
      - db
      - redis
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  storage:
```

Notice a few things: `restart: unless-stopped` means your services come back after a server reboot without you doing anything. The `healthcheck` conditions on `depends_on` mean your app won't start before your database is actually ready — not just "started," but *healthy*. I learned that distinction the hard way after watching 400 "database connection refused" errors during a deploy at 2 AM.

## 🚀 The Deploy Script That Actually Works

Here's the zero-drama deploy script we use with GitHub Actions:

```bash
#!/bin/bash
set -euo pipefail

APP_VERSION=$1
SERVER=$2

echo "🚀 Deploying version $APP_VERSION to $SERVER"

# Pull the new image before taking anything down
ssh deploy@$SERVER "docker pull ghcr.io/yourorg/your-app:$APP_VERSION"

# Run migrations (before swapping the app)
ssh deploy@$SERVER "
  docker run --rm \
    --env-file /app/.env \
    --network app_app-network \
    ghcr.io/yourorg/your-app:$APP_VERSION \
    php artisan migrate --force
"

# Swap the app container with zero (well, minimal) downtime
ssh deploy@$SERVER "
  cd /app && \
  APP_VERSION=$APP_VERSION docker compose up -d --no-deps app queue
"

echo "✅ Deploy complete"
```

And the GitHub Actions workflow that calls it:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/yourorg/your-app
          tags: type=sha,prefix=

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
        run: |
          echo "$SSH_KEY" > /tmp/deploy_key
          chmod 600 /tmp/deploy_key
          export GIT_SSH_COMMAND="ssh -i /tmp/deploy_key -o StrictHostKeyChecking=no"
          bash scripts/deploy.sh ${{ needs.build-and-push.outputs.version }} prod.yourapp.com
```

The key insight here: we pull the new image *before* stopping the old container. The migration runs in a standalone container against the live database. The actual `docker compose up -d` swap takes about 2-3 seconds. Not zero downtime, but close enough for most apps.

## 🔄 The Before/After

**Before** (the chaos I inherited):

- SSH into server
- `docker ps` to find container name
- `docker stop [guessed-name]`
- `docker pull` (hope the registry is reachable)
- `docker run` (copy-paste from notes, pray the flags are right)
- `docker exec` to run migrations
- Tail logs and hope
- Average deploy time: 20+ nervous minutes

**After** (with compose + CI):

- Push to `main`
- GitHub Actions builds, tags, pushes image
- Runs migrations in isolated container
- Swaps containers
- Average deploy time: 4-6 minutes, fully automated

The team stopped dreading deployments. That matters more than people admit.

## ⚠️ When NOT to Use This Approach

I'm not out here saying docker-compose is always the answer. It absolutely isn't:

- **Multiple servers?** You need an orchestrator. Kubernetes, Nomad, or at minimum Docker Swarm.
- **Horizontal scaling under load?** Compose can't help you there.
- **Compliance requirements?** K8s audit logging and RBAC will save you.
- **Team of 10+ engineers?** The operational complexity of K8s starts paying off.

The honest answer is: if you can fit your entire app on one server and your traffic doesn't require horizontal scaling, the complexity tax of Kubernetes is a real cost with no corresponding benefit.

## 🛡️ The Pitfalls That Will Bite You

After countless deployments with this setup, here are the gotchas I've hit:

**1. Volume permissions after restarts.** If your app writes to a named volume, check that the container user can actually write to it. The `unless-stopped` restart policy will happily restart your container into a permission-denied loop at 3 AM.

**2. Dangling images filling your disk.** After a month of daily deploys, you'll have gigabytes of old images sitting around. Add this to your cron:

```bash
# Clean up images older than 24h
0 3 * * * docker image prune -af --filter "until=24h" >> /var/log/docker-prune.log 2>&1
```

**3. The .env file.** Keep it out of git. Keep a `.env.example` in git. Use something like `dotenv-vault` or AWS Secrets Manager to manage the real one. Docker taught me the hard way that a secret in a public GitHub repo has a half-life of about 45 seconds.

## 🎯 TL;DR

Docker Compose in production isn't the "wrong" answer — it's the *right-sized* answer for a specific context. Small team, single server, straightforward stack: it works beautifully when you set it up properly.

The secret is treating your compose file and deploy script as first-class infrastructure, not an afterthought. Add health checks. Add restart policies. Automate with CI. Pull before you stop. Run migrations in isolated containers.

You don't need to run Kubernetes to have reliable deployments. You need to have *thoughtful* deployments. Sometimes those look very different.

---

**Running docker-compose in production and getting judged for it?** Find me on the internet — I'll co-sign your life choices. And if you've been burned by this approach and migrated away, I'd genuinely love to hear why. Every war story is a lesson. 🐳
