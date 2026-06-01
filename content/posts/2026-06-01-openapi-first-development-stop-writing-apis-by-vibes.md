---
title: "OpenAPI-First Development: Stop Writing APIs by Vibes 📋"
date: 2026-06-01
excerpt: "Discover how contract-first API development with OpenAPI transforms the chaos of undocumented endpoints into a structured, team-friendly workflow where nobody is blocked and nothing is a surprise."
tags: ["api-design", "openapi", "backend", "developer-experience", "documentation"]
featured: true
---

Picture this: your frontend developer pings you at 11 AM. "Hey, does `/api/users/:id` return `firstName` or `first_name`?" You squint at code you wrote six weeks ago. You write back "uhh, one sec." Fifteen minutes and three `console.log`s later: "it's `full_name` actually, we changed it." Silence. Then a muted scream emoji.

This is what I call **API by vibes** — building endpoints in whatever shape feels right in the moment, documenting them in a Notion page that immediately starts rotting, and hoping your teammates can telepathically figure out the contract. Spoiler: they cannot.

There's a better way: **OpenAPI-first development**. Write the contract before you write a single line of implementation. Your frontend team unblocks themselves, your backend team has a clear spec to implement against, and the documentation is never stale because it *is* the source of truth.

## What "Contract-First" Actually Means

OpenAPI (formerly Swagger) is a YAML/JSON schema language for describing REST APIs. Contract-first means you write the spec *first* — before Express routes, before database queries, before anything. The spec becomes the agreement between producer (backend) and consumer (frontend or third parties).

The workflow looks like this:

1. **Design** — write the OpenAPI spec together as a team
2. **Mock** — spin up a mock server from the spec so consumers can start immediately
3. **Implement** — build the real server, validated against the same spec
4. **Publish** — serve generated docs automatically; they can't drift because they come from the spec

Compare this to the alternative: implement first, document later, watch the docs diverge from reality by next sprint, repeat forever.

## A Minimal OpenAPI Spec

Here's a taste of what a spec looks like — a user resource with a single endpoint:

```yaml
openapi: 3.1.0
info:
  title: Users API
  version: 1.0.0

paths:
  /users/{id}:
    get:
      operationId: getUserById
      summary: Fetch a single user
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: User found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "404":
          description: User not found

components:
  schemas:
    User:
      type: object
      required: [id, email, fullName, createdAt]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        fullName:
          type: string
        createdAt:
          type: string
          format: date-time
```

That's it. `fullName`, not `firstName`, not `first_name`. Written down. Committed to Git. Now nobody has to ask.

## Unblocking the Frontend with Prism

Once the spec exists, the frontend team doesn't need to wait for you to finish the implementation. [Prism](https://stoplight.io/open-source/prism) can spin up a mock server straight from the YAML file:

```bash
npx @stoplight/prism-cli mock openapi.yaml
# Server running on http://127.0.0.1:4010

curl http://127.0.0.1:4010/users/abc123
# → {"id":"abc123","email":"user@example.com","fullName":"Jane Doe","createdAt":"2026-06-01T..."}
```

Prism reads your schema, generates realistic fake responses, and even validates that incoming requests match the spec. The frontend can build the entire UI against this mock while you're still writing database migrations. Zero blocking.

At Cubet, we adopted this pattern on a mid-size SaaS project where the mobile and web teams needed to move in parallel with the API team. Prism meant all three tracks ran concurrently in the same sprint. What used to take three sprints of sequential work collapsed into one.

## Validating Requests in Express (So the Contract Stays Honest)

Mocking is great for development, but you also want your *real* server to enforce the contract at runtime. The `express-openapi-validator` package does exactly that — it reads your spec file and rejects any request (or response) that doesn't match:

```js
import OpenApiValidator from 'express-openapi-validator';
import express from 'express';

const app = express();
app.use(express.json());

app.use(
  OpenApiValidator.middleware({
    apiSpec: './openapi.yaml',
    validateRequests: true,
    validateResponses: true, // catches bugs where your own handler returns wrong shape
  })
);

// Your regular routes — the middleware handles validation errors automatically
app.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(user);
});

// Validation errors surface here — 400 with details, automatically
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ message: err.message });
});
```

The killer feature here is `validateResponses: true`. If your database returns a user object that's missing a required field — say your `createdAt` column got renamed — the middleware catches it *in development* and throws a 500 with a descriptive message. Your contract violation is caught before it ever reaches staging.

## The Bonus You Didn't Ask For: Free Client Generation

Once you have a spec, tools like `openapi-generator-cli` can spit out typed API clients for any language. Your frontend gets a TypeScript client with full types. Your mobile team gets a Swift client. Your QA team can run contract tests against the live server with [Schemathesis](https://schemathesis.readthedocs.io), which fuzzes every endpoint according to the schema.

All of this flows downstream from the single YAML file you wrote before line one of implementation.

## The Mindset Shift That Makes It Stick

The hardest part of OpenAPI-first isn't the tooling — it's the cultural shift. Developers want to code. Writing YAML before writing code feels like extra homework. The trick is to frame the spec as the *design* phase, not the documentation phase. You're not documenting something you already built. You're deciding what to build before the decisions get expensive to change.

Get the team in a call, share your screen, sketch the resources and responses together. That 30-minute YAML session will save you two weeks of "wait, which field name are we using?" conversations.

## Where to Start

1. Pick one existing endpoint. Describe it in OpenAPI (the [Swagger Editor](https://editor.swagger.io) has live preview).
2. Add `express-openapi-validator` to your Express app and point it at the spec.
3. Watch your tests catch every place your implementation drifted from the spec.
4. Expand from there — one endpoint at a time, until the whole API is covered.

You don't have to rewrite everything at once. The spec grows with the product.

---

APIs are interfaces between people as much as between systems. A contract written in YAML is just a team agreement written in a format that computers can enforce. That's not extra process — that's the whole job of a senior backend engineer: remove ambiguity before ambiguity ships to production.

Pick up the spec. Write it first. Your frontend teammate will stop sending you muted scream emojis. Probably.

*Have you adopted OpenAPI-first in your workflow? What tooling are you using? Drop it in the comments — always keen to see how other teams handle the design phase.*
