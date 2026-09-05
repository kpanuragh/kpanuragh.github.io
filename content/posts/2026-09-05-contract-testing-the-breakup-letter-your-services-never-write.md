---
title: "💌 Contract Testing: The Breakup Letter Your Services Never Write"
date: "2026-09-05"
excerpt: "Your order service and your payments service have been quietly changing behind each other's backs for months. Nobody noticed until a deploy on a Friday afternoon turned a 200 into a 500. Contract testing is the prenup you should have signed at the start of the relationship."
tags: ["testing", "code-quality", "backend", "microservices"]
featured: true
---

Somewhere in your architecture, two services have an understanding. The `orders` service calls `payments` expecting a response shaped like `{ status: "captured", transactionId: string }`. This has worked for eleven months. Nobody wrote it down anywhere except in the mental model of an engineer who left the team in March. Then someone on the payments team renames `transactionId` to `txnId` because it's "more consistent," ships it, and the orders service starts silently writing `undefined` into a column that used to hold a transaction reference. No test failed. No alert fired. The relationship was never formalized, so nobody could say it had been broken.

This is the problem contract testing exists to solve, and it's a completely different animal from the "spin up a real database in a container" style of integration testing. That technique verifies your code behaves correctly against *real infrastructure*. Contract testing verifies your code's *assumptions about another team's service* — without ever needing that service to be running.

## Integration Tests Answer the Wrong Question Here

The instinctive fix for the `txnId` incident is "let's add an integration test that calls the real payments service." That works until it doesn't:

```javascript
test('payment capture updates order status', async () => {
  const response = await axios.post('https://payments-staging.internal/capture', {
    orderId: 'ord_123',
    amount: 4200,
  });
  expect(response.data.transactionId).toBeDefined();
});
```

This test is honest right up until the payments team's staging environment is down, or someone's running a migration against it, or it's 2am UTC and nobody from that team is around to explain why capture is now returning 503s. You've built a test that depends on another team's uptime, another team's test data, and another team's deploy schedule. It's not really *your* test anymore — it's a bet that everyone else's systems are healthy at the exact moment your CI runs.

Worse, it tests the wrong thing. It proves the integration works *right now, against this environment*. It says nothing about whether a change either team is about to ship will break the other, because by the time this test runs against a new payments deploy, the breaking change is already live.

## Contract Testing: Write the Agreement Down, Then Enforce It

Consumer-driven contract testing (the model popularized by [Pact](https://pact.io/)) flips the direction. The *consumer* — orders, in this case — writes a test describing exactly what it expects from the provider, in isolation, with no network call to a real service:

```javascript
const { PactV3 } = require('@pact-foundation/pact');

const provider = new PactV3({ consumer: 'orders-service', provider: 'payments-service' });

test('capture returns a transaction id', () => {
  provider
    .given('a valid order exists')
    .uponReceiving('a capture request')
    .withRequest({ method: 'POST', path: '/capture', body: { orderId: 'ord_123', amount: 4200 } })
    .willRespondWith({
      status: 200,
      body: { status: 'captured', transactionId: 'txn_abc' },
    });

  return provider.executeTest(async (mockServer) => {
    const result = await captureOrder(mockServer.url, 'ord_123', 4200);
    expect(result.transactionId).toBe('txn_abc');
  });
});
```

Running this doesn't just test your code — it generates a **contract file**, a JSON artifact that literally says "the orders service expects a request shaped like *this* to produce a response shaped like *that*." That file gets published to a shared broker. Then, on the payments side, a completely separate test — owned and run by the payments team, in their own CI — replays every contract published against them and verifies their actual service still satisfies it:

```javascript
const { Verifier } = require('@pact-foundation/pact');

new Verifier({
  provider: 'payments-service',
  providerBaseUrl: 'http://localhost:4000',
  pactBrokerUrl: 'https://pact-broker.internal',
  publishVerificationResult: true,
})
  .verifyProvider()
  .then(() => console.log('all consumer contracts satisfied'));
```

Now the payments engineer renaming `transactionId` to `txnId` finds out *in their own CI, before merging*, that this breaks a contract three other teams depend on. The failure happens at the moment of the mistake, owned by the person making it, instead of three weeks later as a support ticket titled "orders totals look wrong."

## What This Buys You (and What It Doesn't)

The honest tradeoff: contract testing doesn't replace integration or end-to-end tests, and it won't catch bugs in business logic — a provider can satisfy the contract shape perfectly and still capture the wrong amount. What it *does* catch, cheaply and at the source, is the entire category of "someone changed a response shape and didn't realize who depended on it." On a service mesh I worked on at Cubet, we onboarded contract tests for exactly two integration points — the two that had caused the last three production incidents — and both of those specific incident types simply stopped recurring. Not because the code got better, but because the assumption two teams had silently agreed to was now a file that failed loudly the moment it stopped being true.

It also changes a social dynamic, not just a technical one. Before contracts, "don't break the orders integration" was tribal knowledge that lived in one engineer's head. After, it's an artifact in a broker that any new hire on either team can open and read. The contract doesn't just test the code — it replaces the breakup letter nobody was writing with a prenup nobody has to remember to invoke.

If you've got two or more services trading JSON across a network boundary and you've ever debugged a production incident that turned out to be "a field got renamed," you already have a candidate for this. Pick your most-incident-prone integration point, write one consumer contract for it, wire the provider verification into that team's CI, and see how much quieter that particular integration gets.
