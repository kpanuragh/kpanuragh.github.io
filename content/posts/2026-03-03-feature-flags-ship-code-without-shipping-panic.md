---
title: "Feature Flags: Ship Code to Production Without Shipping Panic to Users 🚩"
date: "2026-03-03"
excerpt: "After countless deployments where a half-finished feature somehow made it to production at the worst possible moment, I discovered feature flags — the DevOps superpower that lets you merge code and flip a switch separately. Here's how to stop fearing your own deploy button."
tags: ["\"devops\"", "\"deployment\"", "\"ci-cd\"", "\"feature-flags\"", "\"best-practices\""]
featured: "true"
---

# Feature Flags: Ship Code to Production Without Shipping Panic to Users 🚩

**True story:** It was a Tuesday afternoon. I pushed what I thought was a half-finished payment flow — safely hidden behind an `if (false)` comment. The PR got merged. CI passed. Deployed to production.

Except I had removed the `if (false)` two commits earlier to test locally and forgot to put it back.

Users were hitting a broken checkout page for 23 minutes before someone on Slack sent a screenshot. That was the day I learned that `if (false)` is not a deployment strategy.

Feature flags are.

## What Is a Feature Flag? 🤔

A feature flag (also called a feature toggle or feature switch) is exactly what it sounds like: a conditional that controls whether a feature is visible to users. The code ships to production. The feature doesn't — until *you decide* to turn it on.

```
Deploy code → Feature OFF → Users see nothing new
Flip switch → Feature ON  → Users see the new thing
```

The genius part: **deploying and releasing are now two separate events.** You can merge code on Monday, let it bake in production safely disabled, and release it Friday afternoon. Or 3am when nobody's awake. Or gradually to 1% of users first.

No more "I hope this works" deploys.

## The `if (false)` Era vs. Real Feature Flags 💀

**Before feature flags (what we were doing):**

```javascript
// "temporary" workaround that lived for 4 months
if (false) {
  // new checkout flow
  renderNewCheckout(cart);
} else {
  renderOldCheckout(cart);
}
```

Problems with this approach:
- Easy to accidentally remove the `if (false)` (ask me how I know)
- Can't turn it on for just one user or 1% of traffic
- No audit trail of who toggled what and when
- Zero ops control — only devs can change it, and only via a deploy

**After feature flags (what we do now):**

```javascript
const flags = await featureFlags.getFlags(userId);

if (flags.isEnabled('new-checkout-flow')) {
  renderNewCheckout(cart);
} else {
  renderOldCheckout(cart);
}
```

Now a product manager can enable it for beta testers. An ops engineer can kill it instantly if something goes wrong. No deploy required. No Slack panic.

## The Simplest Feature Flag That Actually Works 🔧

You don't need a SaaS product on day one. Start with environment variables:

```javascript
// config/features.js
const features = {
  newCheckoutFlow: process.env.FEATURE_NEW_CHECKOUT === 'true',
  darkMode: process.env.FEATURE_DARK_MODE === 'true',
  newPricingPage: process.env.FEATURE_NEW_PRICING === 'true',
};

module.exports = features;
```

```javascript
// In your route handler
const features = require('./config/features');

app.get('/checkout', (req, res) => {
  if (features.newCheckoutFlow) {
    return res.render('checkout-v2');
  }
  return res.render('checkout');
});
```

```bash
# .env (don't commit this)
FEATURE_NEW_CHECKOUT=false
FEATURE_DARK_MODE=false
FEATURE_NEW_PRICING=false
```

This solves the `if (false)` problem immediately. Features are controlled by config, not code comments. Toggling requires an environment variable change — still a deploy, but at least it's *intentional*.

## Leveling Up: Database-Backed Flags with Percentage Rollouts 📊

Env var flags are great. But what if you want to:
- Enable a feature for 10% of users?
- Turn on a flag for your QA team only?
- Roll back a broken feature at 2am without a deploy?

You need dynamic flags. Here's a dead-simple version in Laravel:

```php
// database/migrations/create_feature_flags_table.php
Schema::create('feature_flags', function (Blueprint $table) {
    $table->id();
    $table->string('name')->unique();
    $table->boolean('enabled')->default(false);
    $table->integer('rollout_percentage')->default(0); // 0-100
    $table->timestamps();
});
```

```php
// app/Services/FeatureFlagService.php
class FeatureFlagService
{
    public function isEnabled(string $flag, ?User $user = null): bool
    {
        $feature = FeatureFlag::where('name', $flag)->first();

        if (!$feature || !$feature->enabled) {
            return false;
        }

        // 100% rollout — everyone gets it
        if ($feature->rollout_percentage >= 100) {
            return true;
        }

        // Percentage rollout — stable per user (not random each request)
        if ($user) {
            $hash = crc32($flag . ':' . $user->id) % 100;
            return $hash < $feature->rollout_percentage;
        }

        return false;
    }
}
```

```php
// Usage in a controller
if ($this->flags->isEnabled('new-checkout-flow', auth()->user())) {
    return view('checkout.v2');
}

return view('checkout.v1');
```

The `crc32` trick is the important part. It ensures the same user always gets the same flag value — they won't see the new feature one page load and the old one the next. Stable rollouts, no flickering.

## The GitHub Actions Integration: Flag-Safe Deployments 🤖

