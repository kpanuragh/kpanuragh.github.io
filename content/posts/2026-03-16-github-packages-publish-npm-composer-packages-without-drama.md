---
title: "GitHub Packages: Stop Emailing Your Team Zip Files Like It's 2008 📦🎁"
date: "2026-03-16"
excerpt: "You've launched your open source project. You've got contributors. Now you need a package registry that doesn't cost $50/month or require you to fight npm's publish process. GitHub Packages is sitting right there, and almost nobody uses it."
tags: ["open-source", "github", "developer-tools", "community"]
featured: true
---

# GitHub Packages: Stop Emailing Your Team Zip Files Like It's 2008 📦🎁

**Confession:** For two years I was distributing a private internal Laravel package by adding it to a private GitHub repo and pointing Composer at the repo URL directly.

```json
"repositories": [
    {
        "type": "vcs",
        "url": "https://github.com/my-org/secret-auth-package"
    }
]
```

This works. It's also the packaging equivalent of duct tape on a water main. 😬

The day a new developer joined and spent 45 minutes figuring out why Composer was throwing authentication errors was the day I finally looked at GitHub Packages properly.

**Spoiler:** It's been right there the whole time. And it's free for public packages. Let me show you how it works.

## What Even Is GitHub Packages? 🤔

GitHub Packages is GitHub's built-in package registry. It supports:

```
npm          → JavaScript / Node.js packages
Composer     → PHP packages
Docker       → Container images
Maven/Gradle → Java packages
NuGet        → .NET packages
RubyGems     → Ruby packages
```

As a full-time developer who contributes to open source, my world is primarily **npm** and **Composer** — and for both, GitHub Packages has become my first choice for anything I don't want to publish to the public npm or Packagist registries.

**Why would you NOT just use npm/Packagist?**

```
Packagist/npm pros:       GitHub Packages pros:
✅ Widely recognized      ✅ Lives next to your code
✅ No auth setup          ✅ Integrated permissions (repo access = package access)
✅ Works everywhere       ✅ Free for public packages
                          ✅ Private packages on paid plans
                          ✅ Version history tied to releases
                          ✅ Zero separate service to manage
```

Pick based on your use case. For internal tools, shared team libraries, and org-scoped packages? GitHub Packages wins every time.

## Publishing Your First npm Package to GitHub Packages 🟢

Let's say you've got a Node.js utility library your team uses across five projects. Currently you're copying `utils.js` around like some kind of animal. Time to fix that.

**Step 1: Scope your package**

In `package.json`, prefix your package name with your GitHub username or org:

```json
{
  "name": "@kpanuragh/my-utils",
  "version": "1.0.0",
  "description": "Shared utilities I'm tired of copy-pasting",
  "main": "index.js",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

That `@kpanuragh/` prefix is non-negotiable. GitHub Packages only accepts scoped packages. This is actually good — it forces you to namespace your stuff properly.

**Step 2: Auth once, publish forever**

Create a Personal Access Token (PAT) with `write:packages` scope at `github.com/settings/tokens`. Then:

```bash
npm login --scope=@kpanuragh --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-PAT-token
# Email: your@email.com
```

**Step 3: Publish**

```bash
npm publish
```

That's it. Your package is now at `https://github.com/kpanuragh?tab=packages` and versioned forever.

**Step 4: Teammates install it**

They need a `.npmrc` in the project root:

```
@kpanuragh:registry=https://npm.pkg.github.com
```

Then:

```bash
npm install @kpanuragh/my-utils
```

The auth for install comes from whatever GitHub auth they have set up (personal token or org SSO). **No separate package registry account needed.** That was the moment that sold me.

## Publishing a Composer Package (The PHP Way) 🐘

This is where it gets really useful for the Laravel ecosystem. Say you've extracted your multi-tenant middleware into a package your team shares across projects.

**Step 1: Your `composer.json`**

```json
{
    "name": "kpanuragh/tenant-middleware",
    "description": "Multi-tenant request middleware for Laravel",
    "type": "library",
    "require": {
        "php": "^8.1",
        "laravel/framework": "^10.0|^11.0"
    },
    "autoload": {
        "psr-4": {
            "Kpanuragh\\TenantMiddleware\\": "src/"
        }
    },
    "minimum-stability": "stable"
}
```

**Step 2: Create a release on GitHub**

Composer packages are published via GitHub Releases, not a `composer publish` command. Tag a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Then create the release in GitHub UI (or via `gh release create v1.0.0`).

**Step 3: Add it to your projects' `composer.json`**

```json
{
    "repositories": [
        {
            "type": "composer",
            "url": "https://composer.pkg.github.com/kpanuragh"
        }
    ],
    "require": {
        "kpanuragh/tenant-middleware": "^1.0"
    }
}
```

**Auth for Composer:** Create a `~/.composer/auth.json`:

```json
{
    "github-oauth": {
        "github.com": "YOUR_PAT_HERE"
    }
}
```

**The real win here:** Composer package access is controlled by GitHub repo permissions. Add someone to your org → they can install your private packages. Remove them → they can't. No separate Packagist account management, no API keys in Slack DMs, no "wait can you give me access to the package server" tickets.

