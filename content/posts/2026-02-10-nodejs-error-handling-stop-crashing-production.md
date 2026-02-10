---
title: "Node.js Error Handling: Stop Crashing in Production 💥"
date: "2026-02-10"
excerpt: "Think try/catch is enough for Node.js error handling? Cool! Now explain why your server randomly crashes with 'unhandled promise rejection.' Let's dive into the error handling patterns that actually keep your API alive in production!"
tags: ["nodejs", "javascript", "backend", "error-handling"]
featured: true
---

# Node.js Error Handling: Stop Crashing in Production 💥

**Real confession:** The first Node.js API I deployed at Acodez stayed up for exactly 4 hours before mysteriously crashing. No logs. No errors. Just... gone. Like it never existed. Turns out? An unhandled promise rejection silently killed the entire server. Users got 502s. Boss got angry. I got a crash course in Node.js error handling! 😱

When I was building APIs in Node.js, I thought "just add try/catch everywhere" was the answer. Coming from Laravel where exceptions bubble up nicely and PHP-FPM isolates crashes to single requests, Node.js taught me a painful lesson: **One uncaught error can kill your ENTIRE server for ALL users!**

Let me save you from the 3 AM "why is production down?!" panic attacks I had!

## The Single-Threaded Problem 🎯

**Here's why error handling is CRITICAL in Node.js:**

```javascript
// Your beautiful Express API
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json(user);
});

// Looks innocent, right? WRONG!
// If User.findById() throws, and you don't catch it...
// ENTIRE SERVER CRASHES! 💥
```

**What happens in production:**

```bash
# User 1 requests invalid user ID
GET /api/user/invalid-id

# Database throws error
# Error not caught
# Process exits
# Server goes down
# ALL users disconnected (not just User 1!)
# Your phone explodes with alerts
# You learn about Node.js error handling at 2 AM
```

**Coming from Laravel/PHP:** In PHP-FPM, one request crashes? No problem - that process dies, others keep serving. In Node.js? **One error = everyone suffers!** Welcome to single-threaded hell! 🔥

## Types of Errors in Node.js 📚

### 1. Synchronous Errors (Easy to Catch)

```javascript
// These are the nice ones - try/catch works!
app.get('/api/divide', (req, res) => {
    try {
        const result = 10 / 0;  // Returns Infinity
        const obj = null;
        console.log(obj.property);  // BOOM! TypeError
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

**Why it works:** Error happens immediately, try/catch catches it. Simple!

### 2. Async Errors with Callbacks (The Old Nightmare)

```javascript
// The classic callback error pattern
app.get('/api/file', (req, res) => {
    fs.readFile('data.json', (err, data) => {
        // ALWAYS check err first!
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(JSON.parse(data));
    });
});

// Forget to check err? Server crashes!
fs.readFile('data.json', (err, data) => {
    res.json(JSON.parse(data));  // If err exists, data is undefined!
    // JSON.parse(undefined) throws -> Unhandled error -> Crash!
});
```

**Pro tip:** ALWAYS check the error parameter first in callbacks. No shortcuts!

### 3. Promise Rejections (The Silent Killers)

```javascript
// DANGEROUS: Unhandled promise rejection
app.get('/api/user/:id', (req, res) => {
    User.findById(req.params.id)
        .then(user => res.json(user));
        // No .catch()! If promise rejects, unhandled rejection!
});

// What Node.js does (v15+):
// 1. Prints: "UnhandledPromiseRejectionWarning"
// 2. Crashes the process (--unhandled-rejections=strict mode)
// 3. Your server goes down
// 4. You cry
```

**The fix - ALWAYS add .catch():**

```javascript
// GOOD: Catch promise rejections
app.get('/api/user/:id', (req, res) => {
    User.findById(req.params.id)
        .then(user => res.json(user))
        .catch(error => {
            console.error('Database error:', error);
            res.status(500).json({ error: 'Failed to fetch user' });
        });
});
```

### 4. Async/Await Errors (The Modern Way)

```javascript
// WRONG: No try/catch
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json(user);
    // If findById throws, unhandled promise rejection!
});

