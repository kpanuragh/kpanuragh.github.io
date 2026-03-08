---
title: "Hexagonal Architecture: Stop Letting Your Framework Own Your Business Logic 🏗️🔌"
date: "2026-03-08"
excerpt: "I spent 3 months migrating our Laravel e-commerce monolith to Node.js microservices and the hardest part? Our business logic was so tangled with Eloquent it wasn't actually portable. Hexagonal Architecture would have saved me that pain."
tags: ["architecture", "scalability", "system-design", "clean-architecture", "hexagonal"]
featured: true
---

# Hexagonal Architecture: Stop Letting Your Framework Own Your Business Logic 🏗️🔌

**True story:** Our team spent 3 months migrating part of our e-commerce backend from Laravel to Node.js. The business logic was simple — calculate order totals, apply discounts, validate stock. Should have been a weekend job.

It took 3 months.

Why? Because our "business logic" was actually `Order::with('items')->where('user_id', $userId)->get()` plastered everywhere. The business logic and the framework were one. You couldn't move one without moving the other. We essentially rewrote everything from scratch.

That's the day I fell in love with Hexagonal Architecture. 😅

## What Is Hexagonal Architecture? 🤔

Created by Alistair Cockburn in 2005, Hexagonal Architecture (also called **Ports and Adapters**) has one core idea:

> Your business logic should have NO idea what framework, database, or delivery mechanism you're using.

Visualize it like this:

```
         ┌─────────────────────────────────────────┐
         │                                         │
  HTTP   │  ┌────────────┐    ┌────────────────┐  │  MySQL
 ──────► │  │            │    │                │  │◄──────
         │  │  Adapter   │    │   Adapter      │  │
  CLI    │  │  (Web)     │───►│  (DB)          │  │  Redis
 ──────► │  │            │    │                │  │◄──────
         │  └─────┬──────┘    └────────┬───────┘  │
  Queue  │        │                   │           │  S3
 ──────► │        ▼                   ▼           │◄──────
         │  ┌─────────────────────────────────┐   │
         │  │                                 │   │
         │  │        CORE DOMAIN              │   │
         │  │   (Your Actual Business Logic)  │   │
         │  │                                 │   │
         │  └─────────────────────────────────┘   │
         │                                         │
         └─────────────────────────────────────────┘
                 ▲               ▲
            Primary Ports    Secondary Ports
          (Driving the app) (Driven by the app)
```

The hexagon in the middle (your core domain) knows NOTHING about HTTP, databases, queues, or any infrastructure. It just knows about business rules.

**Three layers:**
- **Core Domain** — Pure business logic. No framework imports.
- **Ports** — Interfaces defining what the core needs or exposes.
- **Adapters** — Implementations that connect the world to your core.

## The Coupling Nightmare That Started It All 💀

When I architected our order processing service, I wrote this in Laravel:

```php
// BAD: Business logic tangled with Eloquent everywhere
class OrderController extends Controller
{
    public function checkout(Request $request)
    {
        // Validation — framework-specific
        $request->validate(['items' => 'required|array']);

        // Business logic? Or Eloquent? Can't tell anymore!
        $items = Product::whereIn('id', $request->items)
            ->where('stock', '>', 0)
            ->lockForUpdate()
            ->get();

        if ($items->count() !== count($request->items)) {
            return response()->json(['error' => 'Some items out of stock'], 400);
        }

        $total = $items->sum(fn($item) => $item->price * $item->pivot->quantity);

        // Apply discount — buried inside a controller!
        if ($request->user()->orders()->count() > 10) {
            $total = $total * 0.9; // Loyal customer discount
        }

        $order = Order::create([
            'user_id' => $request->user()->id,
            'total' => $total,
            'status' => 'pending',
        ]);

        $order->items()->attach($request->items);

        event(new OrderPlaced($order));

        return response()->json($order);
    }
}
```

**What's wrong with this?**
- Business rule "loyal customer gets 10% off" lives in a controller 🤦
- Can't test without an HTTP request and a real database
- Migrating to a different framework means rewriting everything
- Discount logic is duplicated in 4 other places (I checked — I wrote them all)

As a Technical Lead, I've learned: code like this is fast to write and expensive to maintain.

## The Hexagonal Approach 🎯

Here's the same logic rewritten with Hexagonal Architecture:

**Step 1: Define your domain (no framework imports!)**

