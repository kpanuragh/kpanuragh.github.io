---
title: "Laravel Reverb: Real-Time Features That Don't Require a Second Mortgage 💸⚡"
date: "2026-03-20"
excerpt: "Stop outsourcing your WebSockets to a third-party and paying through the nose for it. Laravel Reverb is here, it's free, and it's stupidly easy to set up."
tags: ["laravel", "php", "websockets", "real-time", "web-dev"]
---

# Laravel Reverb: Real-Time Features That Don't Require a Second Mortgage 💸⚡

Every developer has been there. Product manager walks in: "Can we add real-time notifications? Like Slack but... ours?"

You say yes, you implement Pusher, it works great... until you see the bill. Then you say things you can't write in a blog post.

I've been that developer. Multiple times. Building e-commerce backends where real-time order status updates are literally a core feature, I've had this exact conversation with finance: "No, I can't just 'turn off WebSockets' to save money."

Enter **Laravel Reverb** — Laravel's own first-party WebSocket server. Ships with Laravel 11+. And yes, it's free. Like, *actually* free. Run it on your own server, pay nothing extra.

## What the Heck Is Reverb? 🤔

Reverb is Laravel's native WebSocket server. Before it existed, you had two options:

1. **Pusher** — Third-party hosted WebSocket service. Great developer experience. Expensive at scale.
2. **Soketi** — Self-hosted Pusher alternative. Free. Required you to run a separate Node.js process. Felt a bit... janky alongside a PHP app.

Reverb is the third option nobody had: a *PHP WebSocket server* built directly into the Laravel ecosystem. It speaks the Pusher protocol (so Laravel Echo still works), but runs as a Laravel artisan command on your own infrastructure.

As a Technical Lead, I've learned that "simplify the stack" is almost always the right call. Fewer moving parts = fewer 3 AM incidents.

## Setting It Up (Embarrassingly Simple) 🚀

```bash
composer require laravel/reverb
php artisan reverb:install
```

That's it. Seriously. Run `php artisan reverb:start` and you have a WebSocket server. In production, slap it behind Supervisor like your queue workers:

```ini
[program:reverb]
command=php /var/www/html/artisan reverb:start --host=0.0.0.0 --port=8080
autostart=true
autorestart=true
```

Done. No separate Node.js process. No separate service to monitor. Your PHP app, your WebSocket server, same deployment.

## Sending Real-Time Events 📡

You already know how to fire Laravel events. Reverb doesn't change that — you just broadcast them.

```php
// The event
class OrderStatusUpdated implements ShouldBroadcast
{
    public function __construct(public Order $order) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("orders.{$this->order->user_id}")];
    }
}

// Fire it anywhere
OrderStatusUpdated::dispatch($order);
```

**Before:** `$order->status = 'shipped'; $order->save();` — user refreshes the page 47 times.

**After:** Same save, plus one event dispatch — user sees it update in real time. 🎉

## Listening on the Frontend 🎧

Laravel Echo + Reverb = effortless. The frontend code is identical to what you'd write for Pusher:

```javascript
import Echo from 'laravel-echo';
import Reverb from '@laravel/echo-reverb';

window.Echo = new Echo({
    broadcaster: Reverb,
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT,
});

// Listen for order updates
Echo.private(`orders.${userId}`)
    .listen('OrderStatusUpdated', (e) => {
        updateOrderStatus(e.order.status);
    });
```

In production systems I've built, switching from Pusher to Reverb required exactly **zero** changes to the frontend. Same Echo API. The `.env` values change, the code doesn't. That's good API design.

## Private Channels: Security Done Right 🔐

Real-time without auth is chaos. Reverb respects your existing auth out of the box.

```php
// routes/channels.php
Broadcast::channel('orders.{userId}', function (User $user, int $userId) {
    return $user->id === $userId;
});
```

That callback runs when a client tries to subscribe. Return `true`, they're in. Return `false` or throw an exception, they get a 403. Your existing `$user` is injected automatically.

**Pro Tip:** Use private channels (`private-`) for user-specific data and presence channels (`presence-`) for collaborative features like "who else is viewing this document." Reverb handles both.

## Presence Channels: The "Others Are Watching" Feature 👥

A pattern that saved us in a real project: we had multiple ops team members who could all edit an order simultaneously. Classic race condition waiting to happen.

```php
// Show who's currently viewing the same order
Echo.join(`order-room.${orderId}`)
    .here((users) => {
        showActiveViewers(users);
    })
    .joining((user) => {
        addViewer(user);
    })
    .leaving((user) => {
        removeViewer(user);
    });
```

With one presence channel subscription, every ops agent could see who else was in the same order screen. Conflicts dropped to near zero. Product manager cried happy tears.

## Real Talk: When Should You Use Reverb? 💬

**Perfect for:**
- Order/status tracking dashboards
- Live notifications ("Your file is ready")
- Collaborative editing indicators
- Real-time chat (internal tools, support)
- Live dashboards (sales metrics, queue depths)

**Maybe not for:**
- Ultra-high-frequency trading data (sub-millisecond latency requirements)
- 100k+ concurrent connections on a single box (horizontal scaling needs more config)
- If your ops team already runs managed Pusher and has zero interest in self-hosting

For most Laravel apps handling thousands of concurrent connections? Reverb is more than enough. I've run it on a single `t3.medium` serving 3,000+ concurrent WebSocket connections without breaking a sweat.

## Scaling Reverb Horizontally 📈

If you DO need to scale across multiple servers, add Redis as the broadcast driver and Reverb will coordinate:

```env
BROADCAST_CONNECTION=reverb
REVERB_SCALING_ENABLED=true
REVERB_SCALING_DRIVER=redis
```

Your queue workers already use Redis. Now your WebSockets use it too. Same infrastructure. As a Technical Lead, "reuse what you already run" is a principle I defend religiously.

## Bonus Tips 🎯

**Tip 1: Queue your broadcasts** — Heavy broadcast operations should be queued, not inline:

```php
class OrderStatusUpdated implements ShouldBroadcast, ShouldQueue
{
    // ShouldQueue = broadcast runs in your queue worker, not in the HTTP request
}
```

**Tip 2: Filter what you send** — Only broadcast the fields clients actually need:

```php
public function broadcastWith(): array
{
    return [
        'status' => $this->order->status,
        'updated_at' => $this->order->updated_at->toIso8601String(),
    ];
}
```

Don't send the whole Eloquent model. Send what the frontend needs. Minimal surface area = better security + performance.

**Tip 3: Use `broadcastWhen()`** — Only broadcast when something meaningful changes:

```php
public function broadcastWhen(): bool
{
    return $this->order->wasChanged('status');
}
```

No point waking up every WebSocket connection because you updated `updated_at`.

## The Bottom Line 🏁

Before Reverb: "Real-time features" was a line item in your SaaS budget.

After Reverb: It's just another artisan process on the server you're already paying for.

The Laravel team basically eliminated an entire category of third-party dependency for most apps. That's the kind of batteries-included thinking that makes me stay in the Laravel ecosystem after 7+ years.

If you're building anything with real-time requirements — and honestly, most modern apps have *some* — give Reverb a proper look before reaching for your credit card.

---

**Got questions about scaling Reverb in production?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've run it in serverless environments too and have opinions.

**More Laravel deep dives?** Star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and I'll keep them coming!

*Now go build something that updates in real time. Your users deserve better than F5.* 🔄