// RIGHT: Wrap in try/catch
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: error.message });
    }
});
```

**Why I love async/await:** Try/catch works like synchronous code! Easier to read than promise chains!

## The Production-Ready Error Handling Pattern 🛠️

**Here's my battle-tested setup from Acodez:**

### 1. Async Handler Wrapper (DRY Error Handling)

```javascript
// utils/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next))
        .catch(next);  // Pass errors to Express error handler
};

module.exports = asyncHandler;
```

**Using it:**

```javascript
const asyncHandler = require('./utils/asyncHandler');

// Before: Try/catch in every route
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.findAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// After: Clean and DRY!
app.get('/api/users', asyncHandler(async (req, res) => {
    const users = await User.findAll();
    res.json(users);
    // Errors automatically caught and passed to error handler!
}));
```

**Real impact:** Went from 50+ try/catch blocks to ONE error handler. Code readability improved 10x!

### 2. Custom Error Classes (Know Your Errors)

```javascript
// errors/AppError.js
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;  // Expected errors (vs programmer bugs)
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
    }
}

class NotFoundError extends AppError {
    constructor(message) {
        super(message, 404);
    }
}

class UnauthorizedError extends AppError {
    constructor(message) {
        super(message, 401);
    }
}

module.exports = { AppError, ValidationError, NotFoundError, UnauthorizedError };
```

**Using custom errors:**

```javascript
const { NotFoundError, ValidationError } = require('./errors/AppError');

app.get('/api/user/:id', asyncHandler(async (req, res) => {
    if (!req.params.id.match(/^[0-9]+$/)) {
        throw new ValidationError('Invalid user ID format');
    }

    const user = await User.findById(req.params.id);

    if (!user) {
        throw new NotFoundError(`User ${req.params.id} not found`);
    }

    res.json(user);
}));
```

**Why it's better:** Errors have context! Status codes! Stacktraces! Error handler knows what to do!

### 3. Centralized Error Handler Middleware

```javascript
// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    // Log the error
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    });

    // Operational errors (expected) - send to client
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            error: err.message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    }

    // Programming errors (unexpected) - log but hide details
    if (process.env.NODE_ENV === 'production') {
        // Send to error tracking service (Sentry, Rollbar, etc.)
        // Sentry.captureException(err);

        return res.status(500).json({
            error: 'Something went wrong! Our team has been notified.'
        });
    }

    // Development - show everything!
    res.status(500).json({
        error: err.message,
        stack: err.stack
    });
};

module.exports = errorHandler;
```

**Hooking it up (MUST be LAST middleware!):**

```javascript
const express = require('express');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Body parsers, auth, etc.
app.use(express.json());
app.use(authMiddleware);

// Routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler (LAST!)
app.use(errorHandler);
```

**CRITICAL:** Error handler MUST have 4 parameters `(err, req, res, next)` or Express won't recognize it!

### 4. Process-Level Error Catchers (Last Resort)

```javascript
// server.js - At the TOP of your file!
process.on('uncaughtException', (error) => {
    console.error('💀 UNCAUGHT EXCEPTION! Shutting down...');
    console.error(error.name, error.message);
    console.error(error.stack);

    // Send to monitoring (Sentry, etc.)
    // Sentry.captureException(error);

    process.exit(1);  // Exit immediately!
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💀 UNHANDLED REJECTION! Shutting down...');
    console.error('Promise:', promise);
    console.error('Reason:', reason);

    // Send to monitoring
    // Sentry.captureException(reason);

    // Close server gracefully, then exit
    server.close(() => {
        process.exit(1);
    });
});

// Start your server
const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

**Why exit on uncaught errors?** The process is in an unknown state. Better to restart clean than run corrupted!

**Pro tip:** Use a process manager (PM2, systemd) to auto-restart crashed processes!

