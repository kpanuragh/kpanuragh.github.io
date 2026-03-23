---
title: "🕵️ Node.js Memory Leaks: Your App is Eating RAM and You Don't Even Know It"
date: "2026-03-09"
excerpt: "Your Node.js process started at 80MB and now it's sitting at 1.2GB after three days. No, it's not haunted — you have a memory leak. Let's find it and kill it."
tags: ["\"nodejs\"", "\"backend\"", "\"performance\"", "\"debugging\"", "\"javascript\""]
featured: "true"
---

Your Node.js server has been running for four days. Response times are getting sluggish. The ops team is paging you at 2am because the process hit 2GB of RAM and the container got OOM-killed. You restart it, go back to sleep, and wake up to the same thing three days later.

Congratulations. You have a memory leak.

Memory leaks in Node.js are sneaky. Unlike a crashed process screaming at you with a stack trace, a memory leak is more like a slow gas leak — invisible, odorless, and only noticeable when you're already lightheaded. Today we're going to find them, understand them, and squash them.

## Why Node.js Leaks Memory (And Why You're Probably Causing It)

JavaScript has garbage collection, so how do you even get a memory leak? Simple: you accidentally keep references to objects that should be freed. The garbage collector can only clean up things that *nothing* points to. If you hold onto a reference — even accidentally — that object lives forever.

The three most common culprits:

1. **Global variables** that grow indefinitely
2. **Event listeners** that never get removed
3. **Closures** that capture more than they should

Let's look at real examples.

## The Classic: EventEmitter Listener Pile-Up

This one is insidious because it looks perfectly fine:

```javascript
const EventEmitter = require('events');
const emitter = new EventEmitter();

// Called on every incoming HTTP request
function handleRequest(req, res) {
  // Oops — new listener added on every request, never removed
  emitter.on('data', (chunk) => {
    res.write(chunk);
  });

  fetchData().then(data => emitter.emit('data', data));
}
```

Every request adds a new listener. After 10,000 requests, you have 10,000 listeners on that emitter, all holding references to `res` objects. Node.js will actually warn you: *"MaxListenersExceededWarning: Possible EventEmitter memory leak detected."* That warning is your friend — don't mute it.

The fix is simple: use `once` instead of `on` if you only need the event fired once, or clean up with `removeListener`:

```javascript
function handleRequest(req, res) {
  const onData = (chunk) => {
    res.write(chunk);
  };

  emitter.once('data', onData); // fires once, auto-removes

  // OR, if you need 'on':
  fetchData().then(data => {
    emitter.emit('data', data);
    emitter.removeListener('data', onData); // explicit cleanup
  });
}
```

## The Sneaky One: Caches Without Eviction

Building an in-memory cache? Great idea — until you forget that things need to leave the cache too:

```javascript
// BAD: This Map grows forever
const cache = new Map();

app.get('/user/:id', async (req, res) => {
  const { id } = req.params;

  if (!cache.has(id)) {
    const user = await db.findUser(id);
    cache.set(id, user); // stored forever, never evicted
  }

  res.json(cache.get(id));
});
```

In production with millions of unique user IDs, that `Map` will happily consume all available memory. The fix is to use a proper LRU cache with a size limit, or leverage `WeakMap` for object keys (values get garbage collected when the key object is collected), or simply set a TTL:

```javascript
const LRU = require('lru-cache');

const cache = new LRU({
  max: 1000,           // maximum 1000 entries
  ttl: 1000 * 60 * 5, // 5-minute TTL
});

app.get('/user/:id', async (req, res) => {
  const { id } = req.params;

  const cached = cache.get(id);
  if (cached) return res.json(cached);

  const user = await db.findUser(id);
  cache.set(id, user);
  res.json(user);
});
```

Now the cache has a maximum size and entries expire. Problem solved.

## How to Actually Find Leaks: The Heap Snapshot Method

Knowing the patterns is great, but what if you have a leak and no idea where it is? Use Node's built-in heap profiler.

Start your app with the inspector flag:

```bash
node --inspect server.js
```

Open Chrome, navigate to `chrome://inspect`, click "Open dedicated DevTools for Node". In the Memory tab, take a heap snapshot, send some traffic to your server, take another snapshot, then compare them.

Look for objects that keep growing between snapshots. The "Comparison" view shows you what was allocated and not freed. If you see `Array`, `Object`, or `Closure` counts climbing, you've found your culprit. Click on them to see the retaining path — who's holding the reference that prevents garbage collection.

For production debugging without Chrome, the `--expose-gc` flag lets you force GC in your code for profiling, and tools like `heapdump` let you write snapshots to disk for offline analysis.

## The setInterval Ghost

One more gotcha: timers that outlive their scope:

```javascript
function startMonitoring(socket) {
  // This interval captures `socket` in its closure
  const interval = setInterval(() => {
    socket.send(JSON.stringify({ status: 'alive' }));
  }, 5000);

  // If we forget to clear on disconnect, the interval
  // keeps firing and holds the socket reference
  socket.on('close', () => {
    // clearInterval(interval); // <-- don't forget this!
  });
}
```

When the socket closes but you forget `clearInterval`, the timer keeps firing forever, sending to a dead socket and holding the reference in memory. Always pair `setInterval` with `clearInterval` in cleanup handlers.

## Quick Wins: Monitor Before You Debug

Prevention beats debugging. Add basic memory monitoring to your app:

```javascript
setInterval(() => {
  const used = process.memoryUsage();
  console.log({
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
  });
}, 30_000);
```

If `heapUsed` climbs steadily over hours without leveling off, you have a leak. Export this to your metrics system (Prometheus, Datadog, CloudWatch) and alert when heap usage grows beyond a threshold. Catching leaks early — at 200MB instead of 2GB — means finding them while they're small and reproducible.

## The Memory Leak Checklist

Before shipping your next Node.js service, run through this:

- Are you removing event listeners when subscriptions are no longer needed?
- Do your in-memory caches have a maximum size and TTL?
- Are all `setInterval` and `setTimeout` calls cleared in cleanup handlers?
- Are you storing anything in module-level variables that grows unboundedly?
- Do your closures capture references to large objects they don't actually need?

Memory leaks are one of those bugs that feel embarrassing once found ("I just forgot to remove a listener?") but can take days to track down. The key is knowing the common patterns and having profiling tools ready before the 2am page, not after.

---

Had a particularly nasty memory leak that took you days to track down? I'd love to hear the story — the best debugging war stories are always about the most absurd causes. Drop a comment or find me on GitHub [@kpanuragh](https://github.com/kpanuragh).
