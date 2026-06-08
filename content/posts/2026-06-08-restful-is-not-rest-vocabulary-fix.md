---
title: "🧠 Your API Isn't REST: The Vocabulary Fix That Changes Everything"
date: 2026-06-08
excerpt: "Most APIs called \"RESTful\" violate at least three of Roy Fielding's original constraints. Here's the vocabulary fix that will make you a better API designer — even if you never implement true REST."
tags:
  - backend
  - api-design
  - rest
  - http
  - architecture
featured: true
---

Here's a confession I had to make to myself a few years into my career: I had built dozens of "RESTful" APIs and had absolutely no idea what REST actually was.

I knew the moves. HTTP verbs. JSON responses. Plural nouns for resource paths. Status codes. I could pass any "do you know REST?" interview question. But I was doing what most of the industry does — calling an HTTP+JSON API "REST" and moving on.

Roy Fielding, the guy who *invented* REST in his 2000 PhD dissertation, has had to correct this confusion so many times that he got visibly annoyed about it on his blog. If the inventor of a concept keeps having to explain that you're using the word wrong, that's a signal worth paying attention to.

## What REST Actually Is

REST stands for Representational State Transfer. Fielding defined it as an *architectural style* — a set of six constraints. If your API doesn't satisfy all six, it's not REST. It might be a perfectly good API! But it's not REST.

The six constraints are:

1. **Client-Server** — UI and data storage are separated. (Almost everyone does this.)
2. **Stateless** — Each request contains all the information needed to process it. No session state on the server. (Most do this, though session-based auth violates it.)
3. **Cacheable** — Responses must be labeled as cacheable or not. (Often ignored.)
4. **Uniform Interface** — The big one. We'll get to it.
5. **Layered System** — Clients don't need to know if they're talking to a load balancer, cache, or origin server.
6. **Code on Demand** *(optional)* — Servers can send executable code to clients (e.g., JavaScript).

Most APIs I've seen — including ones I've built — nail constraints 1, 2, and 5 incidentally. The real question is constraint 4: **Uniform Interface**.

## The Constraint Everyone Ignores

The Uniform Interface has four sub-constraints. The one that kills 99% of "RESTful" APIs is called **HATEOAS** — Hypermedia as the Engine of Application State. Even the acronym sounds like a curse.

HATEOAS means that a client navigating your API should be able to do so *entirely* through hyperlinks included in server responses. The client shouldn't need a separate API doc to know what actions are available at any given state. The response tells you.

Think of it like a web browser. You don't hardcode URLs into your browser. You start at a homepage, and links guide you from there. True REST works the same way for API clients.

This is what a true REST response looks like for an order resource:

```json
{
  "id": "ord_9a4b2c",
  "status": "pending",
  "total": 149.99,
  "_links": {
    "self": { "href": "/orders/ord_9a4b2c" },
    "confirm": { "href": "/orders/ord_9a4b2c/confirm", "method": "POST" },
    "cancel": { "href": "/orders/ord_9a4b2c/cancel", "method": "DELETE" },
    "customer": { "href": "/customers/cust_7x3k1" }
  }
}
```

The client doesn't need to know the URL pattern to confirm an order. The response hands it over. If the order is already confirmed, the `confirm` link simply won't appear — the hypermedia *drives* the state machine.

Now here's what 99% of "RESTful" APIs actually return:

```json
{
  "id": "ord_9a4b2c",
  "status": "pending",
  "total": 149.99
}
```

And then they have a 40-page Swagger doc explaining what you can do with this data. That's not REST. That's an HTTP API. Which is totally fine! HTTP APIs are great. Just call them what they are.

## Why the Vocabulary Matters

"This is just semantics." I've heard this. I've *said* this. I was wrong.

Calling something "REST" when it isn't creates real problems:

**False design guarantees.** When a team says "we use REST," other developers expect certain behaviors — like being able to discover the API through its responses, or that a client can be written without knowing all the URL templates upfront. If you don't actually have those properties, you've made a promise you can't keep.

**Cargo-cult design decisions.** I've watched teams spend days debating whether to use `POST /users/deactivate` or `PATCH /users/{id}` with `{ "active": false }`, framing it as "which is more RESTful." Neither makes the API more or less REST if you're not implementing HATEOAS. The debate is ungrounded — you're arguing about the color of a car you don't own.

**Missed alternatives.** If you're building an HTTP API anyway, maybe you should evaluate GraphQL, JSON:API, or just well-designed RPC. The "REST or bust" framing prevents that conversation.

At Cubet, when we onboard a new team member onto an API project, I've started using the phrase "HTTP API" instead of "RESTful API" deliberately. It's a small change, but it immediately shifts conversations: instead of debating whether something "violates REST," we talk about whether it makes the API easier to use. That's the actual goal.

## The Practical Takeaway

You have two honest options:

**Option A: Build a real REST API.** Implement HATEOAS. Responses include links to valid next actions. Clients can discover the entire API from a single entry-point URL. This is genuinely powerful — clients decouple from server URL structure, and the server can evolve freely. Libraries like HAL, JSON:API, and Siren define standard formats for this. It's more work, but it pays off for long-lived, widely-integrated APIs.

**Option B: Build an HTTP API.** Use HTTP semantics sensibly. Plural nouns for collections. Proper status codes. Consistent error formats. Document it with OpenAPI. This is what most of us are building, and it's the right choice for the vast majority of projects. Just stop calling it REST.

```
GET  /invoices          → 200 list
GET  /invoices/42       → 200 single
POST /invoices          → 201 created
PATCH /invoices/42      → 200 updated
DELETE /invoices/42     → 204 no content
```

Clean, predictable, useful. Not REST. Not a problem.

## The One Question to Ask

Whenever someone says "we follow REST principles" in a design doc or interview, the fastest gut-check is: *can a client navigate your API from a single root URL without reading documentation?*

If the answer is no, you have an HTTP API. Welcome to the club — it's the right choice for most use cases.

The goal was never REST for REST's sake. The goal was APIs that are easy to use, easy to evolve, and hard to misuse. REST is one path to that. A well-designed HTTP API is another. Know which one you're building, name it correctly, and design with intention.

The vocabulary fix is small. The clarity it brings is not.

---

*What do you call your APIs? Do you follow HATEOAS, or have you found a middle ground? I'd love to hear how other teams handle this — drop a note on the [GitHub discussions](https://github.com/kpanuragh/kpanuragh.github.io/discussions) or reach out directly.*
