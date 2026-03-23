---
title: "Backend for Frontend (BFF): Stop Serving Your Mobile App the Same Fat API as Your Web App 📱"
date: "2026-03-21"
excerpt: "One API to rule them all sounds great until your mobile app is downloading 47 fields it never renders. The BFF pattern saved our e-commerce UX - here's the honest truth about it."
tags: ["\\\"architecture\\\"", "\\\"scalability\\\"", "\\\"system-design\\\"", "\\\"api\\\"", "\\\"microservices\\\""]
featured: "true"
---

# Backend for Frontend (BFF): Stop Serving Your Mobile App the Same Fat API as Your Web App 📱

**Here's a conversation I had with our mobile dev lead, verbatim:**

> "Hey Anuragh, this product endpoint returns 47 fields. The mobile app uses 8 of them."
>
> "So... ignore the other 39?"
>
> "They're still downloaded. On 3G. Every. Single. Request."
>
> *long silence*

That conversation started a three-month architectural journey that completely changed how I think about API design. The answer wasn't "make the API smaller" or "add query parameters to filter fields." The answer was: **different clients need different backends**.

Welcome to the Backend for Frontend (BFF) pattern.

## What's Actually Wrong With "One API for Everything" 🤔

When we built our e-commerce backend, we had one beautiful RESTful API. Neat, clean, documented. Every client hit the same endpoints.

The mobile app needed product cards with 3 fields. The web app needed full product details with 15 fields. The admin dashboard needed inventory data, sales stats, and audit logs all stitched together from 4 different microservices.

Our "universal" API ended up as a compromise that served nobody well:

```
GET /api/products/123

Response (all 47 fields):
{
  "id": 123,
  "name": "Blue Widget",
  "description": "...",           // Mobile doesn't show this
  "sku": "BW-001",               // Mobile doesn't need this
  "weight_kg": 0.5,              // Mobile doesn't use this
  "warehouse_location": "B-14",  // Mobile DEFINITELY doesn't need this
  "supplier_id": 44,             // Mobile has zero use for this
  "created_by_admin_id": 7,      // Please no
  ... 42 more fields ...
  "price": 29.99,                // ✅ Mobile uses this
  "image_url": "...",            // ✅ Mobile uses this
  "in_stock": true               // ✅ Mobile uses this
}
```

We were paying bandwidth costs, parse costs, and battery costs on mobile to transfer 39 fields that went directly into `/dev/null`.

## The BFF Pattern: One Backend Per Client Type 🏗️

The idea is disarmingly simple. Instead of one general API, you create **purpose-built backends for each client type**:

```
                    ┌─────────────────┐
Mobile App  ───────▶│  Mobile BFF     │───┐
(iOS/Android)       │  (lean, fast)   │   │
                    └─────────────────┘   │    ┌──────────────────┐
                                          ├───▶│ Core Microservices│
                    ┌─────────────────┐   │    │ (Products, Orders,│
Web App  ──────────▶│  Web BFF        │───┤    │  Users, Payments) │
(React/Next.js)     │  (rich, full)   │   │    └──────────────────┘
                    └─────────────────┘   │
                                          │
                    ┌─────────────────┐   │
Admin Dashboard ───▶│  Admin BFF      │───┘
                    │  (aggregates,   │
                    │   internal)     │
                    └─────────────────┘
```

Each BFF is a thin orchestration layer. It knows exactly what its client needs, fetches only that from the underlying services, and shapes the response accordingly.

The BFFs own the "how to present the data" logic. The core services own the "how to store and manage the data" logic.

## What It Looked Like in Our E-Commerce Backend 🛒

Here's the same product endpoint, split across two BFFs:

