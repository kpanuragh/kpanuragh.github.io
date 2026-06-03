---
title: "GraphQL Security: Your Schema Is a Treasure Map for Attackers 🗺️"
date: "2026-06-03"
excerpt: "Introspection enabled in production, unbounded query depth, and missing field-level auth — GraphQL ships with footguns that REST never had. Here's how to stop handing attackers a guided tour of your API."
tags:
  - security
  - graphql
  - api-security
  - backend
featured: true
---

REST APIs have decades of battle scars: improper auth, missing rate limits, BOLA everywhere. We know the playbook. GraphQL, though, ships with a different set of footguns — and the worst part is that some of them are **features turned weapons**.

Let me walk you through the three that have caused the most pain on production APIs I've worked with at Cubet.

---

## Footgun #1: Introspection — You Left the Blueprint on the Front Door

GraphQL's introspection system is genuinely brilliant for development. You type `__schema` and get a full machine-readable map of every type, field, argument, and relationship your API exposes. Every GraphQL IDE in existence relies on it.

Here's the problem: **most teams leave it enabled in production.**

An attacker doesn't need to brute-force your endpoints. They just send one query:

```graphql
{
  __schema {
    types {
      name
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }
}
```

And they get back your entire data model. Every type. Every field. Every relationship. Every mutation. It's like handing someone a floor plan of your bank and saying "good luck though, the vault is locked." They now know exactly what to probe.

Tools like [GraphQL Voyager](https://github.com/graphql-kit/graphql-voyager) and [InQL](https://github.com/doyensec/inql) turn that introspection dump into a beautiful interactive graph of your API within seconds. Security researchers use them. So do attackers.

**The fix is one line** in most server implementations. In Apollo Server:

```js
const server = new ApolloServer({
  schema,
  introspection: process.env.NODE_ENV !== 'production',
  // Also consider: only allow for authenticated internal users
});
```

If you genuinely need introspection for internal tooling, put it behind authentication — require an `Authorization` header with an internal service token before allowing `__schema` queries. Don't just toggle a boolean and call it done; gate it properly.

---

## Footgun #2: Unbounded Query Depth — The DoS That Looks Like a Feature

GraphQL lets clients request nested data in a single query. This is one of its best features. It's also one of its worst security properties.

Imagine you have a social graph: `User → friends → friends → friends → ...`. A malicious client can craft a deeply nested query that causes your server to execute an exponential number of database lookups:

```graphql
{
  user(id: "1") {
    friends {
      friends {
        friends {
          friends {
            friends {
              name
              email
            }
          }
        }
      }
    }
  }
}
```

Each level fans out. At depth 6 with an average of 50 friends per user, you're asking for 50^5 = 312 million potential database rows. Your server will either OOM or sit there grinding while legitimate users wonder why the app is frozen.

This is sometimes called a **query complexity attack** or **batching attack**, and it's trivially easy to execute against any GraphQL API that hasn't thought about it.

The solution is query depth limiting and complexity analysis. Using `graphql-depth-limit`:

```js
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(7), // Reject queries deeper than 7 levels
    createComplexityLimitRule(1000, {
      onCost: (cost) => console.log('Query cost:', cost),
    }),
  ],
});
```

Pick depth and complexity limits that fit your actual schema — not arbitrary numbers. Map out your deepest legitimate query (usually a dashboard load or a complex list view) and set the limit just above it. Then add alerting when queries approach that ceiling; it's a good signal that someone is either probing your API or you have a frontend making inefficient requests.

---

## Footgun #3: Field-Level Authorization — GraphQL Doesn't Do It For You

This one is subtle and it bites teams that migrate from REST. With REST, authorization is typically enforced at the route level — middleware runs before the handler, checks permissions, returns 403 if needed. Clean, centralized.

GraphQL has one endpoint (`/graphql`), and the authorization has to happen **inside resolvers**. The framework won't do it for you. And because resolvers are wired up individually, it's easy to forget one.

The result: you add a `isAdmin: Boolean` field to your `User` type for an internal dashboard, wire up the resolver, and forget to check that only admins can request it. Now every authenticated user can query `{ user(id: "me") { isAdmin email stripeCustomerId } }` and see fields they were never supposed to see.

The pattern I reach for is a resolver middleware / shield layer:

```js
import { rule, shield, and } from 'graphql-shield';

const isAuthenticated = rule()((parent, args, ctx) => {
  return ctx.user !== null;
});

const isAdmin = rule()((parent, args, ctx) => {
  return ctx.user?.role === 'admin';
});

export const permissions = shield({
  Query: {
    adminStats: isAdmin,
    myProfile: isAuthenticated,
  },
  User: {
    stripeCustomerId: isAuthenticated,
    isAdmin: isAdmin, // Even individual fields can be gated
  },
});
```

`graphql-shield` wraps your resolvers with permission rules that compose cleanly. The key is making the secure path the default: `allowExternalErrors: false` so permission failures don't leak internal error messages, and `fallbackRule: deny` so anything you haven't explicitly allowed is rejected by default.

---

## The Mindset Shift

REST and GraphQL need different security models because they have different trust surfaces:

| Concern | REST | GraphQL |
|---|---|---|
| Schema discovery | Manual enumeration | Introspection (disable in prod) |
| DoS via complexity | Expensive endpoints | Query depth/complexity limits |
| Authorization | Route-level middleware | Per-resolver + per-field |

None of these are GraphQL flaws — they're tradeoffs. The power GraphQL gives clients (flexible queries, nested fetching, self-describing schema) is exactly what makes these vectors exist. Knowing that, you can build defenses that fit the model instead of bolting on REST-shaped thinking.

If you're running GraphQL in production today, three quick checks: `__schema` in a browser without auth, a deeply nested query against a list type, and whether your `User` type exposes fields that shouldn't be public. If any of those three succeed without pushback, you have work to do.

---

Shipping a GraphQL API that someone's depending on? I'd love to hear what your query complexity limits look like in practice — the numbers vary wildly by schema. Find me on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) and let's compare notes.