## GitHub Packages + GitHub Actions: The Real Magic 🪄

Here's where it gets absurdly convenient. Your CI workflow can publish packages automatically on every release.

**Auto-publish npm on release:**

```yaml
# .github/workflows/publish.yml
name: Publish Package

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'

      - run: npm ci
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notice `${{ secrets.GITHUB_TOKEN }}`  — that's the built-in token that Actions provides automatically. **No manual token management.** No rotating credentials. No "oh the publish token expired and now CI is broken."

This is the workflow I run for every shared utility package across my team. Tag a release, the package ships. The whole thing just works.

## The Mistake I Made (So You Don't Have To) 🤦

I published my first npm package to GitHub Packages and immediately got a message from a teammate:

> "Hey, `npm install @kpanuragh/utils` isn't working for me"

The problem? I forgot the `.npmrc` step. When you install a scoped package from GitHub Packages, npm needs to know to look at GitHub's registry, not the default npm registry.

**Add `.npmrc` to your project:**

```
@kpanuragh:registry=https://npm.pkg.github.com
```

And **commit this file.** It's not a secret. It just tells npm where to look.

**The second mistake:** I tried to publish an unscoped package name (`my-utils` instead of `@kpanuragh/my-utils`). GitHub Packages rejects this immediately. Scope your packages. Always.

**Balancing work and open source taught me** that the 20 minutes you spend setting up a proper package registry saves approximately 4 hours of "how do I install this" support over the next year. It's always worth it.

## Container Images Too (Bonus Round) 🐳

While we're here — the GitHub Container Registry (`ghcr.io`) deserves a mention.

```bash
# Build your image
docker build -t my-app .

# Tag it for GHCR
docker tag my-app ghcr.io/kpanuragh/my-app:latest

# Login (one time)
echo $GITHUB_TOKEN | docker login ghcr.io -u kpanuragh --password-stdin

# Push
docker push ghcr.io/kpanuragh/my-app:latest
```

Your Docker image now lives at `ghcr.io/kpanuragh/my-app` and is visible on your GitHub profile under Packages.

**Why this matters for open source:** If you maintain a tool that ships as a container, GHCR is free for public images. Zero cost. And it's right next to your repo — contributors can see the published image history alongside the code history.

**In the security community,** we use GHCR extensively for distributing security tooling containers. The integrated access control means you can have a private container for internal tooling and a public one for the community release — managed from the same GitHub org, with no additional registry to babysit.

## When to Use GitHub Packages vs npm/Packagist 🤷

**Use GitHub Packages when:**

```
✅ Internal / team packages not meant for public consumption
✅ Private packages where GitHub org access should control installs
✅ You want versioning tied directly to GitHub releases
✅ Your CI is already GitHub Actions (zero extra auth setup)
✅ Container images for your GitHub-hosted projects
```

**Stick with npm/Packagist when:**

```
✅ Public packages intended for broad discovery
✅ Packages used by people outside your GitHub org
✅ You need npm install [package] without any special registry config
✅ You want Packagist's search and stats
```

The answer is often "both." Publish to Packagist for community discoverability, and use GitHub Packages for the private fork or enterprise version.

## The Packages Tab Nobody Checks 👀

One more thing: go look at your GitHub profile right now.

You have a **Packages** tab. Most developers don't even know it exists.

If you've published anything — Docker images, npm packages, anything — it's there. It shows version history, install instructions, download counts, and linked repositories.

**For open source projects**, the Packages tab is a legitimacy signal. A project with a clean release history and published packages looks more maintained than one where you have to `git clone` and pray. It's a small thing that communicates "this is a real project with real processes."

When I started treating my packages as actual products — with proper versioning, registry publishing, and release notes — contributions went up. People were more confident the project was actively maintained. That confidence comes partly from seeing a published, versioned package next to the code.

## TL;DR 📋

```
GitHub Packages in 60 seconds:

npm packages:    scope your name (@you/package)
                 add registry to .npmrc
                 npm publish

Composer:        tag a GitHub Release
                 point composer.json at GitHub registry
                 auth via ~/.composer/auth.json

Docker:          push to ghcr.io/yourname/image

CI publish:      use ${{ secrets.GITHUB_TOKEN }}
                 no manual credentials needed

Use it for:      internal packages, team libraries, private tools
Still use npm/Packagist for: public packages, broad discoverability
```

## The Bottom Line 💡

GitHub Packages is one of those features that sits in plain sight and almost nobody uses until the day they finally try it and immediately wonder why they waited so long.

Stop copying files. Stop pointing Composer at raw VCS URLs. Stop managing a separate registry for your team's internal tools.

Your packages belong next to your code. The tooling is already there.

**Publish something today.** 🚀

---

**Using GitHub Packages for something interesting?** I'd love to see it — find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my packages on [GitHub](https://github.com/kpanuragh).

*If you got this far and you're still running `composer require` against raw GitHub repo URLs: it's okay. We've all been there. Now stop it.* 😄
