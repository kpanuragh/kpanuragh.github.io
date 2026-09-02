---
title: "💸 GraphQL Query Cost Analysis: The Bill for a Single Request Nobody Sent You"
date: "2026-09-02"
excerpt: "Rate limiting counts requests. GraphQL doesn't care about requests — one client can send exactly one and still ask your database to do the work of ten thousand. Here's why query cost analysis exists, and how to stop a five-line query from becoming a five-minute outage."
tags: ["graphql", "api-security", "cybersecurity", "backend", "appsec"]
featured: true
---

Somewhere in your API security checklist there's a line item that says "rate limiting: done." A hundred requests per minute per client, nice sliding window, Redis-backed, the whole thing. You feel good about it. You should not feel good about it, because if that API is GraphQL, you just protected yourself against the wrong axis entirely.

Rate limiting counts *requests*. GraphQL's entire pitch to the world is that a single request can ask for an arbitrarily deep, arbitrarily wide graph of data in one shot. That's the feature. It's also the attack surface. A client can stay comfortably under your rate limit — one request, sent once — and still hand your database a workload that would normally take ten thousand REST calls to produce. You didn't get rate-limited. You got nested.

## The Query That Looks Like Nothing

Here's a completely reasonable-looking query against a blog API:

```graphql
query EvilNesting {
  posts(first: 50) {
    author {
      posts(first: 50) {
        author {
          posts(first: 50) {
            author {
              posts(first: 50) {
                comments(first: 50) {
                  author { name }
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

Four levels of `posts → author → posts` nesting, each fanning out by 50. That's 50 × 50 × 50 × 50 = 6.25 million leaf resolutions before you even get to the comments layer, and every one of those `posts` and `author` fields is probably a resolver making its own database call unless you've got dataloader batching bolted on tightly. Nobody hand-wrote this maliciously — this is what happens when someone writes a codegen tool, a fuzzer, or just an overly enthusiastic frontend developer who wants "everything, just in case." The schema *allows* it, so eventually someone's query *does* it.

This is functionally the GraphQL version of a zip bomb: small payload in, catastrophic resource consumption out. And your beautiful per-IP rate limiter watched exactly one HTTP request go by and shrugged.

## Depth Limiting Is a Start, Not an Answer

The first fix everyone reaches for is max query depth:

```javascript
const depthLimit = require('graphql-depth-limit');

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(6)],
});
```

This blocks the obviously pathological nesting above. It does not block this:

```graphql
query WideNotDeep {
  postsA: posts(first: 1000) { title }
  postsB: posts(first: 1000) { title }
  postsC: posts(first: 1000) { title }
  # ...repeat aliasing 200 times
}
```

Depth is 2. Field aliasing lets a client fire the same expensive field hundreds of times in one request, each with its own alias, each one legally distinct as far as the validator is concerned. Depth limiting checks the shape of the tree; it says nothing about how many times you walk a wide branch or how large `first:` is at each node. You need something that actually prices the query, not just measures it.

## Cost Analysis: Give Every Field a Price Tag

Query cost analysis assigns a numeric weight to fields — usually based on how expensive the underlying resolver is and how it's affected by list-size arguments — sums the total cost of the requested query *before execution*, and rejects anything over budget. Apollo's `graphql-cost-analysis` and similar libraries let you annotate the schema:

```graphql
type Query {
  posts(first: Int = 10): [Post!]! @cost(complexity: 1, multipliers: ["first"])
}

type Post {
  author: User @cost(complexity: 2)
  comments(first: Int = 10): [Comment!]! @cost(complexity: 1, multipliers: ["first"])
}
```

Now `posts(first: 50) { author { posts(first: 50) { ... } } }` gets its cost computed recursively — each nested `posts(first: 50)` multiplies the accumulated cost by 50 again — and the analyzer can reject the whole thing at parse time, before a single resolver touches the database. The 6-million-leaf query above dies with a "query too complex" error in a few milliseconds of CPU, instead of a few minutes of Postgres agony.

The part people get wrong is treating cost as a flat per-field number and forgetting the multiplier on list arguments. A field that costs "1" is cheap when it returns one row and catastrophic when `first` is unbounded. Anywhere a client controls a list size — `first`, `last`, pagination limits, filter arrays — that argument needs to feed into the cost multiplier, or your analysis is measuring the schema's shape instead of the actual request's weight.

## Cap It, Don't Just Meter It

Cost analysis without an enforced ceiling is a dashboard, not a defense. On my team at Cubet we run introspection-time cost checks in CI against known-heavy client queries so a schema change that quietly makes some field 10x more expensive gets caught before it ships, and we enforce a hard per-request budget at the gateway — not per-field, per-request, summed. A query that's individually cheap on every field but requests forty of them in parallel still has to fit under the total.

```javascript
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const ComplexityLimitRule = createComplexityLimitRule(1000, {
  onCost: (cost) => console.log('query cost:', cost),
  formatErrorMessage: (cost) =>
    `Query cost ${cost} exceeds the maximum allowed complexity of 1000`,
});
```

Log the cost on every request even when it passes — that log line is what tells you six months from now which client integration is quietly creeping toward the ceiling before it actually breaks something.

## The Other Half: Persisted Queries

Cost analysis protects you from queries you haven't seen yet. If your GraphQL API only serves a known frontend (not a public third-party API), the stronger move is persisted queries — the client sends a hash, the server only executes queries it has pre-approved and pre-registered. Combine that with cost analysis for any endpoint that has to stay open to arbitrary queries, and you've covered both "trusted client, don't let ops break things by accident" and "untrusted client, don't let anyone break things on purpose."

Neither one replaces the other. Persisted queries lock the door; cost analysis is the alarm for the door you had to leave open.

## The Takeaway

REST APIs get their cost bounded implicitly — each endpoint does roughly one thing, so counting requests is a decent proxy for counting work. GraphQL breaks that proxy on purpose, because flexible querying is the whole value proposition. That means the security model has to move from "how many requests" to "how expensive was this one request," and that shift doesn't happen automatically — it's a schema annotation you have to actually write, on every field that can fan out.

If your GraphQL API has depth limiting and nothing else, you've blocked the attack that was too obvious to actually show up in production and left the door open for the one that will.

---

Found a query that blew past your depth limit but sailed under the radar anyway? I'd genuinely like to hear about it — come argue with me on [Twitter/X](https://twitter.com/kpanuragh) or check out more posts on [GitHub](https://github.com/kpanuragh). 🕸️
