---
title: "🧅 Hexagonal Architecture for Skeptics: Ports, Adapters, and the Onion You Didn't Ask For"
date: "2026-08-16"
excerpt: "Hexagonal architecture sounds like a whiteboard fantasy until the day your team swaps Postgres for DynamoDB in an afternoon. A skeptic's guide to ports, adapters, and why the hexagon isn't the point."
tags: ["architecture", "backend", "nodejs", "design-patterns", "clean-architecture"]
featured: true
---

The first time someone showed me a hexagon diagram in a design review, I did the thing every backend engineer does: I nodded slowly, said "interesting," and mentally filed it under "things consultants draw to justify their invoice." Six sides, arrows pointing inward, the word "domain" floating serenely in the middle like it's meditating. It looked like architecture astronautics — a lot of ceremony for what is, at the end of the day, a function that reads from a database and returns JSON.

I was wrong, but not for the reasons the diagram people think. Hexagonal architecture (also called "ports and adapters," coined by Alistair Cockburn back in 2005) earns its keep the moment something *outside* your code changes and your business logic doesn't have to care. And in a career full of migrations, that moment shows up more often than any of us would like.

## The pitch, minus the geometry

Forget the hexagon. It's not six-sided because your app has six neighbors — it's six-sided so nobody draws it as a layer cake with "top" and "bottom," which is exactly the mental trap that gets you into trouble. The actual idea is boring and old:

1. Your core business logic doesn't import anything from a framework, driver, or SDK.
2. Everything your app needs from the outside world (a database, an email provider, an HTTP request) is described as an **interface** — a "port" — that your domain defines on its own terms.
3. The actual Postgres client, SES call, or Express handler is an **adapter** that implements that port, living in the outer ring where it can be swapped without anyone in the core noticing.

That's it. No hexagon required. You could draw it as a sandwich and lose nothing.

## What it looks like when you're not being cute about it

Here's a slice of an order-processing domain. Notice the interface has zero opinions about SQL, HTTP status codes, or connection pools:

```typescript
// domain/ports/order-repository.ts
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}

// domain/place-order.ts
export class PlaceOrder {
  constructor(private orders: OrderRepository, private clock: Clock) {}

  async execute(input: NewOrderInput): Promise<Order> {
    const order = Order.create(input, this.clock.now());
    await this.orders.save(order);
    return order;
  }
}
```

`PlaceOrder` has never heard of Prisma, Mongo, or a Kafka producer. It just knows "something that can save an order" exists. The adapter is where the actual plumbing lives:

```typescript
// infra/postgres-order-repository.ts
export class PostgresOrderRepository implements OrderRepository {
  constructor(private db: Pool) {}

  async save(order: Order): Promise<void> {
    await this.db.query(
      `INSERT INTO orders (id, status, total_cents) VALUES ($1, $2, $3)`,
      [order.id, order.status, order.totalCents]
    );
  }

  async findById(id: string): Promise<Order | null> {
    const { rows } = await this.db.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    return rows[0] ? Order.fromRow(rows[0]) : null;
  }
}
```

Wiring happens at the edge, usually in whatever bootstraps your app:

```typescript
const orders = new PostgresOrderRepository(pool);
const placeOrder = new PlaceOrder(orders, systemClock);
app.post("/orders", async (req, res) => {
  const order = await placeOrder.execute(req.body);
  res.status(201).json(order);
});
```

## Where this actually saved me

At Cubet, we had a service that logged everything to a single Postgres table because that's what existed when the project started. Eighteen months later, that table was the loudest thing in our slow-query log, and the fix was moving writes to a purpose-built event store. Because the write path had been hiding behind an `EventLog` port from day one, the migration was a new adapter class and a one-line change in the composition root. No domain code touched. No "let's regression test the whole order flow because we swapped the storage engine" panic. It was, genuinely, an afternoon.

Contrast that with the alternative universe where `pg.query()` calls are sprinkled through service functions, controllers, and the occasional cron job. That's not a migration, that's an archaeology dig with a deadline attached.

## The skeptic's honest complaints (and my honest answers)

**"This is a lot of interfaces for a CRUD app."** Correct — if your app is genuinely CRUD and will stay that way, skip it. Hexagonal architecture is a bet that your integrations will change or multiply. A todo-list side project doesn't need this bet. A billing service that will eventually talk to three payment providers absolutely does.

**"Now I have to write a fake adapter for every test."** That's not a cost, that's the reward. An in-memory `OrderRepository` that's just a `Map` under the hood makes your domain tests run in milliseconds with zero test containers. I stopped resenting this the day a CI pipeline that used to spin up Postgres for unit tests started finishing three minutes faster.

**"Isn't this just dependency injection with extra steps?"** Kind of, yes — and that's fine. The ports-and-adapters framing is mostly a naming convention that keeps a team consistent about *which direction dependencies point*. The insight worth keeping, independent of any hexagon, is: your business rules should be the thing that's hardest to break, and your database driver should be the thing that's easiest to replace. Most of us build it backwards by default, because the framework tutorial always starts with `app.get()` and works inward from there.

## Try it on one seam

You don't need to hexagon-ify your whole codebase this week. Pick the one dependency you're most afraid to change — the email provider you've been meaning to drop, the search index you inherited — and put a port in front of it. Watch how much calmer the next migration feels. Then decide for yourself whether the diagram was worth the whiteboard marker after all.
