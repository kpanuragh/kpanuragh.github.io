---
title: "Makefile for DevOps: Stop Typing the Same Commands 47 Times a Day ⚙️"
date: "2026-03-06"
excerpt: "After countless deployments, I kept forgetting whether it was `docker compose up --build -d` or `docker-compose up -d --build`. A Makefile fixed my life. Let me fix yours too."
tags: ["\\\"devops\\\"", "\\\"automation\\\"", "\\\"ci-cd\\\"", "\\\"productivity\\\""]
featured: "true"
---

# Makefile for DevOps: Stop Typing the Same Commands 47 Times a Day ⚙️

**Honest confession:** I once typed `docker compose exec app php artisan migrate --force` in production when I meant staging. Not my finest hour. The database didn't care about my feelings. 😰

I also watched a new teammate spend 40 minutes on their first day asking "wait, how do I run the dev server again?" while the rest of us argued about whether it was `npm run dev`, `npm start`, or `php artisan serve`. We had three different answers. All of us were right. None of us were right. It was beautiful chaos.

A Makefile fixed all of this. One file. 30 years old. Still absolutely slaps.

## Wait, Isn't Make for C Compilers? 🤔

Yes. Also no. Make was built to compile C programs in 1976. But the thing it actually does — **run named commands in sequence** — turns out to be useful for basically everything.

Think of a Makefile as your project's cheat sheet that actually runs the commands:

```bash
# Without Makefile (the dark ages):
docker compose down && docker compose up --build -d && docker compose exec app php artisan migrate

# With Makefile:
make fresh
```

That's it. That's the pitch.

Every time you catch yourself copying a command from Slack history or scrolling through your bash history with Ctrl+R — that command belongs in a Makefile.

## The Deployment Horror Story That Made Me a Makefile Believer 💀

**2022. Friday. 4:47 PM. (Of course.)**

We were deploying a hotfix to our Laravel e-commerce app on AWS. I had three terminal tabs open — staging, production, and local. After countless deployments, I thought I had the muscle memory down cold.

I ran the deploy command in what I thought was the staging tab.

Production database. Truncated. Wrong migration. Gone.

`php artisan migrate:fresh` is a very enthusiastic command. It does not ask twice.

```bash
# The command that haunts my dreams:
php artisan migrate:fresh --seed

# What it does:
# ✅ Drops all tables
# ✅ Re-runs all migrations
# ✅ Seeds with fake data
# ❌ Your real user data: GONE
# ❌ Your orders: GONE
# ❌ Your Friday afternoon: GONE
```

After that incident, I built a Makefile where **destructive commands require an environment flag** and **production commands have confirmation prompts**. I haven't had that problem since. (I've had new problems. But not that one.)

## Your First Makefile: The Basics 📝

Drop a file called `Makefile` in your project root. No extension. Capital M.

```makefile
# The most important line in any Makefile:
.PHONY: help dev build test deploy

# Default target: show help when someone types `make`
help:
	@echo "Available commands:"
	@echo "  make dev        - Start development environment"
	@echo "  make build      - Build production image"
	@echo "  make test       - Run test suite"
	@echo "  make deploy     - Deploy to production"
	@echo "  make logs       - Tail production logs"
```

**The `.PHONY` line:** Tells Make these aren't files to build — they're just command aliases. Always include it. Don't ask. Just include it.

