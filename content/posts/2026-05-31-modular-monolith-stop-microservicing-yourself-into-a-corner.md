---
title: "🧱 Modular Monolith: Stop Microservicing Yourself Into a Corner"
date: "2026-05-31"
excerpt: "Everyone jumped to microservices and now they're drowning in distributed systems complexity. The modular monolith is the architecture pattern that actually fits most teams — here's how to build one properly."
tags:
  - backend
  - architecture
  - nodejs
  - modular-monolith
  - distributed-systems
featured: true
---

# 🧱 Modular Monolith: Stop Microservicing Yourself Into a Corner

There's a pattern I've seen play out too many times: a team reads a Netflix engineering blog post, decides microservices are the future, spends six months splitting a perfectly functional app into twelve services — and then spends the *next* six months debugging distributed transactions, managing twelve deployment pipelines, and wondering why a simple feature change now requires coordinating four teams.

Microservices aren't bad. But for most teams, most of the time, a **modular monolith** is the architecture you actually want. It's the underrated middle ground between "big ball of mud" and "distributed systems PhD required."

Let me make the case.

## What Even Is a Modular Monolith?

A regular monolith is like a kitchen where everything is one big drawer — utensils, spices, random batteries, and that mysterious cable nobody can identify. A microservices architecture is like moving every utensil category into its own apartment across the city. A **modular monolith** is a well-organized kitchen: everything is in one house, but spatulas are with spatulas, spices are with spices, and you can actually find things.

Concretely: it's a single deployable unit where the codebase is divided into cohesive, independently-reasoned *modules* with explicit boundaries. Each module owns its domain logic, its data access, and its public interface. Other modules can't reach in and grab your internals.

The magic is that those module boundaries become your future microservice seams — if you ever actually need them.

## The Problem With the "Start With Microservices" Advice

Here's the thing nobody tells you: microservices require you to already *know* where your service boundaries are. And you only learn that from running the system in production and watching where the coupling actually happens.

Starting with microservices before you understand the domain is like building twelve specialized rooms in a house before you know how the family actually lives. You'll end up with a gym no one uses and a living room that's too small.

A modular monolith lets you iterate on boundaries cheaply — moving a module is a refactor, not a migration. Moving a microservice means distributed transactions, contract versioning, and a prayer.

## What It Looks Like in Practice

At Cubet, when we structure a Node.js backend for a product with some complexity, we land on something like this:

```
src/
  modules/
    users/
      users.controller.ts
      users.service.ts
      users.repository.ts
      users.types.ts
      index.ts          ← public API of this module
    orders/
      orders.controller.ts
      orders.service.ts
      orders.repository.ts
      index.ts
    billing/
      billing.service.ts
      billing.repository.ts
      index.ts
  shared/
    database/
    events/
    middleware/
  app.ts
```

The critical rule: **modules only import from each other's `index.ts`**. If `orders` needs user data, it calls `users.getUserById()` — it does not reach into `users.repository.ts` directly. That's the boundary.

Your linter enforces this. Here's a simple ESLint rule using `eslint-plugin-boundaries` to catch violations:

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        {
          from: 'modules',
          allow: ['shared'],
        },
        {
          // modules can import from other modules — but only their index
          from: ['modules/orders'],
          allow: ['modules/users'],
          importKind: 'value',
        },
      ],
    }],
  },
};
```

That rule will yell at you the moment someone does `import { UserRepository } from '../users/users.repository'` instead of going through the public API. Linting as architecture enforcement — beautiful.

## Keeping Cross-Module Communication Clean

The sneakiest problem with monoliths isn't that modules call each other — it's that they start calling each other *too much*, in *too many directions*, and suddenly you have circular dependencies that look like a bowl of spaghetti.

The fix: use an **in-process event bus** for side effects.

```typescript
// shared/events/event-bus.ts
import EventEmitter from 'events';

const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export function emit<T>(event: string, payload: T): void {
  eventBus.emit(event, payload);
}

export function on<T>(event: string, handler: (payload: T) => void): void {
  eventBus.on(event, handler);
}
```

Now when an order is placed, the `orders` module doesn't need to know that `billing` needs to be charged and `notifications` needs to send an email. It just fires an event:

```typescript
// modules/orders/orders.service.ts
import { emit } from '@/shared/events/event-bus';

async function placeOrder(userId: string, items: OrderItem[]) {
  const order = await ordersRepository.create({ userId, items });
  
  emit('order.placed', { orderId: order.id, userId, total: order.total });
  
  return order;
}
```

And `billing` and `notifications` subscribe independently. The `orders` module doesn't import `billing` at all — the dependency arrow doesn't even exist.

This is *exactly* how you'd communicate between microservices using a message queue — but without the infrastructure overhead, the retry logic complexity, or the "did the other service even receive it?" anxiety.

## When Should You Actually Split Into Microservices?

The modular monolith isn't forever. These are the signals that a module is ready to graduate:

- **Scaling independently**: that module gets 10x the traffic of everything else and you need to scale it separately. A single module doing heavy ML inference? Split it.
- **Different deployment cadence**: one team needs to ship ten times a day while another ships weekly. Shared deployments become a coordination tax.
- **Genuinely different tech requirements**: your billing module needs to be in a language with formal verification guarantees. Your scrappy API doesn't.
- **Regulatory boundary**: PCI data really shouldn't live in the same process as your analytics pipeline.

Notice what's *not* on that list: "we read that microservices are more scalable" or "we want to use Kubernetes." Those are solutions in search of problems.

## The Migration Path Is Already Built In

Here's the payoff: a well-structured modular monolith is a microservices architecture waiting to happen — on your terms, when you're ready.

Each module already has clean interfaces, already communicates through events for side effects, and already owns its own data access layer. Extracting it means:

1. Stand up the new service
2. Move the module's code in
3. Replace the in-process event bus calls with real message queue calls
4. Replace the direct service calls with HTTP or gRPC
5. Deploy

That's a week of work per module, not a six-month rewrite. Compare that to trying to extract a service from a tangled monolith where everything touches everything — you'll be drawing dependency graphs and having meetings for months before you write a line of code.

## The Real Talk

The backend engineering community has a fetish for complexity. "We're using microservices" sounds impressive in a job interview. "We have a well-structured monolith" sounds like you haven't read the right blog posts.

But in production, at Cubet, I've watched teams burn months on Kubernetes networking issues for apps that could have run on a single $20 VPS. I've seen distributed tracing dashboards that show the terrifying journey of a single HTTP request bouncing through nine services. I've helped teams whose "simple" feature required synchronized deploys across four repos.

The modular monolith is boring. It deploys in one step. Debugging is trivial — you have a stack trace, not a distributed trace. Cross-module transactions are just database transactions. It fits in one developer's head.

Boring, in production, is a feature.

Start with a modular monolith. Enforce your boundaries with linting. Use an event bus for side effects. Build the seams cleanly. And when you actually, genuinely need to split — you'll be ready, and it'll take days instead of months.

Until then: resist the microservices gravitational pull. Your on-call rotation will thank you.

---

**What's your take?** Are you running a modular monolith, or have you already gone the microservices route and lived to tell the tale? Drop your war stories in the comments — the good, the bad, and the "why does this distributed transaction take 4 seconds" kind.
