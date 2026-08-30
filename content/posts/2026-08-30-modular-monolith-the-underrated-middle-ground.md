---
title: "🏛️ The Modular Monolith: Architecture's Most Underrated Middle Child"
date: "2026-08-30"
excerpt: "Microservices promised independence and delivered a distributed systems final exam. The monolith promised simplicity and delivered a codebase where everything imports everything. There's a door marked 'exit' between those two rooms, and almost nobody opens it. It's called module boundaries, and you already have everything you need to build one."
tags: ["architecture", "backend", "nodejs", "software-design"]
featured: true
---

Every architecture conversation eventually turns into a two-option multiple choice question: monolith or microservices? Pick your poison — either you deploy one artifact and pray that `billing` and `notifications` never step on each other's imports, or you deploy fourteen services and pray that the network is reliable, which it famously is not. Nobody asks about option C, mostly because option C doesn't have a conference talk with a cool architecture diagram. Option C is the modular monolith, and it's the architecture equivalent of eating vegetables — unglamorous, occasionally mocked, and the thing that actually keeps you healthy long-term.

## How We Got Here

The pitch for microservices was never really about scale. It was about *boundaries*. "If we split billing into its own service, nobody can accidentally import our internal pricing logic from the checkout module" is a real problem with a real fix — it's just that the fix that got chosen was "put a network call in the way," which solves the coupling problem by introducing latency, partial failures, distributed tracing, and a Kubernetes bill that makes finance ask questions in the Monday standup.

Meanwhile the monolith side of the argument usually isn't "monoliths are good," it's "we don't have the operational maturity for fourteen deployables yet," which is true but also a little sad, because it means the decision is driven by fear of microservices rather than an actual endorsement of anything.

The modular monolith says: you can get the boundary discipline without the network hop. One deployable, one database (usually), but the code itself is organized so that `billing` cannot reach into `checkout`'s internals no matter how tempting the shortcut looks at 4:58pm on a Friday.

## What Enforcement Actually Looks Like

The trap most teams fall into isn't lacking the *idea* of modules — it's calling a folder structure a boundary and calling it a day:

```
src/
  billing/
  checkout/
  notifications/
  shared/
```

This is not a modular monolith. This is a monolith with opinions about indentation. Nothing stops `checkout/orderService.js` from doing `import { calculateDiscount } from '../billing/internal/pricingEngine'` six months from now when someone's in a hurry. Folders are a suggestion; only tooling is a rule.

In a Node/TypeScript codebase, the cheapest real enforcement is ESLint's `no-restricted-imports` (or the more purpose-built `eslint-plugin-boundaries`), wired so each module only exposes an `index.ts` and everything else is off-limits from outside:

```js
// .eslintrc.js
rules: {
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['*/billing/*', '!*/billing/index'],
      message: 'Import from billing/index.ts only — internals are private.',
    }],
  }],
}
```

Now `checkout` can call `billing`'s public API, but the moment someone reaches for `pricingEngine.ts` directly, CI fails with a message that explains *why*, not just *that*. That single lint rule does more for your architecture than most RFCs.

## The Part Everyone Skips: The Database

Folder boundaries are the easy 20%. The database is the other 80%, and it's where modular monoliths quietly turn back into regular monoliths. If `billing` and `checkout` both query the same `orders` table directly, you don't have modules — you have a shared mutable global that happens to be SQL. The fix isn't necessarily separate databases (that's just microservices with extra steps and none of the deployment independence). It's schema-level ownership: each module gets its own schema, and cross-module reads go through the owning module's public interface, not a raw join.

```sql
-- billing owns its schema, checkout does not query it directly
CREATE SCHEMA billing;
CREATE SCHEMA checkout;

CREATE TABLE billing.invoices (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  amount_cents INT NOT NULL
);
```

`checkout` doesn't `SELECT * FROM billing.invoices` in its query layer. It calls `billingModule.getInvoiceStatus(orderId)`, which happens to run a query, but the *contract* is a function signature, not a table shape. That distinction is what makes it possible to split `billing` into its own service two years from now without a rewrite — the seam was always there, just not exercised over a network.

At Cubet, this is roughly how we structured a claims-processing platform that genuinely needed to stay a single deployable for cost and latency reasons, but had four teams working in the same repo. Nobody got to `import` their way around another team's schema, and when we eventually *did* need to peel one module out into its own service — the fraud-scoring module, because it needed a GPU node pool the rest of the app didn't — it took a sprint instead of a quarter, because the interface was already a function call. We just moved the implementation of that function call behind an HTTP client.

## When It's the Wrong Answer

Modular monoliths aren't a universal fix. If your teams genuinely need independent deploy cadences — one team ships twelve times a day, another ships once a sprint and can't tolerate the first team's flakiness — a single deployable forces them to share a release train whether they like it or not. And if different modules have wildly different scaling profiles (a video transcoding module next to a CRUD-heavy admin panel), one process sizing decision has to serve both, which is wasteful in either direction. Those are real reasons to split into services. "We read a blog post about microservices" is not.

## Try It Before You Split It

If you're currently staring down a "should we go microservices" decision, the cheaper experiment is enforcing real module boundaries inside the monolith you already have and seeing how much of the original pain that alone resolves. Add the lint rule this week. Pick your two most tangled modules and give them separate schemas next sprint. You'll probably find that most of what you wanted from microservices was never the network — it was just discipline, and discipline doesn't require a service mesh.
