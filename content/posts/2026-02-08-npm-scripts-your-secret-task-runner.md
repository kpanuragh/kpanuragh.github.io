---
title: "npm Scripts: Your Secret Task Runner 🎯"
date: "2026-02-08"
excerpt: "Think npm is just for installing packages? Cool! Now explain why you're writing bash scripts when npm can automate everything. Let's dive into npm scripts - the built-in task runner you didn't know you had!"
tags: ["nodejs", "javascript", "npm", "backend", "productivity"]
featured: true
---

# npm Scripts: Your Secret Task Runner 🎯

**Real confession:** When I started at Acodez, I had a folder called `scripts/` filled with bash files - `start-dev.sh`, `run-tests.sh`, `deploy.sh`, `backup-db.sh`. My senior dev looked at my setup and said: "Why aren't you using npm scripts?" Me: "npm... does more than install packages?" 🤦

**Mind. Blown.**

Turns out, `package.json` isn't just a dependency list - it's a POWERFUL task runner hiding in plain sight! When I was building Node.js APIs, I spent weeks writing bash scripts that npm could have done in one line. Coming from Laravel where you use `php artisan` for everything, I didn't realize npm had similar superpowers!

Let me save you from the script mess I created!

## What Even Are npm Scripts? 🤔

**npm scripts** = Command aliases defined in your `package.json` that you run with `npm run`.

Think of it like shortcuts on your phone:
- **Without npm scripts:** Type long commands every time: `node --inspect --require dotenv/config src/server.js`
- **With npm scripts:** Type `npm run dev` → same command, 90% less typing!

**The magic:** npm adds `node_modules/.bin` to PATH automatically, so you can run local packages without `npx` or global installs!

**The reality:** Most devs only use `npm start` and `npm test`. You're missing out on SO MUCH!

## The Basic Setup (Everyone Knows This) 📚

**Your basic package.json scripts section:**

```json
{
  "scripts": {
    "start": "node src/server.js",
    "test": "jest",
    "build": "tsc"
  }
}
```

**Running them:**

```bash
npm start        # Special: doesn't need 'run'
npm test         # Special: doesn't need 'run'
npm run build    # Everything else needs 'run'
```

**Coming from Laravel:** It's like `php artisan serve`, `php artisan test`, etc. - predefined commands for common tasks. But npm scripts are WAY more flexible!

## The Secret Sauce: Pre and Post Hooks 🪝

**This blew my mind at Acodez:**

```json
{
  "scripts": {
    "pretest": "eslint .",
    "test": "jest",
    "posttest": "echo 'Tests completed!'"
  }
}
```

**What happens when you run `npm test`:**

```bash
npm test

# Automatically runs in order:
# 1. pretest → eslint .
# 2. test → jest
# 3. posttest → echo 'Tests completed!'
```

**NO EXTRA COMMANDS NEEDED!** Just prefix with `pre` or `post` and npm handles the rest!

**A pattern I use in production:**

```json
{
  "scripts": {
    "prebuild": "npm run clean && npm run lint",
    "build": "tsc && webpack",
    "postbuild": "npm run test && echo 'Build successful!'"
  }
}
```

**Run `npm run build` and it automatically:**
1. Cleans old files
2. Lints code
3. Compiles TypeScript
4. Bundles with webpack
5. Runs tests
6. Prints success message

**One command. Six operations. MAGIC!** ✨

## Running Scripts in Parallel (Game Changer) ⚡

**The slow way (sequential):**

```json
{
  "scripts": {
    "dev": "npm run watch-css && npm run watch-js && npm run start-server"
  }
}
```

