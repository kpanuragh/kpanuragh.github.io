---
title: "🪵 Node.js Structured Logging: Stop console.log-ging Your Way to Production Chaos"
date: "2026-03-11"
excerpt: "console.log is a lie you tell yourself in development. Here's how structured logging with Pino transforms your Node.js app from a black box into a system you can actually debug at 3am."
tags: ["\"nodejs\"", "\"express\"", "\"backend\"", "\"logging\"", "\"pino\"", "\"observability\""]
featured: "true"
---

Picture this: your Node.js API is melting down in production. Response times are spiking. Errors are flying. You crack open the logs and see:

```
Server started
user logged in
something went wrong
done
```

You've been `console.log`-ing your way through life and now you're paying the price. Every senior engineer's nightmare, every junior engineer's rite of passage. Let's fix this once and for all.

## Why console.log Is Lying to You

`console.log` feels right. It's familiar. It's instant feedback. But in production, it's approximately as useful as a chocolate teapot:

- **No severity levels** — "something went wrong" tells you nothing. Is it fatal? A warning? Tuesdays?
- **No structure** — unstructured text is grep-able by humans and unqueryable by everything else
- **No context** — which request triggered it? Which user? Which trace ID?
- **Synchronous blocking** — yes, `console.log` blocks the event loop. We'll get to this.
- **No timestamps** — by the time you're reading logs, you need to know *when*, not just *what*

The fix isn't complicated. It just requires changing one habit: swap `console.log` for a real logger.

## Enter Pino: The Speed Demon of Node.js Loggers