```php
// src/Domain/Order/Order.php
// Pure PHP — zero framework, zero Eloquent
class Order
{
    private float $total = 0;
    private array $items = [];
    private OrderStatus $status;

    public function __construct(
        private readonly string $userId,
        private readonly string $id = '',
    ) {
        $this->status = OrderStatus::PENDING;
    }

    public function addItem(OrderItem $item): void
    {
        if (!$item->isInStock()) {
            throw new OutOfStockException($item->productId);
        }
        $this->items[] = $item;
        $this->total += $item->subtotal();
    }

    public function applyLoyaltyDiscount(int $previousOrderCount): void
    {
        // Business rule lives HERE — not in a controller, not in a query
        if ($previousOrderCount >= 10) {
            $this->total = $this->total * 0.9;
        }
    }

    public function total(): float { return $this->total; }
    public function items(): array { return $this->items; }
}
```

**Step 2: Define your ports (interfaces)**

```php
// src/Domain/Order/Ports/OrderRepositoryPort.php
interface OrderRepositoryPort
{
    public function save(Order $order): void;
    public function findById(string $id): Order;
    public function countByUserId(string $userId): int;
}

// src/Domain/Order/Ports/EventPublisherPort.php
interface EventPublisherPort
{
    public function publish(DomainEvent $event): void;
}
```

**Step 3: Write your use case (pure domain logic)**

```php
// src/Application/Checkout/CheckoutUseCase.php
class CheckoutUseCase
{
    public function __construct(
        private readonly OrderRepositoryPort $orders,
        private readonly ProductRepositoryPort $products,
        private readonly EventPublisherPort $events,
    ) {}

    public function execute(CheckoutCommand $command): CheckoutResult
    {
        // Pure business logic — no HTTP, no Eloquent, no framework!
        $order = new Order($command->userId);

        foreach ($command->itemIds as $productId) {
            $product = $this->products->findById($productId);
            $order->addItem(new OrderItem($product));
        }

        $previousOrders = $this->orders->countByUserId($command->userId);
        $order->applyLoyaltyDiscount($previousOrders);

        $this->orders->save($order);
        $this->events->publish(new OrderPlacedEvent($order));

        return new CheckoutResult($order->id(), $order->total());
    }
}
```

**Step 4: Write your adapters (framework-specific stuff)**

```php
// src/Infrastructure/Laravel/Adapters/EloquentOrderRepository.php
// THIS is where Eloquent lives — isolated in the adapter!
class EloquentOrderRepository implements OrderRepositoryPort
{
    public function save(Order $order): void
    {
        OrderModel::create([
            'id' => $order->id(),
            'user_id' => $order->userId(),
            'total' => $order->total(),
            'status' => $order->status()->value,
        ]);
    }

    public function countByUserId(string $userId): int
    {
        return OrderModel::where('user_id', $userId)->count();
    }
}

// src/Infrastructure/Laravel/Http/CheckoutController.php
class CheckoutController extends Controller
{
    public function __construct(private CheckoutUseCase $checkout) {}

    public function __invoke(CheckoutRequest $request): JsonResponse
    {
        // Controller is THIN — it just translates HTTP to domain
        $result = $this->checkout->execute(
            new CheckoutCommand($request->user()->id, $request->input('items'))
        );

        return response()->json(['order_id' => $result->orderId, 'total' => $result->total]);
    }
}
```

**When designing our e-commerce backend**, this separation meant the Node.js rewrite took one weekend for the adapters. The core domain? Copy-paste. Zero changes. 🚀

## Testing Becomes Actually Easy 🧪

This is where Hexagonal Architecture pays off immediately:

```php
// Testing the checkout use case — zero database, zero HTTP!
class CheckoutUseCaseTest extends TestCase
{
    public function test_loyal_customer_gets_discount(): void
    {
        // Use in-memory fakes instead of real adapters
        $orders = new InMemoryOrderRepository();
        $products = new InMemoryProductRepository([
            new Product('prod-1', 'Coffee Mug', 29.99, inStock: true),
        ]);
        $events = new InMemoryEventPublisher();

        $useCase = new CheckoutUseCase($orders, $products, $events);

        // Seed 10 previous orders for "loyal" status
        for ($i = 0; $i < 10; $i++) {
            $orders->seed(new Order('user-123'));
        }

        $result = $useCase->execute(
            new CheckoutCommand('user-123', ['prod-1'])
        );

        // Business rule: 10+ orders = 10% discount
        $this->assertEquals(26.99, $result->total); // 29.99 * 0.9
    }
}
```

No mocking frameworks. No database fixtures. No HTTP clients. Just business logic, tested in milliseconds. **This test suite went from 45 seconds to 2 seconds** after we adopted this pattern.