**The `@` prefix:** Runs the command silently (doesn't echo the command before running). Matters for clean output.

Now run `make` and see your help menu. Beautiful.

## A Real-World Makefile for a Laravel + Docker Project 🐳

This is almost exactly what I use across projects. Copy, adapt, ship:

```makefile
.PHONY: help dev build fresh test lint deploy rollback logs shell db-shell

# Variables
APP_NAME=myapp
ENV?=staging
DOCKER_REGISTRY=ghcr.io/myorg/$(APP_NAME)
GIT_SHA=$(shell git rev-parse --short HEAD)

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Local Development ───────────────────────────────────────────────────────

dev: ## Start dev environment (builds if needed)
	docker compose up --build -d
	@echo "✅ Dev environment running at http://localhost:8000"

stop: ## Stop dev environment
	docker compose down

fresh: ## Nuke everything and start fresh (⚠️  local only)
	docker compose down -v
	docker compose up --build -d
	sleep 5
	docker compose exec app php artisan migrate:fresh --seed
	@echo "🌱 Fresh environment ready!"

logs: ## Tail application logs
	docker compose logs -f app

shell: ## Open shell in app container
	docker compose exec app bash

db-shell: ## Open database shell
	docker compose exec db mysql -u root -proot myapp_db

# ─── Testing ─────────────────────────────────────────────────────────────────

test: ## Run full test suite
	docker compose exec app php artisan test --parallel

test-filter: ## Run specific test (usage: make test-filter FILTER=UserTest)
	docker compose exec app php artisan test --filter=$(FILTER)

lint: ## Run code linter
	docker compose exec app ./vendor/bin/pint --test
	docker compose exec app ./vendor/bin/phpstan analyse

# ─── Building ────────────────────────────────────────────────────────────────

build: ## Build and push Docker image (tagged with git SHA)
	docker build -t $(DOCKER_REGISTRY):$(GIT_SHA) -t $(DOCKER_REGISTRY):latest .
	docker push $(DOCKER_REGISTRY):$(GIT_SHA)
	docker push $(DOCKER_REGISTRY):latest
	@echo "📦 Pushed $(DOCKER_REGISTRY):$(GIT_SHA)"

# ─── Deployment ──────────────────────────────────────────────────────────────

deploy: build ## Build and deploy (usage: make deploy ENV=production)
	@echo "🚀 Deploying to $(ENV)..."
	@if [ "$(ENV)" = "production" ]; then \
		read -p "⚠️  Deploy to PRODUCTION? [y/N] " confirm; \
		[ "$$confirm" = "y" ] || (echo "Cancelled." && exit 1); \
	fi
	kubectl set image deployment/$(APP_NAME) \
		app=$(DOCKER_REGISTRY):$(GIT_SHA) \
		-n $(ENV)
	kubectl rollout status deployment/$(APP_NAME) -n $(ENV)
	@echo "✅ Deployed $(GIT_SHA) to $(ENV)!"

rollback: ## Rollback last deployment (usage: make rollback ENV=production)
	@echo "⏪ Rolling back $(ENV)..."
	kubectl rollout undo deployment/$(APP_NAME) -n $(ENV)
	kubectl rollout status deployment/$(APP_NAME) -n $(ENV)
	@echo "✅ Rollback complete!"

migrate: ## Run database migrations (usage: make migrate ENV=staging)
	@echo "📀 Running migrations on $(ENV)..."
	kubectl exec -n $(ENV) deployment/$(APP_NAME) -- php artisan migrate --force
```

**What makes this great:**

- `make help` auto-generates from `## comments` (that grep line is magic)
- `ENV?=staging` defaults to staging, so you can't accidentally prod-nuke yourself
- Production asks for confirmation before proceeding
- Commands are documented, searchable, and consistent across the team

## The "Help" Auto-Generator: My Favourite Trick 🎩

That weird `grep` command for the `help` target? Let me break it down:

```makefile
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
```

Any target with `## Some description` after it gets listed automatically:

```bash
$ make help
  dev                  Start dev environment (builds if needed)
  stop                 Stop dev environment
  fresh                Nuke everything and start fresh (⚠️  local only)
  test                 Run full test suite
  build                Build and push Docker image (tagged with git SHA)
  deploy               Build and deploy (usage: make deploy ENV=production)
  rollback             Rollback last deployment
```

**A CI/CD pattern that saved our team:** New engineers run `make help` and know exactly what to do. Zero Slack questions. Zero 40-minute onboarding sessions. 🎯

## Makefile for GitHub Actions: Less Copy-Paste, More Sanity 🤖

Before Makefile, our GitHub Actions YAML looked like this nightmare:

```yaml
# Before: Copy-paste hell
- name: Build
  run: |
    docker build \
      --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
      --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
      -t ghcr.io/myorg/myapp:$(git rev-parse --short HEAD) \
      -t ghcr.io/myorg/myapp:latest \
      .
    docker push ghcr.io/myorg/myapp:$(git rev-parse --short HEAD)
    docker push ghcr.io/myorg/myapp:latest
```

After Makefile, the same GitHub Actions YAML:

```yaml
# After: Clean, DRY, consistent
- name: Build and Push
  run: make build

- name: Deploy to Staging
  run: make deploy ENV=staging

- name: Run Tests
  run: make test
```

**Same commands your developers run locally now run in CI.** No more "but it works on my machine" — because CI uses the exact same Makefile targets as your laptop. 🙌

## Before/After: Onboarding a New Developer 🧑‍💻

**Before Makefile (actual Slack thread from 2021):**

> **New dev:** "how do i start the project?"
>
> **Dev 1:** "just do docker compose up"
>
> **Dev 2:** "actually you need --build first"
>
> **Dev 3:** "wait did you copy the .env file?"
>
> **Dev 1:** "oh yeah that too, cp .env.example .env"
>
> **New dev:** "ok now it says artisan not found"
>
> **Dev 2:** "you need to run composer install inside the container"
>
> **New dev:** "how?"
>
> **Dev 3:** "docker compose exec app composer install"
>
> **New dev:** "🙃"

*Thread continues for 47 more messages...*

**After Makefile (`README.md` is now 3 lines):**

```bash
# Get started
cp .env.example .env
make setup
```

```makefile
setup: ## First-time project setup
	cp -n .env.example .env || true
	docker compose up -d --build
	sleep 8
	docker compose exec app composer install
	docker compose exec app php artisan key:generate
	docker compose exec app php artisan migrate --seed
	@echo ""
	@echo "🎉 All done! Visit http://localhost:8000"
	@echo "   Run 'make help' to see available commands"
```

New developer is running locally in 3 minutes. Not 3 hours. 🚀

## Common Pitfalls (Docker Taught Me the Hard Way) 🪤

### Pitfall #1: Tabs, Not Spaces

Makefile indentation uses **real tab characters**, not spaces. This is non-negotiable. It's 1976 and GNU Make will not apologize.

```makefile
# WRONG (spaces) - cryptic error: "missing separator"
target:
    echo "hello"

# RIGHT (tab character) - works perfectly
target:
	echo "hello"
```

If your editor auto-converts tabs to spaces, configure an exception for `Makefile`. Your sanity depends on it.

### Pitfall #2: Forgetting .PHONY

```makefile
# Without .PHONY: if a file named "test" exists in your dir,
# `make test` says "test is up to date" and does NOTHING. 😤

# With .PHONY: always runs, regardless of files
.PHONY: test build deploy
```

### Pitfall #3: Multi-Line Commands Don't Share State

```makefile
# WRONG: cd doesn't persist between lines
deploy:
	cd /app
	git pull  # Still runs from original directory!

# RIGHT: use && to chain on one line, or use backslash
deploy:
	cd /app && git pull

# Or with backslash for readability:
deploy:
	cd /app && \
	git pull && \
	php artisan migrate --force
```

### Pitfall #4: Shell Variables vs Make Variables

```makefile
APP = myapp  # Make variable
GIT_SHA = $(shell git rev-parse --short HEAD)  # Run shell command

deploy:
	# Use $$ for shell variables inside recipes (escapes Make expansion)
	IMAGE=$(DOCKER_REGISTRY):$(GIT_SHA) && \
	echo "Deploying $$IMAGE"
```

## The Quick-Win Targets Every Project Needs 🏆

Add these to any project, adapt as needed:

```makefile
# Check if required tools are installed
check-deps:
	@command -v docker >/dev/null 2>&1 || (echo "❌ Docker not installed" && exit 1)
	@command -v kubectl >/dev/null 2>&1 || (echo "❌ kubectl not installed" && exit 1)
	@echo "✅ All dependencies installed"

# Show current deployment status
status:
	@echo "=== Docker ==="
	docker compose ps
	@echo "\n=== Kubernetes ==="
	kubectl get pods -n $(ENV)

# Clean up Docker cruft (stops charging you disk space)
clean:
	docker system prune -f
	docker volume prune -f
	@echo "🧹 Cleaned up Docker resources"

# Open the app in browser (macOS/Linux)
open:
	open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000

# Tail logs for a specific service
logs-%:
	docker compose logs -f $*
# Usage: make logs-app, make logs-db, make logs-redis
```

That last one (`logs-%`) uses Make's pattern rules — one target that handles `make logs-app`, `make logs-db`, `make logs-anything`. Witchcraft. ✨

## TL;DR: The Makefile Manifesto 📋

After countless deployments, I've learned: **the command you type ten times a day belongs in a Makefile.**

Here's the simple version of why it matters:

| Situation | Without Makefile | With Makefile |
|-----------|-----------------|---------------|
| Start dev environment | Google "docker compose flags again" | `make dev` |
| Onboard new developer | 47-message Slack thread | `make setup` |
| Deploy to staging | Pray you copied the right command | `make deploy ENV=staging` |
| Production deploy | Sweat profusely | `make deploy ENV=production` (asks for confirmation) |
| Rollback a bad deploy | Panic, scroll through docs | `make rollback ENV=production` |
| CI/CD commands | Different from local (lies) | Same as local (truth) |

The Makefile is 30 years old and it has survived every framework trend, every DevOps fad, every "we should switch to X" meeting. It works everywhere. It needs nothing. It judged you silently for not using it sooner.

**Your action plan:**
1. Create a `Makefile` in your project root right now
2. Add 5 commands you type every day
3. Run `make help` and feel like a wizard
4. Watch your teammates start using it without you saying anything

A CI/CD pipeline that saved our team weeks of onboarding pain started with a single 10-line Makefile. Don't overcomplicate it — just start.

---

**Using Makefiles in your projects?** I'd love to see your patterns — find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

*Now go make a Makefile. (Pun intended and I'm not sorry.)* ⚙️✨
