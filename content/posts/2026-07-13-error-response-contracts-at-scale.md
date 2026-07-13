---
title: "🧯 Error Response Contracts: Stop Making Your API Consumers Play Detective"
date: "2026-07-13"
excerpt: "Your API's happy path is beautifully documented. Its error responses are a crime scene. Here's how to design error contracts that scale past your third client team."
tags: ["api-design", "backend", "rest", "developer-experience"]
featured: true
---

Every API design doc I've ever reviewed has a gorgeous section on the happy path. Request shapes, response shapes, pagination, versioning — all lovingly documented with examples. Then you scroll to the "Errors" section and it's either missing entirely or it's one sad line: `Returns 400 if invalid.`

Invalid *how*? Which field? Should the client retry? Show the error to the user, or swallow it and log it? Congratulations, you've just handed every consumer of your API a scavenger hunt, and the prize is a support ticket with your name on it.

## The lie of "just check the status code"

Early on, most APIs get away with this:

```json
{ "error": "Something went wrong" }
```

It works fine when you have one client team, sitting three desks away, who can just ask you what happened. It stops working the moment you have five teams, a mobile app, a partner integration, and someone building against your API from a timezone eight hours away who is not going to Slack you at 2am because your error message is a shrug emoji in JSON form.

At Cubet, we hit this wall on an internal platform API that had grown from "two services talking to each other" into "eleven services and three external partners talking to each other." The turning point wasn't a fancy resilience pattern — it was realizing that every client was writing regex against our error *strings* to decide what to do next. Change a message from "Invalid email" to "Invalid email address" and you'd silently break someone's retry logic. That's not an API, that's a shared hallucination.

## A contract, not a suggestion

The fix is to treat error responses with the same rigor as success responses: a stable, versioned shape that clients can program against without parsing prose. [RFC 7807 (Problem Details for HTTP APIs)](https://www.rfc-editor.org/rfc/rfc7807) gives you a solid skeleton to start from:

```json
{
  "type": "https://api.example.com/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 402,
  "detail": "Account balance $12.40 is below the required $50.00.",
  "instance": "/payments/7f3c2e",
  "code": "PAYMENT_INSUFFICIENT_FUNDS",
  "retryable": false
}
```

The `type` field is a stable identifier — a URL that never needs to resolve to anything, it just needs to never change. The `code` field (not part of RFC 7807, but a common extension) is what your SDKs switch on. `title` and `detail` are for humans — logs, dashboards, support tickets — and are explicitly *not* meant to be parsed. That distinction is the whole game: machine-readable fields versus human-readable fields, never mixed.

## Give clients a decision, not a mystery

The most useful thing you can add beyond RFC 7807's baseline is intent: what should the client actually *do* with this error?

```typescript
type ApiError = {
  code: string;          // stable, machine-checkable: "RATE_LIMITED"
  message: string;       // human-readable, can change anytime
  retryable: boolean;     // should the client retry at all?
  retryAfterMs?: number;  // if retryable, how long to wait
  fields?: { path: string; issue: string }[]; // for validation errors
};
```

That `retryable` flag alone eliminates an entire category of bug reports. Without it, client engineers guess based on the HTTP status code, and status codes lie constantly — plenty of APIs return 400 for things that are really "try again in a second" and 500 for things that are permanently your fault. Don't make people reverse-engineer your intent from a number designed in 1999.

For validation errors specifically, always return *all* the failures, not just the first one:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Request failed validation",
  "fields": [
    { "path": "email", "issue": "must be a valid email address" },
    { "path": "age", "issue": "must be a positive integer" }
  ]
}
```

Nothing burns client-side developer trust faster than fixing one field, resubmitting, and getting hit with a *different* validation error you could've told them about the first time.

## Version the contract itself

Here's the part teams forget: the error shape needs a deprecation policy just like the success shape does. If you're going to rename a `code`, add a required field, or change what `retryable` means for a given error, that's a breaking change — treat it like one. Ship it behind a version header or a new API major version, announce it, and give consumers a migration window. The whole point of a contract is that people can rely on it without re-reading your changelog every deploy.

## Do this before your third client team shows up

If you only take one thing from this: pick a stable `code` enum today, document it, and make every error path in your codebase go through one shared error-formatting function instead of `res.status(400).json({ error: "..." })` scattered across forty route handlers. Retrofitting this after five teams depend on your error strings is miserable. Doing it now, while it's just you and a linter, takes an afternoon.

Go check your API's `/errors` documentation. If it doesn't exist, that's not a docs gap — that's an API design gap wearing a docs-shaped disguise.
