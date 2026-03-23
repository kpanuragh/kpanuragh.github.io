---
title: "AWS Lambda Layers: Stop Shipping node_modules Into Every Single Function 📦⚡"
date: "2026-03-16"
excerpt: "If you're copy-pasting the same utility code and npm packages across 30 Lambda functions, your deployment zips are a disaster and your sanity is next. Lambda Layers fix this — here's everything I wish I knew earlier."
tags: ["\"aws\"", "\"serverless\"", "\"lambda\"", "\"cloud\"", "\"optimization\""]
featured: "true"
---

# AWS Lambda Layers: Stop Shipping node_modules Into Every Single Function 📦⚡

**Honest confession:** I once deployed a Lambda function that was 47MB. The actual business logic was 200 lines of JavaScript. The other 46.8MB was `node_modules`.

That's the equivalent of buying a mansion to store a bicycle. 🚲🏰

If that sounds familiar, let me introduce you to Lambda Layers — the feature that made me feel genuinely silly for not using it sooner.

## The Problem: Death by Duplication 😱

Picture this: you have 25 Lambda functions in your e-commerce backend. Every single one needs:

- `aws-sdk` (or `@aws-sdk/client-*` v3 packages)
- A shared `utils.js` with validation helpers
- `moment` or `date-fns` for date formatting
- Your internal `logger.js` that wraps Winston with structured JSON

**What most people do:**

```
function-order-processor/
  └── node_modules/ (45MB)
  └── utils.js
  └── logger.js
  └── handler.js (2KB of actual logic)

function-inventory-updater/
  └── node_modules/ (45MB)  ← SAME PACKAGES
  └── utils.js              ← SAME FILE
  └── logger.js             ← SAME FILE
  └── handler.js (3KB of actual logic)

... × 23 more functions
```

You're shipping the same 45MB of dependencies **25 times**. Cold starts are slow. Deployments are slow. Your S3 bucket is crying. Your CI/CD pipeline is billable time you're wasting.

In production, I've deployed serverless e-commerce backends with 40+ Lambda functions. Before I discovered Layers, our full deployment took **12 minutes** and our deployment artifacts were over **1GB total**. After Layers: **3 minutes**, under **200MB**. Same code, dramatically less waste. 🎉

## What Is a Lambda Layer? 🤔

A Layer is a ZIP archive that contains code, binaries, or runtime dependencies that you want to **share across multiple Lambda functions**.

When Lambda executes your function, it mounts the layer's contents at `/opt/` in the execution environment. Your function code can then import from there like it's locally installed.

```
Lambda Execution Environment:
  /var/task/           ← Your function code (tiny!)
  /opt/nodejs/         ← Layer: shared npm packages
  /opt/nodejs/utils/   ← Layer: your shared utilities
```

**The mental model:** Think of it like a shared Docker image layer. The base stuff is cached and shared — only the function-specific diff gets shipped each time.

## Setting Up Your First Layer ⚙️

Let's say you use `date-fns`, `axios`, and a shared logger across all your functions.

**Step 1: Build the layer package**

```bash
mkdir -p my-shared-layer/nodejs
cd my-shared-layer/nodejs

npm init -y
npm install date-fns axios

# Also add your shared utilities
cp ../../shared/logger.js ./
cp ../../shared/utils.js ./
```

**That directory structure matters.** For Node.js, the layer MUST have the path `nodejs/node_modules/` inside the zip. AWS is opinionated about this.

```bash
cd my-shared-layer
zip -r shared-layer.zip nodejs/
```

**Step 2: Publish the layer**

```bash
aws lambda publish-layer-version \
  --layer-name shared-utilities \
  --zip-file fileb://shared-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --description "Shared npm deps and utilities v1.0.0"
```

Note the ARN it returns. You'll need it:
```
arn:aws:lambda:us-east-1:123456789:layer:shared-utilities:1
```

**Step 3: Attach it to your functions**

```yaml
# serverless.yml
layers:
  SharedUtilities:
    path: layers/shared-utilities
    name: shared-utilities
    compatibleRuntimes:
      - nodejs20.x

functions:
  orderProcessor:
    handler: handlers/order.process
    layers:
      - !Ref SharedUtilitiesLambdaLayer  # Reference by logical name

  inventoryUpdater:
    handler: handlers/inventory.update
    layers:
      - !Ref SharedUtilitiesLambdaLayer  # Same layer, reused!
```

Now every function is **just the handler file**. Deployments go from 45MB to a few KB per function.

## Using the Layer In Your Code 📝

This is where people get confused. When your layer is mounted at `/opt/nodejs/node_modules/`, Node.js's module resolution finds it automatically. You don't need to change your imports:

```javascript
// handler.js - this just works!
const { format } = require('date-fns');  // from the layer
const axios = require('axios');           // from the layer
const logger = require('./logger');       // wait...
```

For your own utility files, there's a small gotcha. Files at `/opt/nodejs/logger.js` are NOT automatically in scope with `require('./logger')`.

**The fix:** Either put them in a subdirectory that looks like a package, or use the full opt path:

