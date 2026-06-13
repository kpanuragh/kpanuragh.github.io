---
title: "🏭 Test Data: Stop Writing Fixtures, Start Building Factories"
date: 2026-06-13
excerpt: "Hardcoded fixtures make your tests brittle and your seed files a nightmare to maintain. Factories generate realistic, varied test data on the fly — here's why your test suite needs to make the switch."
tags: ["testing", "backend", "node.js", "code-quality", "databases"]
featured: true
---

Every backend codebase I've seen has the same graveyard: a `fixtures/` folder stuffed with `user.json`, `user_admin.json`, `user_with_orders.json`, `user_with_orders_and_deleted_address.json`, and seventeen more variants that nobody dares delete because *something* might break.

That's the fixture trap. You're not writing test data — you're maintaining a parallel database by hand.

## What Even Are Fixtures?

Fixtures are static, pre-defined datasets you load before tests run. Classic Rails style: dump a known state into the DB, run your assertions, teardown. Simple in theory.

```json
// fixtures/user.json
{
  "id": 1,
  "email": "test@example.com",
  "role": "user",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

The appeal is obvious: fixtures are predictable. You know exactly what's in the database. Your assertions can be specific: `expect(user.email).toBe('test@example.com')`.

The problem shows up at scale. Your `User` model grows. You add `phone`, `locale`, `onboardingStep`, `deletedAt`. Now every fixture file is out of date. You run the tests, half of them fail with "NOT NULL constraint violated", and you spend 40 minutes updating JSON files instead of writing code.

Sound familiar?

## Enter: Factories

A factory is a function (or object) that knows how to build a valid model instance with sensible defaults, while letting you override whatever you actually care about for a given test.

Here's what that looks like with `@faker-js/faker` and a simple builder pattern:

```typescript
import { faker } from '@faker-js/faker';

// factories/user.factory.ts
type UserOverrides = Partial<{
  email: string;
  role: 'user' | 'admin';
  deletedAt: Date | null;
}>;

export function buildUser(overrides: UserOverrides = {}) {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    role: 'user' as const,
    phone: faker.phone.number(),
    locale: 'en-US',
    onboardingStep: 'complete',
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}
```

Now your test reads like English:

```typescript
it('should reject login for deleted accounts', async () => {
  const user = await createUser(buildUser({ deletedAt: new Date() }));

  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: 'password123' });

  expect(res.status).toBe(403);
  expect(res.body.error).toBe('Account deactivated');
});
```

Notice what you *don't* see: a fixture file. No hardcoded email. No mystery ID. The test declares exactly the shape it needs — a deleted user — and nothing more.

## The Real Win: Tests That Tell You What They Care About

The difference between fixtures and factories isn't just ergonomics. It changes what your tests *communicate*.

With fixtures, a test that loads `user_admin.json` could be checking the admin role, or the specific email, or the account age — who knows? You have to read the fixture file to find out.

With factories, the override *is* the documentation:

```typescript
// This test clearly cares about the role. Nothing else.
const admin = buildUser({ role: 'admin' });

// This test clearly cares about deletion status.
const deletedUser = buildUser({ deletedAt: new Date() });
```

At Cubet, we switched a service from fixtures to factories midway through a refactor. The fixture folder had 23 files. After the switch, we had one factory file and roughly the same test coverage — but the tests became self-explanatory. New team members could read them without cross-referencing JSON.

## Composing Factories for Relationships

Where factories really shine is relational data. With fixtures, representing "a user who has three orders, two of which are shipped" requires either multiple fixture files wired together or a mega-fixture that's impossible to reuse.

With factories, you compose:

```typescript
function buildOrder(overrides = {}) {
  return {
    id: faker.string.uuid(),
    status: 'pending',
    totalCents: faker.number.int({ min: 500, max: 50000 }),
    createdAt: new Date(),
    ...overrides,
  };
}

// In your test:
const user = await createUser(buildUser());
await createOrder(buildOrder({ userId: user.id, status: 'shipped' }));
await createOrder(buildOrder({ userId: user.id, status: 'shipped' }));
await createOrder(buildOrder({ userId: user.id, status: 'pending' }));
```

The test setup is explicit, readable, and doesn't require a separate file to understand. Each `buildOrder` call generates unique IDs and realistic data — no collisions, no `UNIQUE constraint` failures because two tests share the same fixture email.

## When Fixtures Still Make Sense

Factories win in unit and integration tests. But fixtures aren't useless everywhere.

**Seed data for local dev** — the list of countries, currencies, or permission roles your app expects to exist — is genuinely static. A fixture (or a seed script) makes sense here because the data *is* static.

**Snapshot tests for complex expected outputs** — if you're testing a report renderer and want to compare against a known-good output, a fixture file for the expected result is fine. You're not describing input state; you're recording expected output.

The heuristic: if you're setting up *dynamic* entities (users, orders, posts, events), use factories. If you're comparing against *known-good output*, fixtures work.

## Practical Tips for Getting Started

**1. Don't fake what you don't test.** Your factory should generate valid defaults, but resist the urge to generate hyper-realistic data for fields the test doesn't touch. Keep it simple.

**2. Use a persistence helper alongside the factory.** Separate `buildUser` (plain object, no DB) from `createUser` (builds + inserts). Your factory is reusable in unit tests that don't hit a DB.

**3. Seed randomness deterministically when needed.** Faker lets you set a seed (`faker.seed(123)`) for reproducible output if a test is flaky due to random data. Use this sparingly — most flakiness from random data is actually a bug in your validation logic.

**4. Gradually migrate, don't rewrite.** If you have 50 fixture files, convert them to factories one test file at a time. Each file you touch is an opportunity to notice which fields actually matter to those tests.

## The Bottom Line

Fixtures feel safe because they're predictable. But predictability achieved by hand-maintaining JSON files is false confidence — the files drift out of sync, tests fail mysteriously, and nobody knows what actually matters.

Factories make test data dynamic, self-documenting, and resilient to model changes. When your `User` gets a new required field, you update the factory once. Every test that uses it just works.

Your `fixtures/` folder is a test-data debt register. Time to pay it off.

---

*Already using factories in your project? What library are you reaching for — Fishery, Rosie, or rolling your own? I'd love to hear what's working.*
