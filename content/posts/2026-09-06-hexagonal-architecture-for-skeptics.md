---
title: "🔷 Hexagonal Architecture for Skeptics: You're Already Halfway There"
date: 2026-09-06
excerpt: "Every diagram of hexagonal architecture looks like a geometry exam nobody studied for. Strip away the hexagons and ports-and-adapters is just \"stop importing Express into your business logic\" — here's the version that doesn't need a whiteboard."
tags: ["architecture", "nodejs", "design-patterns", "backend", "software-design"]
featured: true
---

Somebody shows you a hexagonal architecture diagram for the first time and your first reaction is entirely reasonable: why is my application a hexagon? Is six sides load-bearing? Would five sides be less testable? The diagram doesn't help — it's usually a hexagon with smaller hexagons plugged into its edges labeled "adapter," and an inner hexagon labeled "domain," and arrows pointing in directions that seem to violate causality.

Here's the thing nobody tells you up front: the hexagon is decorative. Alistair Cockburn, who coined the pattern back in 2005, picked a hexagon specifically because it has *no* privileged side — no "top" or "bottom" the way a layered architecture diagram does. That's the entire reason for the shape. It's a rebellion against the boxes-stacked-on-boxes diagram, not a geometric requirement. Once you know that, you can throw the hexagon away and keep the actual idea, which is much smaller than the diagram makes it look.

## The idea, without the shape

Your business logic should not know what's calling it, and it should not know what it's calling out to. That's it. That's hexagonal architecture, also called ports-and-adapters, also (mostly) the same idea as onion architecture and clean architecture wearing different hats.

"Ports" are interfaces your domain logic defines — `OrderRepository`, `PaymentGateway`, `NotificationSender`. "Adapters" are the concrete implementations that plug into those ports — a Postgres-backed repository, a Stripe client, an email sender. The domain layer depends on the port interfaces it declares. It never depends on Express, never imports `pg`, never has a clue that HTTP or Postgres or Stripe exist. Everything concrete lives on the outside and gets wired in.

If you've ever written a repository interface so you could swap in a fake for tests, congratulations — you've done ports-and-adapters. You just didn't draw a hexagon around it.

## What it actually buys you

Skip the "testability" pitch for a second, because everyone's heard it and it undersells the real payoff. The bigger win shows up when requirements change in the boring, inevitable way they always do:

- Product wants to migrate from Postgres to a different datastore for one aggressive scaling reason or another. In a hexagonal setup, that's a new adapter implementing the same `OrderRepository` port. In a codebase where your service layer calls `pg.query(...)` directly, it's a multi-sprint archaeology project.
- You need to trigger the same "place an order" logic from an HTTP API, a cron job, and a Kafka consumer. If the domain logic is trapped inside an Express route handler, you're either duplicating it three times or building an increasingly desperate abstraction on top of Express to pretend it isn't an HTTP framework.
- A new engineer needs to understand what the system *does*, not how it's wired. With the domain isolated, they can read `PlaceOrder.ts` and see business rules — no `req`, `res`, or connection pooling boilerplate in the way.

At Cubet, we had a billing service where the payment logic was originally called directly from three different places — a REST endpoint, an internal gRPC handler, and a retry worker — each with its own slightly-drifted copy of "what counts as a valid charge." Pulling that into one domain function behind a port, with each caller acting as its own thin adapter, wasn't an academic exercise. It was the only way to stop fixing the same bug three times in three files that had quietly diverged.

## A minimal example

Here's the shape in TypeScript, stripped down to the parts that matter:

```typescript
// domain/ports.ts — the domain defines what it needs, nothing more
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}

export interface PaymentGateway {
  charge(amount: number, customerId: string): Promise<{ success: boolean }>;
}

// domain/place-order.ts — pure business logic, zero framework imports
export async function placeOrder(
  input: { customerId: string; items: Item[] },
  deps: { orders: OrderRepository; payments: PaymentGateway }
) {
  const total = calculateTotal(input.items);
  const result = await deps.payments.charge(total, input.customerId);
  if (!result.success) throw new Error("payment declined");

  const order = Order.create(input.customerId, input.items, total);
  await deps.orders.save(order);
  return order;
}
```

The adapters live entirely outside this file:

```typescript
// adapters/postgres-order-repository.ts
export class PostgresOrderRepository implements OrderRepository {
  constructor(private db: Pool) {}
  async save(order: Order) {
    await this.db.query("INSERT INTO orders ...", [order.id, order.total]);
  }
  async findById(id: string) {
    const { rows } = await this.db.query("SELECT * FROM orders WHERE id = $1", [id]);
    return rows[0] ? Order.fromRow(rows[0]) : null;
  }
}

// adapters/express-order-controller.ts
app.post("/orders", async (req, res) => {
  const order = await placeOrder(req.body, { orders: pgOrderRepo, payments: stripeGateway });
  res.json(order);
});
```

Notice `placeOrder` never imports `express`, `pg`, or `stripe`. Swap Postgres for DynamoDB, or Stripe for a mock in tests, and `place-order.ts` doesn't change a single line. That's the whole trick.

## Where it goes wrong (and why skeptics aren't crazy)

The skepticism is earned, because hexagonal architecture has a real failure mode: over-application. If you wrap a CRUD endpoint that reads a row and returns JSON in a domain layer, a port interface, and an adapter, you've built three files and an interface to do what one function did, for a piece of logic that will never have a second implementation. That's not architecture, that's ceremony, and it's exactly the kind of thing that gives "clean architecture" a bad name among people who've had to maintain it.

The pattern earns its keep at the boundaries that are actually volatile — the data store you might migrate, the payment provider you might switch, the notification channel that keeps growing (email today, SMS next quarter, push after that). It does *not* need to show up on every single service in your codebase, and it definitely doesn't need six-sided diagrams to justify itself in a design review.

A decent litmus test: if you can name a second real implementation of a port — a second database, a second provider, a fake for tests — the port earns its interface. If the only implementation that will ever exist is the one you're writing today, you don't need a port, you need a function.

## Try it on one boundary

You don't need to hexagonal-ify your whole app this afternoon. Pick the one dependency in your codebase you're most afraid to touch — the payment provider, the search backend, whatever it is — and pull its calls behind a two-method interface. Write a fake implementation for your tests. See how much less you dread that file next sprint. That's the whole pitch, minus the hexagon.
