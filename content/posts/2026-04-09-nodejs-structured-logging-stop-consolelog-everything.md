---
title: "🪵 Node.js Structured Logging: Stop console.log()-ing Everything Like It's 2012"
date: 2026-04-09
excerpt: "Your logs are a crime scene — and right now they read like a toddler's diary. Let's fix that with structured logging in Node.js so you can actually debug production without losing your mind."
tags: ["nodejs", "express", "backend", "logging", "observability", "devops"]
featured: true
---

Picture this: it's 2 AM, your phone is buzzing, production is down, and you're staring at a wall of logs that looks like this:

```
starting server
user logged in
error!!
undefined
[Object object]
done
```

Congratulations. You have achieved nothing. Your logs are useless. You might as well have left a Post-it note that says "something happened, good luck."

This is the fate of every app that relies on `console.log()` for observability. Today we fix that — with **structured logging**.

## What Even Is Structured Logging?

Structured logging means your logs are machine-readable **data**, not free-form text. Instead of:

```
User 42 failed to login at 3:42pm because wrong password
```

You get:

```json
{
  "level": "warn",
  "message": "Login failed",
  "userId": 42,
  "reason": "invalid_password",
  "timestamp": "2026-04-09T03:42:00.000Z",
  "requestId": "req-abc123",
  "ip": "192.168.1.1"
}
```

Now your log aggregator (Datadog, CloudWatch, Grafana Loki, whatever) can **filter, search, and alert** on actual fields. You can ask "show me all failed logins for userId 42 in the last hour" and get an answer in milliseconds instead of grepping through terabytes of text.

## Enter Pino: The Logging Library That Won't Eat Your CPU

There are a few structured logging libraries for Node.js, but **Pino** is the one worth caring about. It's fast (criminally fast — benchmarks show it's 5-8x faster than Winston), outputs JSON by default, and has a tiny footprint.

```bash
npm install pino pino-pretty
```

Here's your basic setup:

```javascript
// logger.js
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined, // raw JSON in production — log aggregators love it
});

export default logger;
```

In development, `pino-pretty` gives you readable, colorized output. In production, you get raw JSON that every log aggregation tool can parse without crying. One config, two behaviors. Chef's kiss.

Now instead of `console.log('Server started')`, you do:

```javascript
logger.info({ port: 3000, env: process.env.NODE_ENV }, 'Server started');
```

Output in dev: pretty colored text. Output in prod: `{"level":"info","port":3000,"env":"production","msg":"Server started","time":1712620800000}`. Your future oncall self will send you a thank-you card.

## Wiring It Into Express with Request Context

Here's where structured logging gets **really** powerful. Every request gets a unique ID, and every log line from that request automatically includes it. When a user complains "something went wrong at 3pm," you can pull all logs for their request in one query.

```javascript
// app.js
import express from 'express';
import { randomUUID } from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import logger from './logger.js';

const app = express();

// Attach request logger middleware
app.use(pinoHttp({
  logger,
  genReqId: () => randomUUID(), // every request gets a unique ID
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} completed`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} failed: ${err.message}`,
}));

app.get('/users/:id', async (req, res) => {
  // req.log is a child logger pre-bound with requestId
  req.log.info({ userId: req.params.id }, 'Fetching user');

  try {
    const user = await getUserById(req.params.id);
    req.log.info({ userId: req.params.id, found: !!user }, 'User fetch complete');
    res.json(user);
  } catch (err) {
    req.log.error({ userId: req.params.id, err }, 'User fetch failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

Every log line from this request automatically gets `requestId`, `method`, `url`, response time, and status code. You can trace an entire user journey through your system with a single query: `requestId = "abc-123"`. That's the difference between debugging in 5 minutes vs. 5 hours.

## The Three Rules of Good Logging

**1. Log events, not states.** "Payment processed" is good. "Payment is processing" repeated 50 times is noise. Log things that *happened*, at the moment they happen.

**2. Include context, not concatenated strings.** Never do `logger.info('User ' + userId + ' did thing')`. Always do `logger.info({ userId }, 'User did thing')`. Concatenated strings can't be searched by field. JSON fields can.

**3. Choose your levels intentionally.**
- `debug` — Temporary, verbose info for development. Should be off in production by default.
- `info` — Normal operations worth recording. Request completed, job processed.
- `warn` — Something unexpected but recoverable. Invalid input, missing optional config.
- `error` — Something broke and needs attention. Always include the error object: `logger.error({ err }, 'message')` — Pino will serialize the stack trace properly.

## A Quick Note on What NOT to Log

Don't log passwords. Don't log full credit card numbers. Don't log auth tokens. This sounds obvious until 2 AM when you're adding debug logging and accidentally ship `logger.debug({ body: req.body })` to production with a login endpoint. Add a log scrubber or use Pino's built-in `redact` option:

```javascript
const logger = pino({
  redact: ['req.headers.authorization', 'req.body.password', 'user.ssn'],
});
```

Those fields get replaced with `[Redacted]` automatically. Security team stays happy. You stay employed.

## The Payoff

Once you have structured logs flowing into a real aggregator, you can build dashboards, set up alerts ("notify me if error rate on `/api/payments` exceeds 1% in any 5-minute window"), and do post-incident analysis with actual data. Debugging goes from "let me add some console.logs and redeploy" to "let me filter logs from 3:40-3:45pm for userId 42 and see exactly what happened."

That's the difference between flying blind and having instruments.

---

Your `console.log()` era is over. Swap it for Pino this week — it's a one-afternoon change that pays dividends every time something breaks in production. And it will break. It always breaks.

**What's your current logging setup?** Are you still in the `console.log` wilderness, or have you already seen the structured logging light? Drop a comment or reach out — I'm curious what log aggregation tools people are actually using in 2026.
