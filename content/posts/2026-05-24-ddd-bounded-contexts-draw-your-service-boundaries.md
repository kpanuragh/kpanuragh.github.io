---
title: "🗺️ DDD Bounded Contexts: Draw Your Service Boundaries Before They Draw You"
date: 2026-05-24
excerpt: Most microservice disasters aren't technology problems — they're boundary problems. Domain-Driven Design's bounded contexts give you a principled way to cut your system at the seams, not through the bone.
tags:
  - backend
  - architecture
  - ddd
  - microservices
  - distributed-systems
featured: true
---

You've seen the postmortems. Team migrates a 40-table Rails monolith to "microservices." Six months later they have 40 microservices that all share one database, call each other synchronously on every request, and deploy together because touching one breaks three others. They didn't build microservices. They built a distributed monolith — the worst of both worlds.

The root cause is almost never the technology. It's that nobody asked the harder question first: **where do the boundaries actually go?**

Domain-Driven Design has a term for this: the **Bounded Context**. It's one of those ideas that sounds academic until the first time it saves your architecture from collapsing under its own weight.

---

## What's a Bounded Context, Actually?

Here's the mental model: in any sufficiently large system, the same word means different things in different departments.

Take "Customer." To the billing team, a customer is an entity with a payment method, invoices, and a credit limit. To the support team, a customer is a person with a ticket history and a satisfaction score. To the shipping team, a customer is a delivery address and a contact phone number.

These aren't the same object wearing different hats. They're **genuinely different models** that happen to share an ID. If you try to cram all of that into one `Customer` table with 60 columns, every team spends their time tripping over fields they don't own and fear changing anything because the blast radius is unknowable.

A Bounded Context is a **linguistic and conceptual boundary** inside which a specific domain model is consistent and unambiguous. Within the billing context, "Customer" means one thing. Within shipping, it means another. Both are correct — in their own context.

---

## Finding the Seams

This is where most teams go wrong: they try to draw service boundaries by looking at the technology (tables, endpoints, repo structure) instead of the business.

The better approach is **Event Storming** — get a whiteboard, gather your domain experts, and map out what *happens* in the system as domain events. "Order placed." "Payment captured." "Shipment dispatched." "Refund issued."

You'll notice natural clusters. Events group around a shared vocabulary and a shared lifecycle. Those clusters are your bounded contexts trying to tell you where to cut.

At Cubet, when we migrated a logistics platform from a tangled monolith, we ran a lightweight Event Storming session with the operations team. What looked like one system in the database turned out to be four distinct domains: Order Management, Inventory, Fulfillment, and Billing. Each had its own lifecycle, its own failure modes, its own team caring about it. The seams were already there — we just hadn't named them yet.

---

## Contexts Aren't Services (But They Can Be)

Here's a nuance that trips people up: a Bounded Context is a **conceptual boundary**, not a deployment unit. You can have multiple contexts in a monolith. You can have one context split across multiple services. They're orthogonal concerns.

The value of identifying contexts first is that it gives you a **stable decomposition target** regardless of where you are on the monolith-to-microservices spectrum. Start with one deployable unit, clear context boundaries in code, and extract services only when you have a concrete reason (independent scaling, team autonomy, different deployment cadence).

Here's what clean context isolation can look like inside a monolith:

```typescript
// Billing context — owns its own Customer model
// src/billing/entities/Customer.ts
export interface BillingCustomer {
  id: string;
  stripeCustomerId: string;
  creditLimit: number;
  outstandingBalance: number;
}

// Shipping context — its own Customer model
// src/shipping/entities/Customer.ts
export interface ShippingCustomer {
  id: string;
  defaultAddressId: string;
  contactPhone: string;
  preferredCarrier: string;
}
```

Same customer ID, completely separate models. Neither context reaches into the other's module. When the billing team adds dunning logic, they're not touching shipping code. When the shipping team adds locker delivery support, billing isn't involved.

---

## Anti-Corruption Layers: When Contexts Must Talk

Contexts can't be hermetically sealed forever. Orders flow from checkout into fulfillment. Payments flow from billing into finance. When contexts communicate, you need a **translation layer** to prevent one context's messy model from leaking into another's clean one.

DDD calls this an **Anti-Corruption Layer (ACL)**. In practice it's just a mapper that translates between the two vocabularies at the boundary:

```typescript
// In the fulfillment context, translate from the order context's language
class OrderToFulfillmentMapper {
  static fromOrderCreatedEvent(event: OrderCreatedEvent): FulfillmentJob {
    return {
      jobId: uuid(),
      externalOrderRef: event.orderId,
      lineItems: event.items.map(item => ({
        sku: item.productCode,   // order context calls it "productCode"
        quantity: item.qty,      //  fulfillment calls it "sku"
        warehouseZone: resolveWarehouseZone(item.deliveryPostcode),
      })),
      priority: event.isExpressShipping ? 'HIGH' : 'STANDARD',
      deadlineAt: event.requestedDeliveryDate,
    };
  }
}
```

Without this layer, you end up with fulfillment code that imports types from the order module, which imports from billing, which imports from catalog — and suddenly changing a field name in orders breaks a fulfillment test you didn't even know existed.

---

## The Integration Patterns Between Contexts

Once you have clean contexts, you have three clean ways to connect them:

1. **Shared Kernel** — two contexts deliberately share a small, stable subset of the model. Use sparingly. Good for things like a canonical `Money` type or `UserId`. Bad for anything that evolves at different rates.

2. **Customer/Supplier** — one context (supplier) publishes events or an API; the other (customer) consumes it and runs its own ACL. This is the dominant pattern in event-driven systems. The supplier doesn't need to know who's listening.

3. **Conformist** — one context just adopts the upstream model wholesale. Usually a pragmatic compromise when you're integrating with a third-party API or a legacy system you can't change. At least it's an explicit, named decision rather than an accidental coupling.

---

## The Payoff

When I look at the systems at Cubet that have aged best — the ones where we can still ship fast three years in — they're the ones where someone drew the context map early and enforced it in code structure. New engineers can navigate the codebase because the modules reflect business domains they can actually learn from stakeholders.

The ones that have become nightmares? They're the ones where we reached for the "microservices" label before understanding what we were dividing.

Bounded contexts don't require you to go full DDD, run Event Storming workshops, or read a 500-page book. They just require asking one question before you start splitting services: **"What words mean different things in different parts of this business?"**

The answers will tell you exactly where to cut.

---

**Where are you on this journey?** Are you working on a clean context map, or are you in the middle of untangling a shared-database distributed monolith? Drop your war stories in the comments — the messier the better.