Here's how I set up flag-aware deployments in CI. The idea: deploy the code, but only enable the flag manually afterwards.

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Deploy application
        run: |
          echo "Deploying code..."
          # Your actual deploy command here
          # Feature flags stay OFF — code ships, features don't
          ssh deploy@${{ secrets.PROD_HOST }} "cd /app && git pull && npm install && pm2 restart app"

      - name: Verify deployment
        run: |
          sleep 10
          curl -f https://api.yourapp.com/health || exit 1

      - name: Deployment complete
        run: |
          echo "✅ Code deployed. Feature flags still OFF."
          echo "🚩 Enable flags manually when ready to release."
```

Deploy the code. The feature sits dormant in production. When the team is ready, someone flips the flag. No 3am deploys required for a "release."

## The Three Types of Flags That Will Save Your Team 🏷️

Not all flags are created equal. After countless deployments I've settled on three categories:

**1. Release Flags** — for shipping work-in-progress code safely

```javascript
// Controls user-visible features still in development
flags.newCheckoutFlow
flags.redesignedDashboard
flags.aiSearchSuggestions
```

These should be **short-lived**. Once the feature ships, delete the flag and the dead branch. Feature flag debt is real debt.

**2. Ops Flags** — for emergency circuit breakers

```javascript
// Kill switches for expensive operations
flags.enableAiRecommendations  // turns off the pricey LLM call
flags.enableEmailNotifications  // kill switch if SES is melting down
flags.enableBackgroundSync       // disable when DB is struggling
```

These are your 3am friends. When production is on fire, an ops flag means you can disable the problematic feature in 30 seconds without a deploy.

**3. Experiment Flags** — for A/B testing

```javascript
// Controlled rollouts for data collection
flags.newPricingPageVariant  // 50% of users see the new pricing
flags.checkoutButtonColor    // 50% see green, 50% see blue
```

Roll to 10%, check the conversion metrics, roll to 50%, check again, then 100%. Data-driven feature releases instead of "I think users will love this."

## Common Pitfalls (That I've Hit Personally) 🚨

**Pitfall #1: Flag sprawl**

I once counted 47 active feature flags in a codebase. Nobody knew what half of them were for. The rule I follow now: every flag gets a GitHub issue. When the issue closes, the flag gets deleted.

**Pitfall #2: Nested flags**

```javascript
// This is a nightmare
if (flags.newCheckout) {
  if (flags.newPaymentProvider) {
    if (flags.enhancedFraudCheck) {
      // This code path exists in 3 universes simultaneously
    }
  }
}
```

If you have more than two flags interacting, you have a design problem, not a flag problem.

**Pitfall #3: Forgetting to test both code paths**

```yaml
# In your CI, test both flag states
- name: Test with flag OFF
  env:
    FEATURE_NEW_CHECKOUT: false
  run: npm test

- name: Test with flag ON
  env:
    FEATURE_NEW_CHECKOUT: true
  run: npm test
```

If you only test with the flag on, you'll find out the old code path is broken when you try to roll back at 2am. Ask me how I know.

**Pitfall #4: Long-lived flags becoming permanent**

The `if (false)` horror story from the beginning? Feature flags can become the same thing if you're not disciplined. Set a calendar reminder. When the feature is stable and fully rolled out, delete the flag. The code should end up clean, not haunted by conditional ghosts.

## Before vs After: What Changed for Us 📊

| Situation | Before flags | After flags |
|---|---|---|
| Broken feature in prod | Emergency deploy + rollback | Flip switch OFF (30 seconds) |
| Risky release | Deploy Friday 5pm and pray | Deploy Monday, release Friday |
| Testing with real users | "Let's just enable it" | 5% rollout, monitor, expand |
| Blocked merge (incomplete feature) | Feature branch sits for weeks | Merge behind flag, ship anytime |
| That `if (false)` incident | Once per quarter | Never again |

## Open Source Flag Services Worth Knowing 🌟

If you want more than env vars but don't want to build your own:

- **Flagsmith** — self-hostable, great API, free tier exists
- **Unleash** — battle-tested, open source since 2016
- **GrowthBook** — combines feature flags with A/B test analysis

All three have Docker images. You can self-host for ~$5/month on a small EC2 instance. No SaaS lock-in.

```bash
# Flagsmith via Docker Compose
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL=postgres://... \
  flagsmith/flagsmith:latest
```

## TL;DR ✅

- **Feature flags decouple deploying from releasing** — ship code when ready, release features when safe
- Start with **environment variables**, graduate to database-backed flags as you need percentage rollouts
- Use **three flag types**: release flags (work in progress), ops flags (kill switches), experiment flags (A/B tests)
- The `crc32` trick for **stable percentage rollouts** — same user always gets the same experience
- **Test both code paths** in CI — the old path is your rollback plan
- Delete flags when features are fully shipped — **flag debt is real debt**
- An ops flag at 2am is worth a thousand deploys

After countless deployments, the deploy I'm most proud of is one nobody noticed: we shipped a complete checkout redesign to 100% of users over three weeks with zero incidents. Flagged out, rolled to 5%, to 25%, to 100%. Metrics at each step. It was boring. It was perfect.

The `if (false)` incident taught me that boring deployments are the best deployments.

---

**Had a feature flag save your production?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the more deploy war stories, the better.

**Want the full Flagsmith + Laravel integration?** Check out [GitHub](https://github.com/kpanuragh) — I've got a working example with percentage rollouts and user targeting.

*If your release strategy involves commenting out code, close this tab and go add a flag. Future-you at 2am will be extremely grateful.* 🚩
