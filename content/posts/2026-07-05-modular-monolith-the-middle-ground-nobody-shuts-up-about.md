---
title: "The Modular Monolith: Microservices for People Who Hate Microservices 🏰"
date: 2026-07-05
excerpt: "Everyone wants to talk you into microservices before you've earned the right to need them. The modular monolith gives you enforced boundaries, independent modules, and a single deploy — no service mesh required."
tags:
  - backend
  - architecture
  - modular-monolith
  - design-patterns
  - nodejs
featured: true
---

Somewhere in your company right now, someone is drawing boxes and arrows on a whiteboard, and every box is labeled `-service`. Orders-service. Users-service. Notifications-service. Nobody has shipped a single feature yet, but there are already four repositories, three message queues, and a Slack channel called `#service-mesh-help`.

I get it. Microservices sound grown-up. They're what "real" engineering orgs use, right? Except most teams reaching for microservices haven't hit the problem microservices solve — which is "too many people stepping on each other in one codebase, or one part of the system needs to scale independently at a scale you don't have yet." What they actually have is a normal-sized app and a fear of the word "monolith."

Here's the thing nobody tells you early enough: **the monolith was never the problem. The lack of boundaries inside it was.**

## Enter the modular monolith

A modular monolith is a single deployable application — one repo, one build, one process (or one horizontally-scaled copy of that process) — internally split into modules that behave like they're separate services, minus the network hop. Each module owns its own data, exposes a narrow public interface, and is forbidden — by tooling, not vibes — from reaching into another module's internals.

You get most of what people actually want from microservices:

- Clear ownership boundaries per team or domain
- The ability to reason about (and test) one module in isolation
- A forced discipline against tangled imports

And you skip the stuff nobody wants but ends up with anyway:

- Distributed transactions for what used to be one SQL transaction
- Debugging a request across six log streams and a tracing dashboard you half-trust
- Deploying seventeen services to ship one field on an API response

## What "enforced" actually means

The failure mode of a "modular" monolith that isn't really modular is that the modules are just folders, and folders don't stop anyone from importing anything. Six months in, `orders` is importing a helper buried inside `notifications`, and you've built a distributed monolith without the "distributed" part paying off.

At Cubet, the way we made boundaries real instead of aspirational was linting them into existence. `eslint-plugin-boundaries` (or a hand-rolled ESLint rule if you want zero dependencies) can fail a build the moment someone reaches across a module line:

```js
// eslint.config.js
export default [
  {
    plugins: { boundaries: boundariesPlugin },
    settings: {
      'boundaries/elements': [
        { type: 'orders', pattern: 'src/modules/orders/*' },
        { type: 'billing', pattern: 'src/modules/billing/*' },
        { type: 'notifications', pattern: 'src/modules/notifications/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'orders', allow: ['billing'] },
            { from: 'billing', allow: [] },
          ],
        },
      ],
    },
  },
];
```

Now `notifications` reaching into `orders/internal/pricing.ts` isn't a code review nitpick — it's a red CI check. That single rule does more to keep an architecture honest than any diagram in Confluence.

## The public interface trick

The second piece is making sure each module only exposes what it wants to expose, the same way a well-designed npm package only exports from its `index.ts`:

```ts
// src/modules/orders/index.ts — the ONLY file other modules may import from
export { createOrder, getOrderById } from './service';
export type { Order, OrderStatus } from './types';

// everything else in src/modules/orders/** is invisible to the outside
```

Combine that with the ESLint rule restricting imports to `modules/*/index.ts` and you've recreated the "service boundary" microservices give you for free — except the boundary is checked at compile time instead of over HTTP, and refactoring the internals of `orders` doesn't require coordinating a deploy with three other teams.

## Where it actually breaks down

I'm not going to pretend this scales forever. A modular monolith starts to strain when:

- One module needs wildly different scaling characteristics than the rest (your image-processing module wants to autoscale on CPU, your API module doesn't)
- Different modules genuinely need different runtimes or languages
- Team size grows past the point where "one deploy pipeline, one release cadence" is tolerable for everyone

When that happens, you *extract* a module into its own service — and because it was already isolated behind a clean interface with its own schema, that extraction is a plumbing exercise, not an archaeology dig. That's the real pitch: a modular monolith isn't the opposite of microservices, it's microservices with the network call deferred until you've actually earned the complexity.

```ts
// day 1: a function call
import { createOrder } from '@/modules/orders';
await createOrder(payload);

// the day you actually need to extract it: an HTTP call behind the same signature
import { createOrder } from '@/clients/orders-service';
await createOrder(payload);
```

Same call site. Same contract. The extraction is invisible to every caller because you never let them depend on anything but the interface.

## Start boring, earn your complexity

If you're starting a new backend today and you're not Netflix, you almost certainly don't need seven services and a mesh. You need one deployable, with real seams cut into it by tooling, not tribal knowledge. Ship the boring thing. Let your traffic and your team size tell you when it's time to cut a module loose — don't let a conference talk tell you.

What's the ugliest cross-module import you've found in your own "modular" monolith? I guarantee it's not as clean as the diagram says.