**Mobile BFF — lean response, fast load:**
```javascript
// mobile-bff/routes/products.js
app.get('/products/:id', async (req, res) => {
  // Only fetch what mobile needs
  const product = await productService.getProduct(req.params.id, {
    fields: ['name', 'price', 'imageUrl', 'inStock', 'rating']
  });

  // Mobile needs: can we add to cart right now?
  const availability = await inventoryService.checkAvailability(req.params.id);

  // Shape it exactly how the mobile UI expects it
  res.json({
    id: product.id,
    displayName: product.name,
    priceFormatted: `$${product.price.toFixed(2)}`,
    image: product.imageUrl,
    canAddToCart: availability.inStock && availability.quantity > 0,
    stars: product.rating.toFixed(1)
  });
  // 6 fields. That's it. Job done.
});
```

**Web BFF — rich response, full product page:**
```javascript
// web-bff/routes/products.js
app.get('/products/:id', async (req, res) => {
  // Fetch in parallel - web can afford to wait a bit more, needs more data
  const [product, inventory, reviews, relatedProducts] = await Promise.all([
    productService.getFullProduct(req.params.id),
    inventoryService.getDetailedAvailability(req.params.id),
    reviewService.getSummary(req.params.id, { limit: 3 }),
    recommendationService.getRelated(req.params.id, { limit: 6 })
  ]);

  // Shape for web component structure
  res.json({
    product: { ...product, formattedPrice: formatCurrency(product.price) },
    inventory: { inStock: inventory.inStock, shipsIn: inventory.estimatedShipDays },
    reviews: { summary: reviews.averageRating, count: reviews.total, topReviews: reviews.items },
    relatedProducts: relatedProducts.map(p => ({ id: p.id, name: p.name, price: p.price, image: p.thumbnail }))
  });
  // 4 rich objects, perfectly shaped for the UI component tree
});
```

Same underlying data. Two completely different APIs. The mobile team stopped complaining about bandwidth. The web team got exactly the nested structure their React components expected without doing 4 separate API calls.

## The Surprise Benefit: Parallel Data Fetching ⚡

Before BFF, each client called 4 separate endpoints to build a product page. That's 4 sequential round trips if they needed data from each.

With BFF, the orchestration happens **server-side**, over your internal network (milliseconds), in **parallel**:

```
Old way (client-side orchestration):
Client → Products API     → [wait 200ms]
Client → Inventory API    → [wait 180ms]
Client → Reviews API      → [wait 220ms]
Client → Recommend API    → [wait 190ms]
Total: ~790ms of user waiting

New way (BFF server-side orchestration):
Client → Web BFF          → [BFF fetches all 4 in parallel over internal network ~30ms]
Total: ~230ms. Web BFF adds ~30ms overhead. Net win: ~560ms.
```

On our product detail page, this shaved **~400ms off the median page load**. That's not nothing.

## Common Mistakes I Made So You Don't Have To 🪤

### Mistake #1: Making BFFs Too Fat

The BFF should orchestrate and reshape. It should NOT contain business logic.

```javascript
// ❌ Bad: BFF calculating discount logic (belongs in Product Service)
const discount = product.originalPrice > 100
  ? product.originalPrice * 0.1
  : 0;

// ✅ Good: BFF just asks for the final price
const { finalPrice } = await productService.getPriceWithDiscounts(id, userId);
```

When I pushed discount logic into our Mobile BFF "for speed," we ended up with the same logic in three places. Bugs diverged. One BFF had a bug. Customers got inconsistent prices between mobile and web. It was embarrassing. Push business logic down into services, always.

### Mistake #2: One BFF Per Microservice (Not Per Client)

Some teams create a "Product BFF," "Order BFF," "User BFF" — one per service. That's not BFF. That's just adding a routing layer with extra steps.

BFF = one per **client type**, not one per **service**. The whole point is the BFF aggregates across multiple services for one specific consumer.

### Mistake #3: Forgetting Auth at the BFF Layer

Each BFF should handle authentication independently. Don't assume your mobile BFF and web BFF have the same auth requirements.