## Common Error Handling Mistakes (I Made All of These) 🙈

### Mistake #1: Swallowing Errors Silently

```javascript
// TERRIBLE: Silent failure
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);
    } catch (error) {
        // Caught but not logged! Debugging nightmare!
        res.status(500).json({ error: 'Something went wrong' });
    }
});

// GOOD: Log everything!
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);
    } catch (error) {
        console.error('Failed to fetch user:', {
            userId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
```

**How I discovered this at Acodez:** Users reported errors. I checked logs. Nothing. Why? I wasn't logging caught errors! Spent 3 hours debugging blind. ALWAYS LOG ERRORS!

### Mistake #2: Exposing Internal Error Details

```javascript
// DANGEROUS: Leaking implementation details!
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findByEmail(req.body.email);
        // ... auth logic
    } catch (error) {
        // Sends database connection string to client!
        res.status(500).json({ error: error.message });
        // "Connection refused at mysql://user:password@db.internal:3306"
    }
});

// SAFE: Generic message for client, detailed log server-side
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findByEmail(req.body.email);
        // ... auth logic
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed. Please try again.'
        });
    }
});
```

**Golden rule:** Detailed logs server-side, generic messages client-side (in production)!

### Mistake #3: Not Validating Input Before Processing

```javascript
// BAD: Process first, error later
app.post('/api/user', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.json(user);
    } catch (error) {
        // Database throws validation errors -> ugly error messages
        res.status(500).json({ error: error.message });
    }
});

// GOOD: Validate early, fail fast!
const { body, validationResult } = require('express-validator');

app.post('/api/user', [
    body('email').isEmail().normalizeEmail(),
    body('name').trim().isLength({ min: 2, max: 50 }),
    body('age').isInt({ min: 0, max: 120 })
], async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }

    try {
        const user = await User.create(req.body);
        res.json(user);
    } catch (error) {
        console.error('Failed to create user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});
```

**A pattern I use:** Validate at the door. Don't let bad data reach your business logic!

### Mistake #4: Sending Response After Response

```javascript
// CRASHES YOUR SERVER!
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);

        // Do some logging...
        await logActivity(req.params.id);

    } catch (error) {
        // ERROR: Can't set headers after response sent!
        res.status(500).json({ error: error.message });
        // Server crashes!
    }
});

// FIX: Return early or check if response sent
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);

        await logActivity(req.params.id);

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            console.error('Error after response sent:', error);
        }
    }
});
```

**Pro tip:** Use `return` when sending responses to prevent code continuing!

```javascript
// BETTER: Return immediately
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        return res.json(user);  // Return here!

        // Code below never runs
        await logActivity(req.params.id);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
```

## Advanced Error Handling Patterns 🎯

### Pattern #1: Circuit Breaker (Fail Fast on External Services)

```javascript
const CircuitBreaker = require('opossum');

// Wrap external API calls
const options = {
    timeout: 3000,          // 3 second timeout
    errorThresholdPercentage: 50,  // Open circuit at 50% errors
    resetTimeout: 30000     // Try again after 30 seconds
};

const breaker = new CircuitBreaker(externalAPI, options);

breaker.fallback(() => {
    return { error: 'Service temporarily unavailable' };
});

app.get('/api/external', async (req, res) => {
    try {
        const data = await breaker.fire();
        res.json(data);
    } catch (error) {
        // Circuit open - don't waste time trying
        res.status(503).json({
            error: 'External service unavailable'
        });
    }
});
```

**Why it's brilliant:** Stop wasting time on failing services. Fail fast, recover faster!

### Pattern #2: Retry with Exponential Backoff

```javascript
async function withRetry(fn, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;  // Give up
            }

            const delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s
            console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

app.get('/api/flaky-service', async (req, res) => {
    try {
        const data = await withRetry(() => flakyExternalAPI());
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Service unavailable after retries' });
    }
});
```

**Real impact:** Turned a 10% failure rate into 0.1% by auto-retrying transient errors!

