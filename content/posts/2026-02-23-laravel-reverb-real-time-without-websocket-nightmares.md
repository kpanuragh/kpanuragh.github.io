---
title: "Laravel Reverb: Real-Time Features Without the WebSocket Nightmares ⚡"
date: "2026-02-23"
excerpt: "Real-time notifications, live dashboards, chat - without paying Pusher $50/month or maintaining a Node.js server. Laravel Reverb to the rescue."
tags: ["laravel", "php", "web-dev", "websockets", "real-time"]
---

# Laravel Reverb: Real-Time Features Without the WebSocket Nightmares ⚡

Nothing humbles a senior developer faster than trying to add "just a little real-time notification" to a Laravel app.

Three npm packages, a Node.js server, a Pusher account, three environment variables, and four Stack Overflow tabs later... your little notification is live. Barely. And it costs $49/month.

I've been there. Multiple times. Building real-time dashboards for e-commerce backends at Cubet Techno Labs, I watched every "simple real-time feature" balloon into a multi-day yak shave involving third-party services, socket.io configs, and a Redis setup that nobody understood except me.

Laravel Reverb changed that. Let me show you how.

---

## 📡 What Is Laravel Reverb (30-Second Version)

Reverb is Laravel's own first-party WebSocket server. Officially released with Laravel 11, it lets you run real-time features — live notifications, chat, dashboards, presence indicators — **right inside your existing PHP app**.

No separate Node.js process. No Pusher subscription. No Ably. No Soketi. Just Laravel.

It implements the Pusher protocol, which means anything that worked with Pusher in your app? Works with Reverb, with zero frontend changes.

---

## 😭 The Old Way (Before Reverb)

Before Reverb, you had two choices:

**Option 1: Pusher**
- Throw your credit card at them
- Works great until you hit their connection limits at 3am during a product launch
- Every message your server sends costs you money

**Option 2: Roll your own**
- Spin up a Node.js server
- Pray it stays running
- Add Nginx config, systemd service, monitoring...
- Now you're maintaining two tech stacks in production

As a Technical Lead, I've had to explain Option 2 to clients who asked "wait, why do we need a Node.js server for a PHP app?" at least four times. Not fun.

---

## 🚀 Setting Up Reverb (Actually Simple)

Install it with one Artisan command:

```bash
php artisan install:broadcasting
```

That's it. Laravel asks if you want Reverb, you say yes, it installs everything and even updates your `.env`.

Start the Reverb server locally:

```bash
php artisan reverb:start
```

**Pro Tip:** In production, run it with Supervisor just like your queue workers. Same pattern, same concept — Reverb is basically a long-running PHP process.

---

## 🎯 Broadcasting an Event (Before vs. After)

Here's the thing that made me fall in love with Reverb: **your broadcasting code doesn't change at all**.

You still create events the same Laravel way:

```php
class OrderStatusUpdated implements ShouldBroadcast
{
    public function __construct(public Order $order) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("orders.{$this->order->user_id}")];
    }
}
```

Fire it anywhere — controller, job, observer:

```php
broadcast(new OrderStatusUpdated($order));
```

On the frontend, Echo works exactly as before:

```javascript
Echo.private(`orders.${userId}`)
    .listen('OrderStatusUpdated', (e) => {
        // Update your UI
        updateOrderStatus(e.order.status);
    });
```

The only change? Your `.env` now points to Reverb instead of Pusher.

```env
BROADCAST_CONNECTION=reverb
```

That's the entire migration from Pusher. One line.

---

## 💡 Real Talk: What I Learned Building Real-Time Features in Production

**Real-time is addictive.** Once you ship one live feature, your product team will immediately ask for four more. Budget for this.

**Channels matter more than you think.**
- Public channels: Anyone can listen. Use for broadcast announcements.
- Private channels: Auth required. Use for user-specific updates.
- Presence channels: Shows who's currently connected. Use for "who's online" features.

In production systems I've built, we used private channels for order status updates and presence channels for a live order tracking page where ops staff could see which driver was looking at which delivery. Reverb made this trivial to implement.

**Don't broadcast fat events.** I made this mistake early on — I was broadcasting entire Eloquent models in my events. The event payload got huge. Broadcast only the IDs and status strings. Let the frontend fetch details if needed.

**Bad:**
```php
public function broadcastWith(): array
{
    return ['order' => $this->order->toArray()]; // Entire model = fat payload
}
```

**Better:**
```php
public function broadcastWith(): array
{
    return [
        'order_id' => $this->order->id,
        'status' => $this->order->status,
    ];
}
```

---

## 🔥 Pro Tips From Production

**Scale Reverb horizontally with Redis.** Out of the box Reverb stores connection state in memory. Fine for one server. When you scale to multiple instances, use Redis as the backend:

```env
REVERB_SCALING_ENABLED=true
```

This was critical for us when we were running the app across multiple Lambda containers (with ECS) — each instance needed to know about connections on other instances.

**Use `broadcastIf()` to skip unnecessary broadcasts.** Don't wake up your WebSocket server for events nobody is listening to:

```php
public function broadcastOn(): array
{
    return [new PrivateChannel("orders.{$this->order->user_id}")];
}

// Only broadcast if the order changed meaningfully
public function broadcastIf(): bool
{
    return $this->order->wasChanged('status');
}
```

**Monitor your Reverb server with Horizon-style stats.** Reverb exposes metrics. Hook them up to CloudWatch or your monitoring stack of choice. A silent WebSocket server that's secretly dead is the worst kind of silent failure.

---

## 🎁 Bonus: Presence Channels Are Underrated

Most devs use Reverb for simple notifications. But presence channels are where it gets really fun.

Imagine showing "3 people are viewing this product right now" on your e-commerce site — the classic scarcity nudge. With presence channels, that's maybe 20 lines of code:

```javascript
Echo.join(`product.${productId}`)
    .here((users) => updateViewerCount(users.length))
    .joining((user) => updateViewerCount(currentCount + 1))
    .leaving((user) => updateViewerCount(currentCount - 1));
```

A pattern that saved us in a real project: we used presence channels on a food delivery app to let the kitchen screen show which orders were being actively viewed by delivery drivers. It cut "order picked up twice" incidents to near zero.

---

## 📋 The Reverb Checklist

Before you go live with real-time features:

- [ ] Reverb server running via Supervisor (like queue workers)
- [ ] Redis backend enabled if running multiple instances
- [ ] Broadcasting only minimal data in event payloads
- [ ] Private/presence channels for sensitive data (not public!)
- [ ] Frontend Laravel Echo configured and tested
- [ ] Monitoring set up — a dead WebSocket server is invisible

---

## The Bottom Line 🎯

Real-time features in Laravel used to mean: pick your poison between a third-party bill or a second tech stack to maintain.

Laravel Reverb is the third option nobody had before: **first-party, Laravel-native, deploy it like everything else you deploy.**

As a Technical Lead, I've evaluated every WebSocket solution for Laravel at some point. Reverb is the first one I've recommended to clients without adding seventeen caveats.

Ship the live dashboard. Add the chat feature. Make the notification appear instantly. You no longer have an excuse not to.

---

**Want to nerd out about real-time architectures?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got war stories.

**More Laravel deep dives:** Star the blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and stick around!

*Now go make something live.* 📡
