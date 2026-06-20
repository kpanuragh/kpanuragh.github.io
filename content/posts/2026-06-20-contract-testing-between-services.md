---
title: "🤝 Contract Testing: Stop Praying Your Services Still Speak the Same Language"
date: "2026-06-20"
excerpt: "Your unit tests pass, your integration tests pass, and then production breaks because Service A renamed a field that Service B depended on. Contract testing is the missing layer that catches this before it ships."
tags: ["contract-testing", "microservices", "testing", "pact", "backend", "api"]
featured: true
---

Picture this: it's 2 AM, PagerDuty is screaming, and after 40 minutes of frantic log-diving you discover the root cause. Someone on the User Service team renamed `email` to `emailAddress` during a "harmless" cleanup refactor. Their tests all passed. Your Notification Service — which calls User Service to get that email — has been reading `undefined` for six hours and silently swallowing failures like a polite dinner guest.

Sound familiar? This is the microservices trust problem, and **contract testing** is the answer nobody reaches for until they've been burned badly enough.

## What Even Is Contract Testing?

A **contract** is a formal, machine-readable agreement about what one service sends and what another service expects to receive. Consumer-driven contract testing (CDCT) flips the usual testing model on its head:

- The **consumer** (the service making the request) defines what it needs from the provider.
- The **provider** (the service being called) verifies it can actually satisfy those needs.
- The contract file lives in a shared broker (or just a git repo) and becomes the source of truth.

The most popular implementation is [Pact](https://docs.pact.io/), which exists for pretty much every language that matters. The workflow looks like this:

```
Consumer writes test → Pact generates contract file → Provider runs verification against it
```

That's it. No shared test environments. No "let's spin up the whole stack to test one endpoint." No hoping that both teams read the same Confluence doc.

## The Consumer Side: Writing Your Expectations

At Cubet, we had a notifications service that consumed a user profile API. Here's a simplified Pact consumer test in Node.js:

```javascript
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');
const { like, string } = MatchersV3;

const provider = new PactV3({
  consumer: 'NotificationService',
  provider: 'UserService',
  dir: './pacts',
});

describe('User Service contract', () => {
  it('returns the user email for a given ID', async () => {
    await provider.addInteraction({
      states: [{ description: 'user 42 exists' }],
      uponReceiving: 'a request for user 42',
      withRequest: {
        method: 'GET',
        path: '/users/42',
      },
      willRespondWith: {
        status: 200,
        body: {
          id: like(42),
          email: string('user@example.com'),
          displayName: like('Alice'),
        },
      },
    });

    await provider.executeTest(async (mockServer) => {
      const client = new UserClient(mockServer.url);
      const user = await client.getUser(42);
      expect(user.email).toBeDefined();
    });
  });
});
```

When this test runs, Pact spins up a mock server and generates a `pacts/NotificationService-UserService.json` contract file. The key insight: **we're only asserting what we actually care about.** The `like()` matcher says "I need `id` to be a number — I don't care which one." We're not brittle about fields we don't use, so adding new fields to the User Service response never breaks the contract.

## The Provider Side: Proving You Can Deliver

Now the User Service team takes that contract file and runs verification against their actual implementation:

```javascript
const { Verifier } = require('@pact-foundation/pact');

describe('Pact verification', () => {
  it('validates the contract with NotificationService', () => {
    return new Verifier({
      provider: 'UserService',
      providerBaseUrl: 'http://localhost:3001',
      pactUrls: ['./pacts/NotificationService-UserService.json'],
      stateHandlers: {
        'user 42 exists': async () => {
          await db.seed({ id: 42, email: 'user@example.com', displayName: 'Alice' });
        },
      },
    }).verifyProvider();
  });
});
```

The `stateHandlers` block is where the magic happens — it seeds the provider's database into whatever state the consumer assumed when writing the test. If the provider renames `email` to `emailAddress`, this verification step **fails in CI before anyone merges anything.** No 2 AM incidents required.

## Why This Beats Integration Tests for API Boundaries

Integration tests against a shared staging environment feel thorough but have ugly failure modes:

- **Flakiness** from environment state and network blips
- **Coupling** — you can't deploy Service A until Service B is ready, and vice versa
- **Slow feedback** — you find out about the mismatch after both services are deployed
- **No ownership** — who fixes a staging test that crosses team boundaries?

Contract tests run in **each service's own CI pipeline, against no external dependencies.** The consumer team catches breaking changes before they push. The provider team catches them before they merge. Both teams can deploy independently, confident the contract holds.

## Where It Gets Tricky

Contract testing isn't a silver bullet. A few gotchas:

**State management is fiddly.** Those `stateHandlers` need to be maintained as the schema evolves. If a provider-side setup handler gets out of sync with reality, your "green" verification isn't worth much.

**It only tests what consumers have expressed.** If Service B is buggy and never tests the `role` field it silently reads, the contract won't catch a breaking change to `role`. You still need API versioning discipline.

**Schema changes flow one way.** If the provider wants to deprecate a field, they need to check whether *any* consumer contract still references it. A **Pact Broker** (the open-source or hosted version) handles this with a dependency graph — "can I deploy UserService?" resolves against every registered consumer contract.

## The Practical Rollout

We phased this in at Cubet rather than retrofitting every service at once. Start at the highest-traffic API boundary, the one that has caused the most prod incidents. Write consumer tests for what you actually consume — nothing more. Get the provider verification running in CI. Repeat for the next boundary.

Within a quarter, the "someone changed an API and broke us" category of incidents basically disappeared. The contracts became living documentation that stayed accurate because they were executed, not just written.

## TL;DR

Contract testing fills the gap between "unit tests that test nothing real" and "integration tests that take forever and lie to you." Consumers own their expectations; providers verify them. Both sides get confidence without shared environments, without synchronization overhead, and without that 2 AM call.

If your team has more than two services talking to each other, you're already paying the coordination tax. Contract testing just makes it explicit — and automatable.

Pick one API boundary this week. Write the consumer pact. Make the provider verify it in CI. That's the whole entry cost.