[Pino](https://getpino.io) is the logging library the Node.js ecosystem deserves. It's fast — we're talking 5x faster than Winston in benchmarks — because it does one smart thing: it writes JSON and gets out of your way.

```bash
npm install pino pino-pretty
```

Here's the before/after that will change your life:

```javascript
// Before: console.log chaos
app.post('/checkout', async (req, res) => {
  console.log('checkout started')
  try {
    const order = await processOrder(req.body)
    console.log('order created', order.id)
    res.json({ orderId: order.id })
  } catch (err) {
    console.log('error!', err.message)
    res.status(500).json({ error: 'Something went wrong' })
  }
})

// After: structured logging bliss
const logger = require('pino')()

app.post('/checkout', async (req, res) => {
  const reqLogger = logger.child({
    requestId: req.id,
    userId: req.user?.id,
    route: '/checkout'
  })

  reqLogger.info('checkout started')
  try {
    const order = await processOrder(req.body)
    reqLogger.info({ orderId: order.id, amount: order.total }, 'order created successfully')
    res.json({ orderId: order.id })
  } catch (err) {
    reqLogger.error({ err, cartItems: req.body.items?.length }, 'checkout failed')
    res.status(500).json({ error: 'Something went wrong' })
  }
})
```

The second version produces machine-readable JSON. Every log line is a queryable object. You can filter by `userId`, search for all errors in a time window, correlate logs across services — the whole enchilada.

## Child Loggers: Context That Follows You Around

The best Pino feature that nobody talks about enough is child loggers. A child logger inherits all the fields of its parent and adds more. Think of it like cloning yourself but the clone also remembers everything you were doing.

```javascript
// logger.js - your app's single source of logging truth
const pino = require('pino')

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    service: 'payment-api',
    version: process.env.APP_VERSION || 'unknown',
    env: process.env.NODE_ENV
  }
})

module.exports = logger

// middleware.js - attach a request-scoped logger to every req
const { randomUUID } = require('crypto')

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID()

  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip
  })

  req.log.info('request received')

  const start = Date.now()
  res.on('finish', () => {
    req.log.info({
      statusCode: res.statusCode,
      durationMs: Date.now() - start
    }, 'request completed')
  })

  next()
}
```

Now every single log line in your handlers automatically includes `requestId`, `method`, `path`, and `ip` without you typing a word. When something breaks, you grep for the request ID and get the entire story of that request from start to finish. It's like having a flight data recorder in your API.

## Log Levels: The Severity Spectrum

Pino gives you six levels, and using them correctly is an art form:

| Level | When to use |
|-------|-------------|
| `trace` | Firehose mode — function calls, loop iterations. Disabled in prod. |
| `debug` | Helpful context during dev — query params, intermediate values |
| `info` | Normal business events — user logged in, order created, job started |
| `warn` | Suspicious but not broken — deprecated API call, retry attempt |
| `error` | Something broke and needs human attention |
| `fatal` | System is going down. Probably do a `process.exit(1)` after this. |

The golden rule: `info` for things that *should* happen, `warn` for things that *shouldn't but aren't catastrophic*, `error` for things that *definitely shouldn't* happen.

```javascript
// Good log level hygiene
logger.debug({ query: sql, params }, 'executing database query')    // too noisy for prod
logger.info({ userId, action: 'login' }, 'user authenticated')      // expected event
logger.warn({ retryCount, jobId }, 'job retry - upstream timeout')  // suspicious
logger.error({ err, userId }, 'payment processing failed')          // page someone
logger.fatal({ err }, 'database connection pool exhausted')         // wake everyone up
```

## The Async Secret: Pino Uses a Worker Thread

Here's where Pino earns its speed crown. By default, `console.log` is synchronous — it writes to stdout and waits. Under heavy load, this blocks your event loop and tanks your throughput.

Pino's `pino/file` transport writes to a worker thread using `pino-worker`. Your main thread hands off the log entry and immediately continues. The worker serializes and writes asynchronously.

```javascript
const pino = require('pino')

// Async transport - writes happen off the main thread
const logger = pino(
  pino.transport({
    target: 'pino/file',
    options: { destination: '/var/log/app.log', mkdir: true }
  })
)
```

For production systems processing thousands of requests per second, this is the difference between a logging library and a logging *tax*.

## Shipping Logs Somewhere Useful

Raw JSON logs on disk are nice. Logs in a searchable system are nicer. Most cloud logging pipelines (Datadog, CloudWatch, Loki, ELK) natively ingest JSON logs. Zero extra configuration needed — just ship stdout.

In Docker/Kubernetes, that means your logs automatically flow to whatever log aggregator your cluster uses. Configure Pino once, get observability everywhere.

```javascript
// Production config: JSON to stdout, structured for any log shipper
const logger = pino({
  level: 'info',
  formatters: {
    level: (label) => ({ level: label }),      // use string levels, not numbers
    bindings: (bindings) => ({                  // normalize field names
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,     // ISO timestamps, not epoch ms
})
```

## The Migration Path

Replacing `console.log` across a large codebase sounds painful. It isn't. A few steps:

1. Create `lib/logger.js` with your Pino config
2. Add the request logger middleware globally in `app.js`
3. Start using `req.log` in route handlers
4. Replace module-level `console.log` calls as you touch files — don't do it all at once
5. Set `LOG_LEVEL=debug` locally, `LOG_LEVEL=info` in production

You don't have to rip out every `console.log` on day one. Add the structured logger alongside, use it for new code, and migrate old code opportunistically. Two months from now you'll barely remember what life was like before.

## Wrapping Up

`console.log` got you here. Pino gets you to the next level. The difference between a codebase you can debug confidently at 3am and one that makes you want to quit isn't the code — it's the observability.

Structured logging is the cheapest reliability investment you can make. One afternoon of setup. Years of sanity.

**Your action items:**
1. Install Pino: `npm install pino pino-pretty`
2. Create a `lib/logger.js` in your next project (or your current one today)
3. Add the request logger middleware
4. Watch your log aggregator actually become useful

Your future self, sitting in an incident call with actual context instead of `console.log('error')`, will thank you.

---

*Found this useful? Share it with the team member who still has `console.log('here')` in production. We've all been there.*
