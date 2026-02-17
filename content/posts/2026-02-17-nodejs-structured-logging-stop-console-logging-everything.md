---
title: "Node.js Structured Logging: Stop console.log()-ing Everything 📋"
date: "2026-02-17"
excerpt: "If your production debugging strategy is `console.log('here')` followed by `console.log('here2')`, we need to talk. Structured logging in Node.js will save your sanity - and maybe your job."
tags: ["nodejs", "javascript", "backend", "logging", "devops"]
featured: true
---

# Node.js Structured Logging: Stop console.log()-ing Everything 📋

**Hot take:** `console.log('user data:', userData)` is not a logging strategy. It's a cry for help.

When I was building Node.js APIs at Acodez, our "logging" was a trail of `console.log` statements scattered across the codebase like breadcrumbs left by a very confused developer. One day, production went down at 2am. I SSH'd into the server, scrolled through logs, and found... thousands of lines of random JSON objects with zero context about which request triggered what or in what order.

Fun times! 😭

Coming from Laravel, I was used to `Log::info()`, `Log::error()`, and the beautiful `storage/logs/laravel.log` with timestamps and stack traces. Node.js has nothing like that out of the box. You build it yourself - or you learn about structured logging the hard way. I chose the hard way. You don't have to.

## What's Wrong with console.log? 🔍

Everything. Let me show you.

```javascript
// Your current "logging"
app.post('/api/orders', async (req, res) => {
    console.log('Processing order');           // No timestamp
    console.log(req.body);                     // Full object dump, no context
    console.log('user id:', req.user.id);      // No request ID, no correlation

    try {
        const order = await createOrder(req.body);
        console.log('Order created!');         // Which order? When?
        res.json(order);
    } catch (err) {
        console.log('ERROR:', err);            // Goes to stdout, not stderr
    }
});
```

**What your logs look like:**
```
Processing order
{ item: 'laptop', qty: 2, userId: 42 }
user id: 42
Processing order
{ item: 'phone', qty: 1, userId: 17 }
Order created!
user id: 17
ERROR: Error: Insufficient stock
    at createOrder (/app/orders.js:34:11)
Order created!
Processing order
```

When 100 concurrent requests are running? That log is completely unreadable. Which "ERROR" belongs to which "Processing order"? No idea. You're debugging blind. 🦯

## What Is Structured Logging? 🏗️

**Structured logging** = Every log line is a machine-readable JSON object with consistent fields.

Instead of:
```
Processing order for user 42
```

You get:
```json
{
  "timestamp": "2026-02-17T08:23:14.521Z",
  "level": "info",
  "message": "Processing order",
  "requestId": "req_8x92kl",
  "userId": 42,
  "service": "order-api",
  "env": "production"
}
```

Now you can filter, search, alert, and visualize. CloudWatch, Datadog, Grafana - they all love JSON logs. `console.log` produces garbage that none of them can parse.

## Enter Winston: The de facto Node.js Logger 🎯

**Winston** is what I use in every Node.js project. Here's the pattern I've settled on after 1.5 years of production APIs:

```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: {
        service: process.env.SERVICE_NAME || 'api',
        env: process.env.NODE_ENV
    },
    transports: [
        // Errors go to their own file
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        // Everything goes here
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ]
});

// Pretty output in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;
```

**Usage - now your logs make sense:**

```javascript
const logger = require('./logger');

app.post('/api/orders', async (req, res) => {
    logger.info('Processing order', {
        userId: req.user.id,
        items: req.body.items?.length
    });

    try {
        const order = await createOrder(req.body);
        logger.info('Order created successfully', {
            orderId: order.id,
            userId: req.user.id,
            total: order.total
        });
        res.json(order);
    } catch (err) {
        logger.error('Order creation failed', {
            userId: req.user.id,
            error: err.message,
            stack: err.stack
        });
        res.status(500).json({ error: 'Order failed' });
    }
});
```

**What the logs look like now:**
```json
{"timestamp":"2026-02-17T08:23:14.521Z","level":"info","message":"Processing order","userId":42,"items":2,"service":"order-api","env":"production"}
{"timestamp":"2026-02-17T08:23:14.891Z","level":"info","message":"Order created successfully","orderId":"ord_99x1","userId":42,"total":1299.99,"service":"order-api","env":"production"}
{"timestamp":"2026-02-17T08:23:15.002Z","level":"info","message":"Processing order","userId":17,"items":1,"service":"order-api","env":"production"}
{"timestamp":"2026-02-17T08:23:15.450Z","level":"error","message":"Order creation failed","userId":17,"error":"Insufficient stock","service":"order-api","env":"production"}
```

Now filter for `userId: 17`? Every log line for that user. Filter `level: error`? Only failures. 2am incident becomes 2 minutes of investigation, not 2 hours. 🎉

## The Request ID Pattern (The One I Use Everywhere) 🔗

**The biggest logging mistake I made:** Not correlating logs to requests.

With 100 concurrent requests, you need to trace a single request through your entire system. Enter **request IDs**:

