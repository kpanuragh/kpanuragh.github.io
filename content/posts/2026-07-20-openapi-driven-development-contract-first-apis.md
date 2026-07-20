---
title: "📜 OpenAPI-Driven Development: Write the Contract, Then Fight About It"
date: "2026-07-20"
excerpt: "Code-first API design means your docs are always a little bit lying to you. Contract-first flips the order — the OpenAPI spec becomes the single source of truth, and everything else (server, client, mocks, tests) gets generated from it. Here's how that actually works day to day."
tags: ["api-design", "openapi", "backend", "developer-experience"]
featured: true
---

Every backend team has had this conversation at least once:

Frontend: "The `/users` endpoint returns `created_at`, right?"
Backend: "Yeah — wait, no, we renamed it to `createdAt` last sprint."
Frontend: "The Swagger docs still say `created_at`."
Backend: "...I'll update those."

Narrator: they did not update those.

This is the tragedy of **code-first** API development. You write your Express routes or your controller classes first, and the documentation gets bolted on afterward as an afterthought — usually via a `@swagger` JSDoc comment nobody remembers to touch when the response shape changes. The docs describe what the API *used* to do, and by the time anyone notices, three microservices have already integrated against the wrong field name.

**Contract-first (aka OpenAPI-driven) development** flips this around: you write the OpenAPI spec *before* a single line of route handler exists. The spec isn't documentation of the API — it *is* the API. Everything downstream — server stubs, client SDKs, mock servers, validation middleware, even your test fixtures — gets generated from that one YAML file. If the spec is wrong, nothing compiles. If the spec is right, the docs can never lie to you, because the docs are the source, not a summary.

## The workflow, roughly

1. **Design the contract first.** Before writing any implementation, you and whoever's consuming the API (frontend team, partner API, mobile app) sit down and write the `openapi.yaml`. This is genuinely where most of the value lives — arguing about field names and status codes on a whiteboard is cheap; arguing about them after the client SDK has already shipped is expensive.

2. **Generate a mock server** so frontend work can start immediately, without waiting for backend to write a single handler.

3. **Generate server stubs and client types** so the implementation is forced to conform to the contract, not the other way around.

4. **Validate requests/responses against the spec at runtime or in CI**, so drift gets caught as a build failure instead of a Slack message three weeks later.

Here's a trimmed-down contract for a `POST /orders` endpoint:

```yaml
paths:
  /orders:
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [customerId, items]
              properties:
                customerId: { type: string, format: uuid }
                items:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    required: [sku, quantity]
                    properties:
                      sku: { type: string }
                      quantity: { type: integer, minimum: 1 }
      responses:
        '201':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '422':
          description: Validation failed
```

Notice what's baked in: `quantity` can't be zero, `items` can't be empty, `customerId` has to look like a UUID. None of that lives in `if` statements scattered across your route handler — it's declared once, in the contract, and every tool that touches this spec enforces it identically.

## Generating instead of writing

Once the contract exists, you stop hand-writing the boring parts. `openapi-typescript` turns that schema into TypeScript types your frontend imports directly:

```ts
import type { paths } from './generated/api-types';

type CreateOrderBody =
  paths['/orders']['post']['requestBody']['content']['application/json'];

async function createOrder(body: CreateOrderBody) {
  const res = await fetch('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}
```

If backend adds a required field to the schema, this literally fails to compile on the frontend until someone supplies it. That's the whole point — the contract enforces itself across a team boundary that Slack messages never could.

On the server side, tools like `express-openapi-validator` sit in front of your handlers and reject anything that doesn't match the spec, so your business logic never has to defensively check "did they actually send `quantity` as a number." The contract already guaranteed it by the time your code runs.

```js
const OpenApiValidator = require('express-openapi-validator');

app.use(
  OpenApiValidator.middleware({
    apiSpec: './openapi.yaml',
    validateRequests: true,
    validateResponses: true, // yes, even your own responses get checked
  })
);
```

That `validateResponses: true` line is the one people skip and then regret. It catches the case where *your own server* drifts from the contract — you rename a field internally, forget the spec, and now you're serving invalid responses to every consumer. Without response validation, you find out from an angry Slack message. With it, you find out from a failed test in CI, which is a much better place to find things out.

## Where this actually pays off

I've watched this pattern save the most pain not on day one, but six months in, when the third team wants to integrate with an API nobody on the current team originally wrote. At Cubet, we adopted this for an internal service-to-service API after one too many "the docs say X but production does Y" incidents burned an afternoon of debugging that turned out to be a stale Postman collection. Once the spec became the actual build artifact — checked into the repo, validated in CI, used to generate the client — the docs-vs-reality gap just stopped being a category of bug we had.

The honest tradeoff: contract-first is slower on day one. Writing a YAML schema before you've even prototyped the feature feels like bureaucracy when you're used to just typing `res.json({ ...whatever })` and moving on. But that upfront friction is exactly the conversation you want to have *before* three consumers have integrated against your typo.

If your team is still treating Swagger docs as something you "add later," pick one endpoint — ideally one that's caused a docs-drift incident before — and rebuild it contract-first. Generate the types, wire up response validation, and see how many implicit assumptions your current "documentation" was quietly getting wrong.
