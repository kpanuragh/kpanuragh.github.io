---
title: "GraphQL Security: Your Entire API Schema Is Showing 🔍"
date: "2026-02-23"
excerpt: "GraphQL is powerful, flexible, and absolutely riddled with security foot-guns nobody tells you about. Let me ruin your day and then fix it."
tags: ["cybersecurity", "web-security", "security", "graphql", "api-security"]
featured: false
---

# GraphQL Security: Your Entire API Schema Is Showing 🔍

I once stared at a production GraphQL endpoint and watched it dutifully hand me the **entire database schema, every type, every field, every relationship** — in one unauthenticated query.

The developer had proudly shipped "a modern, flexible API." What they'd actually shipped was a treasure map with an arrow pointing to their crown jewels.

GraphQL is genuinely fantastic. It's also a security nightmare if you don't know what you're doing. Let's talk about it.

## What Makes GraphQL Different (and Dangerous) 🧨

REST APIs are like a restaurant menu — you pick from what's listed. GraphQL is like having a private chef: you ask for exactly what you want, and it delivers.

That flexibility? It's also the attack surface.

In REST, an attacker has to guess endpoints. In GraphQL, there's **one endpoint** — and it'll happily describe itself to anyone who asks.

## Attack #1: Introspection — "Please Tell Me Everything" 🗺️

This is the first thing any security researcher (or attacker) does against a GraphQL endpoint:

```graphql
{
  __schema {
    types {
      name
      fields {
        name
        type { name }
      }
    }
  }
}
```

Run this against a naive production API and you get back **every type, every query, every mutation, every field**. It's like handing someone your entire codebase.

In my experience building production systems, I've seen teams treat introspection as a developer convenience they forgot to turn off. One client had internal admin mutations — `deleteAllUsers`, `resetBilling`, `grantAdminAccess` — all fully visible via introspection. None of them were behind any auth check.

**The Fix:**

```javascript
// Apollo Server - disable introspection in production
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
});
```

```php
// For Laravel Lighthouse
// config/lighthouse.php
'security' => [
    'disable_introspection' => env('APP_ENV') === 'production',
],
```

**Pro Tip:** Even with introspection disabled, field suggestions remain active. If you typo a field name, GraphQL kindly says "Did you mean `adminPassword`?" — effectively leaking schema through error messages. Disable those too, or use a generic error handler.

## Attack #2: The Nested Query Bomb 💣

REST APIs are stateless requests — each one is bounded. GraphQL queries can nest **arbitrarily deep**.

```graphql
{
  user {
    friends {
      friends {
        friends {
          friends {
            friends {
              # ... 50 more levels
              posts {
                comments {
                  author { friends { friends { ... } } }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

One query. Exponential database hits. Your server is now a beachball.

As someone passionate about security, this is one of those attacks that's trivially easy for an attacker and devastatingly effective. I've tested this against internal services and watched CPU pin at 100% in under three seconds.

**The Fix — Query Depth Limiting:**

```javascript
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(5)], // Reject queries deeper than 5 levels
});
```

Also set query complexity limits — some resolvers are more expensive than others:

```javascript
import { createComplexityLimitRule } from 'graphql-validation-complexity';

validationRules: [
  depthLimit(5),
  createComplexityLimitRule(1000), // Total query cost ceiling
]
```

## Attack #3: Batching Abuse — Brute Force in One Request 🔑

GraphQL supports batching — sending multiple operations in one HTTP request. This is great for performance. It's also great for brute forcing passwords.

```json
[
  { "query": "mutation { login(email: \"admin@site.com\", password: \"password1\") { token } }" },
  { "query": "mutation { login(email: \"admin@site.com\", password: \"password2\") { token } }" },
  { "query": "mutation { login(email: \"admin@site.com\", password: \"password3\") { token } }" }
  // ... 997 more
]
```

Your rate limiter sees **one request**. Your auth system gets hit 1000 times.

In security communities, we often discuss how traditional rate limiting breaks down against batched requests — it's a common GraphQL gotcha even at companies that take security seriously.

**The Fix:**

```javascript
// Limit batch size
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Apollo Server 4
  allowBatchedHttpRequests: false, // Disable batching entirely
});