### Pattern #3: Error Aggregation (Track Trends)

```javascript
// Simple in-memory error tracking
const errorStats = new Map();

function trackError(error) {
    const key = `${error.name}:${error.message}`;
    const count = errorStats.get(key) || 0;
    errorStats.set(key, count + 1);
}

// In your error handler
const errorHandler = (err, req, res, next) => {
    trackError(err);

    // Alert if same error happens 100 times in short period
    const count = errorStats.get(`${err.name}:${err.message}`);
    if (count > 100) {
        console.error(`🚨 ERROR SPIKE! ${err.message} occurred ${count} times!`);
        // Send alert to Slack, PagerDuty, etc.
    }

    // ... rest of error handling
};
```

**Why it matters:** Catch cascading failures before they take down your server!

## Error Monitoring in Production 📊

**Don't fly blind! Use error tracking services:**

### Option 1: Sentry (My favorite!)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1  // 10% of transactions
});

// Sentry request handler MUST be first middleware!
app.use(Sentry.Handlers.requestHandler());

// Your routes here...

// Sentry error handler BEFORE your error handler
app.use(Sentry.Handlers.errorHandler());

// Your error handler
app.use(errorHandler);
```

**What you get:**
- Real-time error alerts
- Stack traces with source maps
- User context (who got the error)
- Error trends and aggregation
- Release tracking

### Option 2: LogRocket (Error + Session Replay!)

```javascript
const LogRocket = require('logrocket');

LogRocket.init(process.env.LOGROCKET_ID);

app.use((req, res, next) => {
    LogRocket.track('API Request', {
        path: req.path,
        method: req.method,
        userId: req.user?.id
    });
    next();
});
```

**Bonus:** When an error happens, you can watch a video replay of what the user did! Mind-blowing for debugging! 🤯

## Quick Wins (Do These Today!) 🏃‍♂️

1. **Add process-level error handlers** - Catch unhandled rejections before they crash you
2. **Create asyncHandler wrapper** - DRY up your route error handling
3. **Add centralized error handler** - One place to log/format all errors
4. **Set up Sentry** - Know when errors happen, not when users complain
5. **Validate inputs** - Fail fast on bad data

## Your Error Handling Checklist ✅

Before you deploy:

- [ ] All async routes wrapped in try/catch or asyncHandler
- [ ] Centralized error handler middleware (last in chain!)
- [ ] Process-level handlers for uncaught errors
- [ ] Custom error classes with status codes
- [ ] Validation at route entry points
- [ ] Error logging (console + monitoring service)
- [ ] Generic errors to clients, detailed logs server-side
- [ ] No exposed internal details in production
- [ ] PM2 or systemd for auto-restart on crash
- [ ] Error monitoring service configured (Sentry, etc.)

## The Bottom Line

**Error handling isn't optional in Node.js - it's survival!** One unhandled error can crash your ENTIRE server!

**The essentials:**
1. **Wrap ALL async code** in try/catch or use asyncHandler
2. **Centralized error handler** for consistent formatting
3. **Process-level handlers** as last resort (uncaught exceptions)
4. **Custom error classes** for context and status codes
5. **Monitor everything** with Sentry or similar

**When I was building Node.js APIs at Acodez**, proper error handling was the difference between "works on my machine" and "stays up in production." Coming from Laravel where errors are isolated per request, Node.js taught me: **In a single-threaded world, every error is potentially fatal!** 🚀

Think of error handling as **wearing a parachute** - you hope you never need it, but when you do, you're REALLY glad it's there! Your users won't notice good error handling (that's the point), but they'll definitely notice when your server crashes! 💥

---

**Got error handling horror stories?** Share them on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - production crashes make the best war stories!

**Want to see my Node.js projects?** Check out my [GitHub](https://github.com/kpanuragh) - all properly error-handled, I promise! 😉

*P.S. - If you're not handling promise rejections in production, go add those handlers RIGHT NOW. Your server's life depends on it!* 💥✨