```javascript
// middleware/requestLogger.js
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

module.exports = (req, res, next) => {
    // Generate unique request ID (or use one from upstream)
    req.requestId = req.headers['x-request-id'] || uuidv4();

    // Add request ID to response headers
    res.setHeader('x-request-id', req.requestId);

    // Create a child logger with request context baked in
    req.log = logger.child({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        ip: req.ip
    });

    // Log the incoming request
    req.log.info('Request received');

    // Log response when it finishes
    const start = Date.now();
    res.on('finish', () => {
        req.log.info('Request completed', {
            statusCode: res.statusCode,
            duration: Date.now() - start
        });
    });

    next();
};
```

**Now in your routes - no context needed, it's already there:**

```javascript
app.post('/api/orders', async (req, res) => {
    req.log.info('Processing order', { items: req.body.items?.length });

    try {
        const order = await createOrder(req.body);
        req.log.info('Order created', { orderId: order.id });
        res.json(order);
    } catch (err) {
        req.log.error('Order failed', { error: err.message });
        res.status(500).json({ error: 'Order failed' });
    }
});
```

Every log line for that request automatically includes `requestId`. In CloudWatch, search `requestId: "req_8x92kl"` and see the ENTIRE lifecycle of that one request. Debugging becomes actually fun. (Okay, less terrible.)

## The Laravel Comparison That'll Make You Appreciate Both 🤔

**In Laravel, this comes free:**

```php
// Laravel - zero config needed
Log::info('Processing order', ['userId' => $userId, 'items' => count($items)]);
Log::error('Order failed', ['error' => $e->getMessage()]);

// Automatically has: timestamp, level, context
// Log channels: single, daily, slack, stack - all configurable in config/logging.php
```

**In Node.js, you wire it up yourself:**

```javascript
// Node.js - you build it
req.log.info('Processing order', { userId, items: items.length });
req.log.error('Order failed', { error: err.message });

// You control: format, transports, rotation, context
```

Which is better? Honestly - Laravel's DX wins for setup speed. Node.js wins for flexibility. I've had Laravel logs go MIA because the `storage/logs` directory filled up. In Node.js, I pipe directly to stdout and let my container orchestrator (ECS, Kubernetes) handle log collection. No disk space worries. Each approach has its place.

## Common Mistakes to Avoid 🚫

### Mistake #1: Logging Sensitive Data

```javascript
// BAD - this is a security incident waiting to happen
logger.info('User login', { user: req.body }); // Logs password!
logger.info('Payment processed', { card: paymentData }); // Card number in logs!

// GOOD - log only what you need
logger.info('User login', { userId: user.id, email: user.email });
logger.info('Payment processed', { orderId: order.id, last4: card.last4 });
```

I've seen production logs with plain-text passwords from `req.body` dumps. That's a GDPR violation and a breach notification waiting to happen. 😬

### Mistake #2: Logging Too Much in Production

```javascript
// BAD - debug logs in production murder your log bill
logger.debug('Fetching user from cache', { key: cacheKey });
logger.debug('Cache miss, querying database');
logger.debug('Query result', { rows: results.length });

// GOOD - use log levels properly
process.env.LOG_LEVEL = 'info'; // In production
process.env.LOG_LEVEL = 'debug'; // In development
```

Our CloudWatch bill at Acodez was $200/month. Switched debug logs off in production: $35/month. Log levels pay for themselves. 💸

### Mistake #3: Synchronous File Writes

```javascript
// BAD - blocks the event loop on every log line
const fs = require('fs');
fs.writeFileSync('app.log', JSON.stringify(logEntry) + '\n', { flag: 'a' });

// GOOD - use a proper logger that writes async
// Winston handles this for you
logger.info('This is async and non-blocking');
```

Node.js is single-threaded. Synchronous file writes on every request will tank your performance. Use Winston's built-in async transports.

## Quick Setup (Copy-Paste Ready) 🚀

```bash
npm install winston uuid
```

```javascript
// logger.js - drop this in every Node.js project
const winston = require('winston');

module.exports = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
    ),
    defaultMeta: { service: process.env.SERVICE_NAME || 'api' },
    transports: [new winston.transports.Console()]
});
```

That's it. 20 lines. Now `console.log` your way to... actually, stop that. Use the logger. 😄

## TL;DR 🎯

1. **`console.log` in production** = flying blind at 2am during an incident
2. **Winston** = the standard Node.js logging library, use it
3. **Structured JSON logs** = searchable, filterable, tool-friendly
4. **Request IDs** = trace one request through your entire system
5. **Log levels** = DEBUG in dev, INFO in prod; your cloud bill will thank you
6. **Never log passwords, tokens, or card numbers** - seriously

When I was building Node.js APIs at Acodez, adding proper structured logging turned 2-hour debugging sessions into 5-minute ones. That's not just better DX - that's actually sleeping through the night when something goes wrong at 2am. And trust me, something will go wrong at 2am. Be ready for it. 🌙

---

**Still using console.log in production?** Let's fix that together. Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want to see how I structure Node.js projects?** Check my [GitHub](https://github.com/kpanuragh) - proper logging in every repo. No `console.log`s in production, I promise. 😄

*P.S. - The next time production goes down at 2am, you want `requestId: "req_8x92kl"` in your logs, not 500 lines of `here2` and `here3`. Set up structured logging today!* 📋
