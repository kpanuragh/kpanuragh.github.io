---
title: "🧪 Integration Tests Without Spinning Up the Entire Company"
date: "2026-08-29"
excerpt: "Real integration tests need a real database, a real queue, a real cache. Also, apparently, forty-five seconds of docker-compose, three flaky ports, and a Slack message asking who's using the shared staging Postgres again. Here's how to get honest integration coverage without booting your whole architecture every time you hit save."
tags: ["testing", "code-quality", "backend", "databases"]
featured: true
---

Every backend team eventually reaches the same fork in the road. Unit tests with mocked repositories pass beautifully, ship to staging, and immediately fall over because the mock swallowed a constraint the real Postgres enforces — a `UNIQUE` index, a `NOT NULL` column, a foreign key nobody remembered existed. So the team overcorrects: full `docker-compose up` with Postgres, Redis, Kafka, and two internal services, wired into CI, taking four minutes per run and failing 1 time in 12 because Kafka wasn't ready when the consumer subscribed. Both extremes are wrong. The mock lies to you quietly; the full stack tells the truth slowly and unreliably.

## The Mock Lies By Omission

Here's the kind of test that gives false confidence:

```javascript
const mockDb = { findUser: jest.fn().mockResolvedValue({ id: 1, email: 'a@x.com' }) };

test('creates order for existing user', async () => {
  const order = await createOrder(mockDb, { userId: 1, total: 42 });
  expect(order.userId).toBe(1);
});
```

This passes forever. It also has nothing to say about the fact that your real schema has a `CHECK (total > 0)` constraint, that `userId` is a foreign key that'll reject an order for a deleted user, or that your ORM's `findUser` actually throws on a connection timeout instead of resolving cleanly. The mock only knows what you told it to know, and you told it the happy path. Every constraint that lives in the database instead of your application code is invisible to a mocked repository.

## The Full Stack Tells the Truth, Slowly

The instinctive fix — run everything real — solves the honesty problem and introduces a new one: **test reliability degrades with every extra moving part.** A `docker-compose.yml` with five services means five things that can be slow to boot, five ports that can already be taken on someone's laptop, five version mismatches between what's pinned locally and what CI pulls. On a team at Cubet I worked with, the "run the full stack" integration suite had a standing joke: if it failed, step one wasn't "read the error," it was "run it again and see if it still fails." That's not a test suite, that's a slot machine with assertions attached.

## The Middle Ground: Testcontainers + In-Process Fakes

The fix isn't picking mocks or the full stack — it's being deliberate about *which* dependencies earn a real instance and which get a lightweight substitute. The rule of thumb: **anything with schema, constraints, or query semantics your code actually depends on gets a real ephemeral instance. Anything you're only using as a dumb pipe gets faked.**

[Testcontainers](https://testcontainers.com/) is the tool that makes the first half cheap — it boots a real, disposable Postgres (or Redis, or Kafka) in a container scoped to your test run, then tears it down. No shared staging database, no "who's running migrations right now," no port collisions because it picks a free one for you:

```javascript
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

let container, pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query(fs.readFileSync('schema.sql', 'utf8'));
}, 30_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

test('rejects an order for a nonexistent user', async () => {
  await expect(createOrder(pool, { userId: 9999, total: 42 }))
    .rejects.toThrow(/foreign key/);
});
```

This test is honest — it hits real SQL, a real foreign key constraint, a real error message — and it's isolated. It doesn't touch your teammate's staging data, and it doesn't need Kafka or the email service or the third-party payments API to be up. It boots in a couple of seconds because it's one container, not five.

For the dependencies that don't have meaningful internal logic worth verifying — say, a downstream notification service you call over HTTP — an in-process fake beats both a mock and a real instance. A small Express app standing in for the real service gives you actual HTTP semantics (status codes, timeouts, malformed JSON) without the coordination cost of running the real thing:

```javascript
const fakeNotificationService = express();
fakeNotificationService.post('/notify', (req, res) => {
  received.push(req.body);
  res.status(202).json({ queued: true });
});
const server = fakeNotificationService.listen(0); // random free port
```

Your code makes a real network call, gets a real HTTP response, and you assert against `received` afterward. No mock is pretending to understand HTTP — it actually is HTTP, just to a fake instead of the real service.

## Drawing the Line

The question worth asking for every dependency in your test setup is: **"If this dependency's real behavior diverged from my assumption, would my mock catch it?"** For a database, almost always no — schema constraints, transaction isolation levels, and query planner quirks (an index that silently isn't being used) are exactly the things mocks can't represent, so it earns a Testcontainers instance. For an internal HTTP call where you only care that you sent the right payload and handled a 500 correctly, a fake server is plenty, and it's an order of magnitude faster and more deterministic than the real service with its own database and auth layer behind it.

A practical split that's worked well across a few Node/TypeScript services:

| Dependency | Real instance | In-process fake | Pure mock |
|---|---|---|---|
| Primary database | ✅ Testcontainers | | |
| Redis (used for locking/dedup logic) | ✅ Testcontainers | | |
| Internal notification service | | ✅ fake Express app | |
| Third-party SDK you don't own (Stripe, Twilio) | | | ✅ mock, per their contract tests |

Run this tier in CI on every PR — it's fast enough to live there, unlike the full docker-compose stack, which can stay reserved for a smaller, slower nightly suite that exercises actual cross-service behavior end to end.

You don't need your entire architecture running to catch the bugs that matter — you need the one or two dependencies where reality and your assumptions are most likely to diverge, running for real, and everything else kept honest but lightweight. Pick your riskiest mocked dependency this week, swap it for a Testcontainers instance, and watch how many "passing" tests were actually just trusting you to get the schema right.
