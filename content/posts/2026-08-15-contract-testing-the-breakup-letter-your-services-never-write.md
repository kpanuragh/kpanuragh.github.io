---
title: "💌 Contract Testing: The Breakup Letter Your Microservices Never Write"
date: "2026-08-15"
excerpt: "Your integration tests pass. Staging is green. Then a downstream team renames a field and production quietly starts dropping orders. Contract testing is how you catch that before it ships — without spinning up eleven services just to test one."
tags: ["testing", "microservices", "backend", "ci-cd", "software-architecture"]
featured: true
---

Two services can be individually, perfectly, 100%-covered tested and still take production down together. Not because either one is buggy — because they disagreed about the shape of the thing passed between them, and nobody's test suite ever asked "hey, do you two actually agree on this?"

I've watched this happen in slow motion: the orders service renamed `customer_id` to `customerId` in a "just cleaning up the API" PR. Its own unit tests passed — the field was renamed consistently everywhere internally. Its integration tests passed — they mocked the downstream billing service, which happily accepted whatever shape you handed it because mocks don't complain. It shipped. Billing started reading `undefined` where a customer ID used to be, quietly created invoices for nobody, and by the time anyone noticed, we had a spreadsheet of orphaned charges and a very awkward incident review.

Nobody was wrong in isolation. That's the whole problem with isolation.

## Why "just write more integration tests" doesn't scale

The obvious fix is: spin up both services together and test the real interaction. And sure, do some of that. But push it far enough and you end up with a "test environment" that's actually eleven services, three databases, and a message broker, all of which need to be running and healthy before a single assertion executes. It's slow, it's flaky for reasons that have nothing to do with your code (whose Kafka topic didn't come up in time this run?), and it only tests the *specific* interaction your test author thought to exercise. The billing team never wrote a test for "what if orders renames a field," because why would they — they don't own that field.

Contract testing flips the ownership. Instead of one team writing a giant integration test that spans both services, each side writes down what it expects, independently, and a shared contract gets verified against both. The consumer says "here's what I need from you, in this exact shape." The provider proves, on every build, that it still delivers that shape — without the consumer's actual service needing to be running at all.

## What a contract actually looks like

Tools like Pact are built exactly for this. The consumer (billing, in my example) writes a test against a *mock* of the orders service, but that mock isn't hand-rolled — it's generated from an explicit expectation, and that expectation gets recorded as a contract file.

```javascript
// billing service — consumer contract test
const { PactV3, MatchersV3 } = require('@pact-foundation/pact')
const { like, string } = MatchersV3

const provider = new PactV3({
  consumer: 'billing-service',
  provider: 'orders-service',
})

describe('fetching an order for invoicing', () => {
  it('returns a customerId field', () => {
    provider
      .given('order 123 exists')
      .uponReceiving('a request for order 123')
      .withRequest({ method: 'GET', path: '/orders/123' })
      .willRespondWith({
        status: 200,
        body: {
          orderId: string('123'),
          customerId: like('cust_9f2a'),
          totalCents: like(4599),
        },
      })

    return provider.executeTest(async (mockServer) => {
      const order = await fetchOrder(mockServer.url, '123')
      expect(order.customerId).toBeDefined()
    })
  })
})
```

Running this test does two things: it verifies billing's own code handles that shape correctly, and it emits a contract file — a machine-readable record of exactly what billing expects `GET /orders/123` to return. That contract gets published somewhere both teams can reach (a Pact Broker, or honestly just a shared repo if you're small).

The orders team then runs a *provider verification* against that same contract, against their real, actual service — no mocking on their side:

```javascript
// orders service — provider verification
const { Verifier } = require('@pact-foundation/pact')

new Verifier({
  provider: 'orders-service',
  providerBaseUrl: 'http://localhost:4000',
  pactBrokerUrl: process.env.PACT_BROKER_URL,
  consumerVersionSelectors: [{ mainBranch: true }],
  publishVerificationResult: true,
  providerVersionBranch: process.env.GIT_BRANCH,
  stateHandlers: {
    'order 123 exists': async () => seedOrder({ id: '123', customerId: 'cust_9f2a' }),
  },
}).verifyProvider()
```

Now rename `customerId` to `customer_id` on the orders side, and this step fails — in orders' own CI, on orders' own PR, before it merges. Not in production three weeks later. Not in a Slack thread titled "why are invoices empty."

## The part that actually saves you: can-i-deploy

The real payoff isn't the individual test — it's a question you can ask your CI pipeline before every deploy: "has every consumer of my API verified this exact version of my contract?"

```bash
pact-broker can-i-deploy \
  --pacticipant orders-service \
  --version $GIT_SHA \
  --to-environment production
```

This is the piece that replaces "deploy and hope someone notices the dashboard turn red." If billing's contract hasn't been verified against this build of orders yet, the deploy gate fails, on purpose, with a message that says exactly which consumer would break and why. That's a fundamentally different failure mode than an incident — it's a red CI check instead of a page at 2am.

At Cubet, we rolled this out gradually — starting with just the two or three services that kept breaking each other, not the whole mesh at once. That mattered more than the tooling choice. Trying to contract-test twenty services on day one just means twenty contracts nobody maintains. Two teams, one recurring pain point, one contract — that's a scope people will actually keep up to date.

## Where it stops helping

Contract testing verifies *shape and behavior at the boundary* — status codes, required fields, types, maybe some business-rule states ("order exists" vs "order not found"). It will not catch that your new pricing logic computes the wrong total, or that your database index disappeared. It's not a replacement for integration or end-to-end tests, just a much cheaper first line of defense for the specific failure mode of "we disagreed about the interface." Keep a thin layer of real end-to-end tests for the handful of critical paths that genuinely need multiple live services — just don't make that your only net.

## Try it on the pair that's already burned you

You almost certainly already know which two services in your system have broken each other before — the ones where someone says "oh yeah, don't touch that field without pinging the other team" as tribal knowledge instead of a test. That's your starting pair. Write one consumer contract, wire up provider verification in CI, add `can-i-deploy` to your deploy pipeline, and you've turned a Slack-message-shaped safety mechanism into a machine-enforced one. It won't feel like much the first week. It'll feel like everything the first time it silently blocks the deploy that would've been your next incident review.