// Or if you need batching, limit batch size in middleware:
app.use('/graphql', (req, res, next) => {
  if (Array.isArray(req.body) && req.body.length > 10) {
    return res.status(400).json({ error: 'Batch size limit exceeded' });
  }
  next();
});
```

## Attack #4: Authorization Bypass in Resolvers 🚪

This is the big one. The one that actually gets data stolen.

GraphQL authentication is often handled at the gateway level — your middleware checks the JWT token. But authorization (who can see what) has to happen **inside every resolver**. Developers forget this constantly.

**The Bad Pattern:**

```javascript
// Auth middleware checks token ✓
// But the resolver trusts everyone equally ✗

const resolvers = {
  Query: {
    user: (_, { id }) => {
      return db.users.findById(id); // Anyone can fetch any user!
    },
    adminDashboard: () => {
      return db.getAdminStats(); // Any logged-in user can see this!
    }
  }
};
```

**The Safe Pattern:**

```javascript
const resolvers = {
  Query: {
    user: (_, { id }, context) => {
      // Check if requesting own profile OR is admin
      if (context.user.id !== id && !context.user.isAdmin) {
        throw new ForbiddenError('Not authorized');
      }
      return db.users.findById(id);
    },
    adminDashboard: (_, __, context) => {
      if (!context.user.isAdmin) {
        throw new ForbiddenError('Admin access required');
      }
      return db.getAdminStats();
    }
  }
};
```

**Pro Tip:** Use a library like `graphql-shield` to define authorization rules declaratively instead of scattering `if (!user.isAdmin)` checks everywhere:

```javascript
import { shield, rule, and } from 'graphql-shield';

const isAuthenticated = rule()((parent, args, ctx) => ctx.user !== null);
const isAdmin = rule()((parent, args, ctx) => ctx.user?.isAdmin === true);

const permissions = shield({
  Query: {
    user: isAuthenticated,
    adminDashboard: and(isAuthenticated, isAdmin),
  },
});
```

## Real Talk: The Production Checklist 📋

Before you expose that GraphQL endpoint to the world:

- [ ] **Disable introspection** in production (`NODE_ENV !== 'production'`)
- [ ] **Disable field suggestions** or use generic error messages
- [ ] **Set query depth limits** (5-7 is usually enough)
- [ ] **Set complexity limits** for expensive resolvers
- [ ] **Limit or disable batch requests** — or rate limit by batch operation count
- [ ] **Check authorization in every resolver** — auth middleware isn't enough
- [ ] **Never trust user-supplied IDs** without ownership checks
- [ ] **Log and monitor** slow queries (depth bomb canary)

## The Analogy That Sticks 🧠

Think of a REST API like a hotel with a front desk. You ask for room 302. The front desk checks your reservation, gives you a keycard. Access controlled.

GraphQL is like a smart home system: one voice interface, any room, infinite combinations. Incredibly convenient. But if you don't configure which rooms each person can access, someone will ask "Hey, can I have the master key?" and the system will say "Sure thing!"

The power is the problem.

## Wrapping Up 🔒

GraphQL isn't inherently insecure. It just requires you to think about security differently than REST. The attack surface has moved — from "guessing endpoints" to "abusing flexibility."

The good news: every attack I've described has a concrete mitigation. The bad news: your dev team probably hasn't applied any of them.

Go run that `__schema` query against your own API right now. If it works in production, you have work to do this afternoon.

---

**Digging deeper into API security?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my other work on [GitHub](https://github.com/kpanuragh). As someone in the security community who's spent time both building and breaking APIs, I promise there's always more to learn.

*Introspect your systems before attackers do.* 🛡️