**Problem:** `watch-css` runs FOREVER (it's watching!), so `watch-js` NEVER runs! 😱

**The fast way (parallel):**

```bash
npm install --save-dev npm-run-all
```

```json
{
  "scripts": {
    "watch:css": "sass --watch src/styles:dist/styles",
    "watch:js": "webpack --watch",
    "start:server": "nodemon src/server.js",
    "dev": "npm-run-all --parallel watch:* start:server"
  }
}
```

**Now `npm run dev` runs ALL THREE at once!** 🎉

**Real impact at Acodez:** Went from opening 3 terminals manually to one command that starts everything. Development setup: 30 seconds → 3 seconds!

**Alternative (cross-platform):**

```json
{
  "scripts": {
    "dev": "concurrently \"npm:watch:*\" \"npm:start:server\""
  }
}
```

## Environment Variables (The Right Way) 🔐

**The wrong way I did it:**

```bash
# In terminal (lost when terminal closes!)
export NODE_ENV=production
export DB_HOST=localhost
node server.js
```

**The right way:**

```bash
npm install --save-dev cross-env
```

```json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development nodemon src/server.js",
    "prod": "cross-env NODE_ENV=production node src/server.js",
    "test": "cross-env NODE_ENV=test jest"
  }
}
```

**Why cross-env?** Works on Windows, Mac, AND Linux! Without it, Windows uses different syntax (`set` vs `export`) and your scripts break. 💥

**Pro tip - Using .env files:**

```bash
npm install --save-dev dotenv-cli
```

```json
{
  "scripts": {
    "dev": "dotenv -e .env.development node src/server.js",
    "prod": "dotenv -e .env.production node src/server.js"
  }
}
```

**Now your env vars are in files (version controlled, team-shared) instead of scattered across terminals!**

## Advanced Patterns I Use Daily 🎯

### Pattern #1: Database Management

```json
{
  "scripts": {
    "db:migrate": "sequelize-cli db:migrate",
    "db:seed": "sequelize-cli db:seed:all",
    "db:reset": "npm run db:drop && npm run db:create && npm run db:migrate && npm run db:seed",
    "db:drop": "sequelize-cli db:drop",
    "db:create": "sequelize-cli db:create",
    "db:fresh": "npm run db:reset && echo 'Database reset complete!'"
  }
}
```

**One command to rule them all:**

```bash
npm run db:fresh
# Drops DB → Creates DB → Runs migrations → Seeds data
# Perfect for testing or resetting local dev environment!
```

**Coming from Laravel:** It's like `php artisan migrate:fresh --seed` but you build it yourself with npm!

### Pattern #2: Deployment Pipeline

```json
{
  "scripts": {
    "predeploy": "npm run test && npm run build",
    "deploy": "npm run deploy:staging",
    "postdeploy": "npm run notify",

    "deploy:staging": "ssh user@staging 'cd /app && git pull && npm ci && pm2 reload all'",
    "deploy:production": "ssh user@prod 'cd /app && git pull && npm ci && pm2 reload all'",

    "notify": "curl -X POST https://hooks.slack.com/... -d '{\"text\":\"Deploy complete!\"}'"
  }
}
```

**Run `npm run deploy` and it:**
1. Runs tests (if they fail, stops!)
2. Builds production assets
3. SSHs to staging server
4. Pulls latest code
5. Installs dependencies
6. Reloads PM2
7. Sends Slack notification

**Zero-downtime deploy in ONE command!** 🚀

### Pattern #3: Code Quality Pipeline

```json
{
  "scripts": {
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.{js,json}'",
    "type-check": "tsc --noEmit",

    "quality": "npm-run-all --parallel lint type-check",
    "fix": "npm run lint:fix && npm run format",

    "precommit": "npm run quality",
    "prepush": "npm run test"
  }
}
```

**Hook them up with husky:**

```bash
npm install --save-dev husky
npx husky install
npx husky add .git/hooks/pre-commit "npm run precommit"
npx husky add .git/hooks/pre-push "npm run prepush"
```

**Now git automatically:**
- Runs linting + type checks before EVERY commit
- Runs tests before EVERY push
- Blocks bad code from reaching your repo!

**How I discovered this:** Pushed broken code to staging THREE TIMES in one week. Boss was... not amused. Added pre-push hooks. Never happened again! 😅

### Pattern #4: Docker Development

```json
{
  "scripts": {
    "docker:build": "docker build -t myapp .",
    "docker:run": "docker run -p 3000:3000 myapp",
    "docker:dev": "docker-compose up",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "docker:shell": "docker exec -it myapp_web_1 sh",

    "docker:clean": "docker system prune -f"
  }
}
```

**Instead of remembering Docker commands:**

```bash
npm run docker:dev     # Start dev environment
npm run docker:logs    # Watch logs
npm run docker:shell   # Jump into container
npm run docker:clean   # Clean up disk space
```

### Pattern #5: Performance Testing

```json
{
  "scripts": {
    "perf:load": "autocannon -c 100 -d 30 http://localhost:3000",
    "perf:profile": "node --prof src/server.js",
    "perf:analyze": "node --prof-process isolate-*.log > profile.txt",

    "benchmark": "npm-run-all --sequential perf:profile perf:analyze",
    "load-test": "npm run perf:load"
  }
}
```

**Quick performance check:**

```bash
npm run load-test
# Hammers your API with 100 concurrent connections for 30 seconds
# Shows requests/sec, latency, errors
```

## Common Mistakes (I Made All of These) 🙈

### Mistake #1: Not Using -- to Pass Args

```json
{
  "scripts": {
    "test": "jest"
  }
}
```

```bash
# WRONG: This doesn't work!
npm run test --watch

# RIGHT: Use -- to pass args to the script
npm run test -- --watch
```

**Why?** Without `--`, npm thinks `--watch` is for npm itself, not jest!

### Mistake #2: Hardcoding File Paths

```json
{
  "scripts": {
    "clean": "rm -rf dist/"  // Breaks on Windows!
  }
}
```

**Fix - Use cross-platform tools:**

```bash
npm install --save-dev rimraf mkdirp
```

```json
{
  "scripts": {
    "clean": "rimraf dist",
    "mkdir": "mkdirp dist/assets"
  }
}
```

**Now it works on Windows, Mac, AND Linux!**

### Mistake #3: Not Using npm-run-all for Dependencies

```json
{
  "scripts": {
    // BAD: Only runs 'lint' (test never runs!)
    "check": "npm run lint && npm run test"
  }
}
```

**If lint fails, test NEVER runs!** Sometimes you want to see ALL failures!

**Fix:**

```json
{
  "scripts": {
    // Runs BOTH, even if one fails
    "check": "npm-run-all lint test"
  }
}
```

### Mistake #4: Long Commands in Scripts

```json
{
  "scripts": {
    "deploy": "cross-env NODE_ENV=production npm run build && ssh user@server 'cd /app && git pull && npm ci && pm2 reload all' && curl https://..."
  }
}
```

**This is UNREADABLE!** 😱

**Fix - Break into smaller scripts:**

```json
{
  "scripts": {
    "build:prod": "cross-env NODE_ENV=production npm run build",
    "deploy:ssh": "ssh user@server 'cd /app && git pull && npm ci && pm2 reload all'",
    "deploy:notify": "curl https://hooks.slack.com/...",

    "deploy": "npm-run-all build:prod deploy:ssh deploy:notify"
  }
}
```

**Now it's readable AND reusable!**

## Power User Tricks 🧙‍♂️

### Trick #1: Custom npm Commands

```json
{
  "scripts": {
    "start": "node src/server.js"
  }
}
```

**Did you know you can create aliases?**

```bash
npm start dev    # Passes 'dev' as process.argv[2]
```

```javascript
// src/server.js
const mode = process.argv[2] || 'production';
console.log(`Starting in ${mode} mode...`);
```

### Trick #2: Accessing Environment Variables

```json
{
  "scripts": {
    "version": "echo $npm_package_version",
    "name": "echo $npm_package_name"
  }
}
```

**npm exposes package.json fields as env vars!** Prefix with `npm_package_`:

```bash
npm run version
# Output: 1.2.3
```

### Trick #3: Silent Mode

```bash
npm run test --silent        # No npm output, only script output
npm run test --loglevel=error # Only show errors
```

**Great for CI/CD where you don't want npm noise!**

### Trick #4: List All Scripts

```bash
npm run    # Shows all available scripts!
```

**Output:**

```
Lifecycle scripts included in myapp:
  start
    node src/server.js
  test
    jest

available via `npm run-script`:
  dev
    nodemon src/server.js
  build
    webpack --mode production
```

**Perfect for onboarding new devs!**

## My Production Setup (Real Example) 🏗️

**Here's my actual package.json scripts from a production app:**

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "build": "tsc",

    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.{ts,json}'",
    "type-check": "tsc --noEmit",

    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",

    "db:migrate": "sequelize-cli db:migrate",
    "db:seed": "sequelize-cli db:seed:all",
    "db:reset": "npm-run-all db:drop db:create db:migrate db:seed",

    "quality": "npm-run-all --parallel lint type-check test",
    "fix": "npm run lint:fix && npm run format",

    "docker:dev": "docker-compose up",
    "docker:down": "docker-compose down",

    "deploy:staging": "ssh staging 'cd /app && git pull && npm ci && pm2 reload all'",
    "deploy:prod": "ssh prod 'cd /app && git pull && npm ci && pm2 reload all'",

    "prepare": "husky install",
    "precommit": "npm run quality",
    "prepush": "npm run test"
  }
}
```

**Daily workflow:**

```bash
npm run dev              # Start development
npm run quality          # Before committing
npm run deploy:staging   # Deploy to staging
npm run deploy:prod      # Deploy to production
```

**One command each. No bash scripts. No documentation needed. New devs can read package.json and know EXACTLY what's available!**

## Quick Wins (Do These Today!) 🏃‍♂️

1. **Add a dev script** with auto-reload: `"dev": "nodemon src/server.js"`
2. **Add pre/post hooks** to your existing scripts
3. **Install npm-run-all** and parallelize your tasks
4. **Add a quality script** that runs all checks
5. **Document with comments** in package.json (yes, you can add comments in the scripts object keys!)

## Your npm Scripts Checklist ✅

Essential scripts every Node.js project should have:

- [ ] `dev` - Start development server with hot reload
- [ ] `start` - Start production server
- [ ] `build` - Build for production
- [ ] `test` - Run tests
- [ ] `lint` - Check code quality
- [ ] `format` - Auto-format code
- [ ] `quality` - Run all checks (lint + type-check + test)
- [ ] `clean` - Remove build artifacts
- [ ] `db:migrate` - Run database migrations
- [ ] `deploy` - Deploy to production

## The Bottom Line

**npm is not just a package installer - it's a task runner hiding in plain sight!**

**The essentials:**
1. **Use npm scripts instead of bash files** - Cross-platform, documented, team-friendly
2. **Pre/post hooks are magic** - Automatic workflow orchestration
3. **npm-run-all for parallelization** - Run multiple tasks at once
4. **cross-env for environment vars** - Works everywhere
5. **Keep scripts small and composable** - Readable and reusable

**When I was building Node.js APIs at Acodez**, discovering npm scripts was a revelation. Deleted 15 bash scripts, moved everything to package.json, and onboarding new devs became trivial. "Just run `npm run dev`" - that's it!

Coming from Laravel where artisan commands are first-class citizens, I initially thought Node.js lacked this. WRONG! npm scripts ARE the artisan commands - you just build them yourself! And that flexibility? Actually MORE powerful! 💪

Think of npm scripts as **your project's control panel**. Every button clearly labeled, every operation one command away. No more "where's the deploy script?" or "how do I run tests?" - it's all in package.json! 🎯

---

**Built a cool npm scripts setup?** Share it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - let's learn from each other!

**Want to see my Node.js projects?** Check out my [GitHub](https://github.com/kpanuragh) - all with clean npm scripts! 😉

*P.S. - If you have a `scripts/` folder full of bash files, move them to npm scripts THIS WEEKEND. Your team will thank you!* 🎯✨