```javascript
// Option A: require by /opt path
const logger = require('/opt/nodejs/logger');
const { validateOrder } = require('/opt/nodejs/utils');

// Option B (cleaner): Put in node_modules as a "package"
// Layer structure: nodejs/node_modules/@myapp/utils/index.js
const { validateOrder } = require('@myapp/utils');
```

When architecting on AWS, I learned that Option B is cleaner — treat your shared utilities as an internal package inside the layer's `node_modules`. Feels weird at first but it's exactly how real monorepo setups work.

## The Version Gotcha Nobody Warns You About 🪤

When you update a layer, Lambda creates a **new version** (`:1`, `:2`, `:3`, etc.). Old function versions still reference the old layer version.

**This is actually a feature, not a bug.** Functions won't get breaking changes unless you explicitly update the layer ARN.

But here's the footgun: if you're auto-referencing by ARN with a hardcoded version number in CloudFormation/CDK, you'll need to update every function's config to pick up the new layer. I once spent 45 minutes wondering why my bug fix "wasn't deploying" — I updated the layer but forgot to bump the version ARN on 8 functions.

**The solution I use:**

```yaml
# Store the layer ARN in SSM Parameter Store
# Update parameter when you publish a new layer version
# Functions pull from SSM at deploy time

LayerArn:
  Type: AWS::SSM::Parameter::Value<String>
  Default: /myapp/layers/shared-utilities/arn
```

One parameter update → all functions get the new layer on next deploy. 💡

## How Many Layers Can One Function Have? 📚

Up to **5 layers per function**. And there's a 250MB unzipped size limit for everything combined (function + layers).

A serverless pattern that saved us on our e-commerce backend: split layers by concern:

1. **`layer-npm-deps`** — third-party packages (`date-fns`, `axios`, `zod`)
2. **`layer-internal-utils`** — your custom utilities and helpers
3. **`layer-config`** — environment-agnostic config and constants

This way, when you update an npm package, you only rebuild and redeploy Layer 1. Your internal utilities in Layer 2 stay untouched — no unnecessary redeployment, faster CI/CD.

## Cost & Performance Reality 💸

**Cold start impact:** Layers are cached on the Lambda execution environment. Multiple functions sharing the same layer can benefit from warm container reuse. Your 45MB `node_modules` loads **once** per container — not once per invocation.

**Storage cost:** Lambda stores deployment packages in S3. Before Layers, 40 functions × 45MB = 1.8GB in S3 = roughly **$0.04/month**. Not bank-breaking, but multiply by 10 environments (dev/staging/prod + PR previews) and it adds up. More importantly, deploying 1.8GB of packages takes time you're paying for in CI minutes.

**The real win:** Developer experience. When you need to update a shared utility, you change one file in one place. No copy-paste errors. No "wait, which functions have the old version?"

## Common Mistakes I Made So You Don't Have To 🤦

**Mistake #1: Wrong directory structure.**
Node.js layers MUST be at `nodejs/node_modules/` inside the zip. Python layers use `python/lib/pythonX.X/site-packages/`. Get this wrong and Lambda silently fails to find your packages — you just get `Cannot find module` errors at runtime.

**Mistake #2: Mixing runtimes.**
A layer built for `nodejs18.x` won't work on `nodejs20.x` if it contains native binaries. If you're using packages with native extensions (like `sharp` for image processing), build on a Lambda-compatible environment (`lambci/lambda` Docker images or AWS CodeBuild).

**Mistake #3: Forgetting to version your layers.**
Always include a version in your layer name or description. When production is broken and you're trying to rollback, "which layer version was deployed 3 days ago?" is not a question you want to be answering under pressure.

**Mistake #4: Making layers too fat.**
It's tempting to dump everything into one giant shared layer. But now you have a 200MB monster that takes forever to upload and bloats cold starts for tiny functions that only needed `date-fns`. Keep layers lean and focused.

## Quick Wins Summary ✅

A serverless pattern that saved us time and money:

```
Before Layers:
  40 functions × 45MB each = 1.8GB deployment artifacts
  Full deploy time: 12 minutes
  Shared code changes: update 40 files

After Layers:
  1 shared layer: 45MB (deployed once)
  40 functions × ~50KB each = 2MB of actual logic
  Full deploy time: 3 minutes
  Shared code changes: update 1 layer
```

It's not rocket science. It's just good engineering: stop duplicating things that don't need to be duplicated.

## TL;DR 🚀

**Use Lambda Layers when:**
- Multiple functions share the same npm packages
- You have shared utility/helper code across functions
- Cold start time matters and you want to minimize package size
- You're tired of copy-paste hell across dozens of Lambdas

**Don't over-engineer it when:**
- You have 2-3 functions with totally different dependencies
- Your functions are simple enough that monolithic deployment works fine

Lambda Layers are one of those features that seem optional until you're managing a real production system with dozens of functions. Then they feel mandatory.

Stop shipping `node_modules` everywhere. Your deployment pipeline, your cold starts, and your future self at 2 AM will all thank you. 📦

---

**Managing a bunch of Lambda functions?** I'd love to hear how you structure your layers — hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**More serverless deep-dives on my [GitHub](https://github.com/kpanuragh).** I regularly push architecture experiments from real production systems.

*Now go clean up those fat deployment zips.* 🧹⚡
