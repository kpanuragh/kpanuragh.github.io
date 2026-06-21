---
title: "Hexagonal Architecture: Because Your Business Logic Shouldn't Care About Postgres 🔌"
date: 2026-06-21
excerpt: "Hexagonal architecture (Ports & Adapters) keeps your core business logic clean and framework-agnostic by hiding I/O behind interfaces — so swapping Postgres for DynamoDB doesn't require touching a single business rule."
tags:
  - backend
  - architecture
  - hexagonal-architecture
  - design-patterns
  - typescript
featured: true
---

Here's a scenario that should feel familiar: you're six months into a project and someone decides to swap the database. Maybe it's a cost thing, maybe it's a scaling thing, maybe it's just a "we read a blog post" thing. Doesn't matter. What matters is that you now have database calls scattered across your controllers, your service layer, your middleware, and — somehow — one inside a utility function nobody remembers writing.

Congratulations. You have spaghetti architecture.

This is exactly the problem hexagonal architecture (also called **Ports and Adapters**) was designed to prevent. The core idea is almost offensively simple: your business logic should live in a pure inner core that knows nothing about databases, HTTP, message queues, or any other I/O detail. Everything external connects to that core through well-defined interfaces called **ports**. The concrete implementations of those interfaces — the actual database drivers, HTTP clients, and queue consumers — are **adapters**.

Think of it like a power strip. The strip itself (your business logic) doesn't care whether you're plugging in a laptop, a lamp, or a toaster. It just provides the port. The adapter (the plug) is what knows how to talk to the specific device.

## The Core: Where Business Lives

Let's say we're building an order system. The innermost layer — the domain — has zero knowledge of Express, Postgres, or anything external:

```typescript
// src/domain/order.ts
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "confirmed" | "shipped" | "cancelled";
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export function calculateTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function canCancelOrder(order: Order): boolean {
  return order.status === "pending" || order.status === "confirmed";
}
```

Pure TypeScript. No imports from Express. No Prisma. No `pg`. If you put this file in a serverless function, a CLI tool, or a background worker, it would work identically. That's the point.

## Ports: Define the Contracts

Ports are just interfaces — contracts that the core uses to communicate with the outside world. There are two flavours:

- **Driving ports** (inbound): how the outside world talks to your core (e.g., a use-case interface your controller calls)
- **Driven ports** (outbound): how your core talks to the outside world (e.g., a repository interface for fetching data)

```typescript
// src/ports/order-repository.port.ts
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  findByUserId(userId: string): Promise<Order[]>;
}

// src/ports/notification.port.ts
export interface NotificationService {
  sendOrderConfirmation(userId: string, orderId: string): Promise<void>;
}

// src/application/cancel-order.usecase.ts
export class CancelOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifications: NotificationService
  ) {}

  async execute(orderId: string, requestingUserId: string): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.userId !== requestingUserId) throw new Error("Forbidden");
    if (!canCancelOrder(order)) throw new Error("Order cannot be cancelled");

    await this.orders.save({ ...order, status: "cancelled" });
    await this.notifications.sendOrderConfirmation(requestingUserId, orderId);
  }
}
```

Notice what's missing: no database import, no email library, no HTTP client. The use case only knows about its ports. This is the magic — the use case is fully testable with mocks, and completely infrastructure-agnostic.

## Adapters: The Concrete Stuff

Now the adapters — the code that actually does the dirty work:

```typescript
// src/adapters/postgres-order-repository.ts
import { pool } from "../infrastructure/db";
import { Order, OrderRepository } from "../ports/order-repository.port";

export class PostgresOrderRepository implements OrderRepository {
  async findById(id: string): Promise<Order | null> {
    const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  }

  async save(order: Order): Promise<void> {
    await pool.query(
      "INSERT INTO orders (id, user_id, status, total) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET status=$3, total=$4",
      [order.id, order.userId, order.status, order.total]
    );
  }

  async findByUserId(userId: string): Promise<Order[]> {
    const result = await pool.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
    return result.rows;
  }
}

// Swap day arrives — here's a DynamoDB adapter that satisfies the SAME port:
// export class DynamoOrderRepository implements OrderRepository { ... }
```

The day you switch databases? You write a new adapter. The use cases, domain logic, and ports don't change. Not a single line.

At Cubet, we adopted this pattern for a multi-tenant SaaS platform where different clients had different database requirements. One ran on RDS Postgres, another needed a DynamoDB setup for write-heavy workloads. Because the ports were defined cleanly, we shipped two adapters and wired them up via dependency injection at startup. The business logic was shared verbatim.

## Why This Matters More Than You Think

The real win isn't database swapping (that's rare). The real wins are:

**Testing speed.** Unit-testing use cases with in-memory adapters is instant. No spinning up Docker containers, no seeding databases, no test-state bleed between runs. Your core logic tests run in milliseconds.

**Parallel development.** Your team can work on adapters and domain logic concurrently because the interfaces are agreed upfront. Frontend team needs an API? Mock the use case. Backend team changes the DB schema? Only the adapter changes.

**Clear blast radius.** When something breaks, you know immediately whether it's a domain problem (bug in business rules) or an infrastructure problem (adapter failure). The layers don't blur.

**Framework upgrades hurt less.** Moving from Express 4 to Fastify, or from REST to tRPC? Your HTTP adapter changes. Your business logic doesn't.

## When Hexagonal Is Overkill

To be fair: not every backend needs this. A CRUD API with three endpoints and a single Postgres table is probably fine with a flat service-repository pattern. Hexagonal architecture earns its overhead when you have:

- Complex business rules that need isolated testing
- Multiple I/O backends (caching layer, external APIs, message queues)
- Long-lived codebases where requirements will drift
- Teams working on different parts of the system concurrently

If you're hacking a weekend side project, skip it. If you're building something that'll be in production for three years with a rotating team, sketch the ports before you touch a database driver.

## The Mindset Shift

The hardest part of hexagonal architecture isn't the code — it's fighting the instinct to reach for `import db from '../db'` inside a business function. Every time you feel that urge, stop and ask: "Does my business rule actually need to know *how* this data is stored?"

Almost always, the answer is no. It needs data. Not a database.

Define the port. Write the adapter. Keep the core clean.

---

Tried hexagonal architecture on a recent project? Hit me up — I'm always curious to hear where the pattern held up and where it started showing seams. The architectural purity vs. pragmatism tradeoff is a genuinely fun one to debate.