## Trade-offs (I Won't Lie to You) ⚖️

**The good:**
- ✅ Business logic is portable — switch DB, framework, or delivery mechanism independently
- ✅ Unit tests run in milliseconds (no I/O!)
- ✅ Onboarding is easy — domain code reads like English
- ✅ Changes to Laravel don't cascade into business logic

**The honest downsides:**
- ❌ More files and folders upfront (feels like over-engineering on day 1)
- ❌ Simple CRUD apps don't benefit much — overkill for a blog
- ❌ Team needs to understand the pattern or it collapses into "adapters that call other adapters"
- ❌ Mapping between domain objects and persistence models adds boilerplate

**A scalability lesson that cost us:** We applied this pattern to our entire codebase from day one — including a dead-simple user settings CRUD. Three extra files for `GET /api/settings`. Don't do that. Use it for complex domains, not everything.

## When Should You Use This? 🎯

```
┌─────────────────────────────────────────────────────────┐
│ USE Hexagonal Architecture when:                        │
│  ✅ Business logic is complex (discounts, workflows)    │
│  ✅ Multiple delivery mechanisms (HTTP + Queue + CLI)   │
│  ✅ You might change your database or framework         │
│  ✅ Team > 3 engineers working on same domain           │
│  ✅ You want fast unit tests                            │
├─────────────────────────────────────────────────────────┤
│ SKIP IT when:                                           │
│  ❌ Simple CRUD with no real business rules             │
│  ❌ Solo project / hackathon / prototype               │
│  ❌ Team isn't bought in — inconsistency is worse      │
│  ❌ You're moving fast and need to validate the idea   │
└─────────────────────────────────────────────────────────┘
```

## Common Mistakes I Made (So You Don't Have To) 🪤

**Mistake #1: Putting domain logic in adapters**

```php
// BAD: Discount logic snuck back into the repository!
class EloquentOrderRepository implements OrderRepositoryPort
{
    public function save(Order $order): void
    {
        // DON'T DO THIS — business rule doesn't belong here
        $total = $order->total();
        if ($this->countByUserId($order->userId()) > 10) {
            $total = $total * 0.9;
        }

        OrderModel::create(['total' => $total]);
    }
}
```

**Mistake #2: Frameworks leaking into the domain**

```php
// BAD: Domain class importing Illuminate stuff!
use Illuminate\Database\Eloquent\Model; // ❌ Framework leaks in

class Order extends Model  // Now you can't run this without Laravel
{
    public function applyDiscount(): void { ... }
}
```

**Mistake #3: Giant ports**

```php
// BAD: Port that knows too much
interface OrderRepositoryPort
{
    public function save(Order $order): void;
    public function findById(string $id): Order;
    public function getRevenueReport(DateRange $range): array; // This isn't a domain operation!
    public function getTopSellingByCategory(): array;          // Analytics don't belong here!
}
```

Keep ports focused. If it's analytics, it's a different port.

## TL;DR — The One-Minute Version ⚡

Hexagonal Architecture is just this:

1. **Domain** — Pure business logic. No framework. No database. Just PHP/JS classes.
2. **Ports** — Interfaces that say "I need something that can do X"
3. **Adapters** — Concrete implementations that connect real tools (Laravel, MySQL, Redis) to your domain

Your business logic should be so clean that you can copy it to a new framework and only need to rewrite the adapters.

**The test:** Can you test your business rules without running a real database or HTTP server? If not — you have coupling work to do.

**When designing our e-commerce backend** with this pattern, we could run our full business logic test suite in under 3 seconds on a laptop. No Docker, no seeded databases, no `php artisan test --env=testing` prayer circles. Just fast, reliable tests that actually caught real bugs.

That's the promise of Hexagonal Architecture: **your business logic belongs to you, not your framework.**

---

**Using Hexagonal Architecture in production?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'd love to hear what patterns you're using in your domain layer!

**Want to see real code?** I've got a sample project on [GitHub](https://github.com/kpanuragh) showing Hexagonal Architecture with Laravel and Node.js adapters for the same domain.

*Now go reclaim your business logic!* 🏗️🔌

---

**P.S.** The "Ports and Adapters" name is technically more accurate than "Hexagonal" — Alistair Cockburn himself prefers it. But try saying "Ports and Adapters Architecture" in a team meeting. "Hexagonal" wins on vibes alone.

**P.P.S.** If you're inheriting legacy code where Eloquent and business logic are inseparably fused together: start with the Strangler Fig pattern to carve out a clean domain one use-case at a time. Don't try to refactor everything at once. I did. It wasn't great. 🙈