```javascript
// Mobile BFF auth - JWT from mobile OAuth flow
app.use(mobileJwtMiddleware); // Short-lived tokens, refresh token flow

// Web BFF auth - session cookies + CSRF
app.use(webSessionMiddleware);
app.use(csrfProtection);

// Admin BFF auth - stricter, MFA required
app.use(adminMfaMiddleware);
```

In production, our Admin BFF had MFA enforcement that the other BFFs didn't. Keeping them separate made this clean and auditable. With a single "universal" API, this kind of per-client auth nuance becomes a mess of conditional logic.

### Mistake #4: Synchronous Chains When You Need Parallel Calls

```javascript
// ❌ Bad: Waiting for each response before starting the next
const product = await productService.get(id);       // 200ms
const inventory = await inventoryService.get(id);   // 180ms
const reviews = await reviewService.get(id);        // 220ms
// Total: 600ms

// ✅ Good: All in parallel
const [product, inventory, reviews] = await Promise.all([
  productService.get(id),     // ─┐
  inventoryService.get(id),   //  ├─ All start simultaneously
  reviewService.get(id),      // ─┘
]);
// Total: 220ms (slowest one wins)
```

This is the classic "async in a loop" trap. A Technical Lead's job is catching this in code review before it hits production.

## When BFF Makes Sense (And When It Doesn't) 📊

**Use BFF when:**
- ✅ You have meaningfully different clients (mobile, web, smart TV, 3rd party API consumers)
- ✅ Your clients have very different data shape requirements
- ✅ You need per-client auth strategies or rate limiting
- ✅ You're orchestrating multiple downstream microservices per request
- ✅ Your mobile team is fighting with web team over API contract changes

**Skip BFF when:**
- ❌ You have one client type (just a web app, no mobile)
- ❌ Your "different clients" actually need the same data — just add a query param
- ❌ Your team is too small to own separate deployments (2 devs shipping 3 BFFs = pain)
- ❌ You're a monolith — GraphQL with field selection might be simpler

As a Technical Lead, I've seen teams adopt BFF prematurely because it "sounds enterprise." If you have one frontend and 2 developers, you don't need BFF. You need to ship features.

## A Scalability Lesson That Cost Us 💸

When we first deployed BFFs, we deployed them as monolithic Node.js servers. The Mobile BFF and Web BFF lived on the same server (just different Express apps).

Black Friday. Mobile traffic spiked 20x. The Mobile BFF saturated the shared CPU. The Web BFF — which could've handled the smaller spike — started timing out too. Same server.

The fix: **separate deployments, independent auto-scaling**. We moved each BFF to its own container. Mobile BFF scaled to 40 instances. Web BFF stayed at 4. The Admin BFF (barely any traffic) stayed at 1.

```
Mobile BFF:  40 instances  ← Black Friday spike
Web BFF:      4 instances  ← Normal traffic
Admin BFF:    1 instance   ← Staff using it
```

The whole point of BFF is autonomy. Don't undermine it by deploying on shared infrastructure.

## TL;DR — Should You BFF? ⚡

The BFF pattern is not a silver bullet. It's a tool for a specific problem: multiple clients with meaningfully different needs hitting a microservices backend.

If that's you, here's the summary:
- **Create one BFF per client type** (mobile, web, admin)
- **BFFs orchestrate and reshape** — business logic stays in core services
- **Parallel data fetching** in the BFF pays for the extra network hop
- **Deploy BFFs independently** so they scale independently
- **Each BFF owns its own auth** strategy for its client

When I redesigned our e-commerce backend architecture with BFFs, the mobile team shipped 30% faster because they stopped waiting for web-team API changes that didn't affect them. The web team got richer responses without forcing mobile to download useless data. Everyone won.

Except me. I had to refactor three months of code. But that's a Technical Lead's life. 😅

---

**Building multi-client APIs?** Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've learned most of these lessons the hard way in production.

**Want to see real BFF examples?** Check out my [GitHub](https://github.com/kpanuragh) for serverless and microservices architecture patterns.

*Your mobile users are on 3G. Stop downloading 47 fields. They deserve better.* 📱💪
