---
title: "Node.js Error Handling: Stop Crashing in Production 💥"
date: "2026-02-07"
excerpt: "Think console.log() is logging? Think try/catch fixes everything? Cool! Now explain why your Node.js server silently crashes at 3 AM with zero logs. Let's dive into error handling and logging that actually works in production!"
tags: ["nodejs", "javascript", "backend", "errors", "debugging"]
featured: true
---

# Node.js Error Handling: Stop Crashing in Production 💥

**Real confession:** The first time my Node.js API crashed in production at Acodez, I had NO IDEA why. Zero logs. Zero errors. Just... silence. Then the server restarted. Then it crashed again. The error? Buried in an unhandled promise rejection that I didn't even know existed! 😱

When I was building Node.js APIs, I thought "errors? Just wrap everything in try/catch!" Coming from Laravel where exceptions bubble up nicely and you get detailed error pages, Node.js taught me a brutal lesson: **Silent failures are the default. Proper error handling is 100% on YOU!**

Let me save you from the 3 AM debugging sessions where you have ZERO clues why your server died!

## The Problem: Node.js Fails Silently 🔇

**Here's what kills Node.js apps in production:**

```javascript
// Looks innocent, right?
app.get('/api/users/:id', async (req, res) => {
    const user = await db.getUser(req.params.id);
    res.json(user);
});

// What actually happens when db.getUser() fails:
// 1. Promise rejects
// 2. No try/catch to handle it
// 3. Unhandled promise rejection
// 4. Node.js logs a cryptic warning
// 5. In Node 15+: YOUR ENTIRE PROCESS EXITS
// 6. Server crashes
// 7. Users see 502 Bad Gateway
// 8. You wake up to angry Slack messages
```

**The brutal truth:** In PHP/Laravel, uncaught exceptions show error pages. In Node.js, they silently kill your process! 💀

## Error Types in Node.js (Know Thy Enemy) 🎯

### Type #1: Synchronous Errors (Easy Mode)

```javascript
// try/catch works great here!
app.get('/api/data', (req, res) => {
    try {
        const data = JSON.parse(req.body.data);
        res.json(data);
    } catch (error) {
        // Caught! ✅
        res.status(400).json({ error: 'Invalid JSON' });
    }
});
```

**Easy!** Standard try/catch works for synchronous code.

### Type #2: Async Errors (Medium Mode)

```javascript
// try/catch works with async/await too!
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await db.getUser(req.params.id);
        res.json(user);
    } catch (error) {
        // Caught! ✅
        res.status(500).json({ error: 'Database error' });
    }
});
```

**Still manageable!** Async/await plays nicely with try/catch.

### Type #3: Unhandled Promise Rejections (DANGER ZONE)

```javascript
// THIS WILL CRASH YOUR SERVER!
app.get('/api/data', (req, res) => {
    // Promise chain without .catch()
    fetchDataFromAPI()
        .then(data => {
            throw new Error('Oops!');  // Uncaught!
        })
        .then(data => res.json(data));
    // No .catch()! Process will crash! 💥
});

// ALSO CRASHES:
Promise.reject(new Error('Boom!'));
// No .catch() anywhere? Node.js exits!
```

**The nightmare:** Forgot one `.catch()`? Server dies in production!

### Type #4: Callback Errors (Legacy Hell)

```javascript
// Old-school Node.js - errors are FIRST parameter!
fs.readFile('data.json', (err, data) => {
    if (err) {
        // Handle it! Otherwise, silent failure!
        console.error(err);
        return;
    }
    processData(data);
});

// If you forget to check err:
fs.readFile('data.json', (err, data) => {
    // BOOM! data is undefined, code crashes later!
    processData(data);  // Silent failure incoming!
});
```

**Pro tip:** Always use promises version of Node.js APIs! `require('fs').promises`

## The Global Safety Net 🛡️

**This saved my job multiple times:**

```javascript
// server.js - PUT THIS AT THE TOP!

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Log to your monitoring service (Sentry, Datadog, etc.)
    logger.error('Unhandled Promise Rejection:', {
        reason,
        promise,
        stack: reason?.stack
    });

    // In production: graceful shutdown
    // Don't just exit - let current requests finish!
    server.close(() => {
        process.exit(1);
    });
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
    });

    // Uncaught exceptions are dangerous - restart!
    process.exit(1);
});

// Handle SIGTERM gracefully (Docker, Kubernetes)
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
```

**Translation:** Last line of defense before your process dies. LOG EVERYTHING!

**Laravel comparison:** Laravel has a global exception handler. Node.js? You build it yourself!

## Express Error Handling (The Right Way) 🎯

### The Global Error Handler Middleware

```javascript
// routes/users.js
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const user = await db.getUser(req.params.id);
        if (!user) {
            // Pass error to error handler!
            return next(new Error('User not found'));
        }
        res.json(user);
    } catch (error) {
        // Pass ALL errors to next()!
        next(error);
    }
});

// app.js - Put this AFTER all routes!
// Error handling middleware (4 parameters!)
app.use((err, req, res, next) => {
    // Log the full error
    logger.error('API Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    });

    // Don't leak error details to clients!
    const isDev = process.env.NODE_ENV === 'development';

    res.status(err.status || 500).json({
        error: isDev ? err.message : 'Internal server error',
        ...(isDev && { stack: err.stack })
    });
});

// 404 handler (no route matched)
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
```

**The secret:** Error middleware must have **4 parameters** (err, req, res, next) or Express won't recognize it!

### Custom Error Classes (Like Laravel Exceptions!)

```javascript
// errors/AppError.js
class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
        this.isOperational = true;  // vs programming errors
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found`, 404);
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

module.exports = { AppError, NotFoundError, ValidationError, UnauthorizedError };

// Usage in routes:
const { NotFoundError, ValidationError } = require('./errors/AppError');

app.get('/api/users/:id', async (req, res, next) => {
    try {
        if (!req.params.id) {
            throw new ValidationError('User ID is required');
        }

        const user = await db.getUser(req.params.id);
        if (!user) {
            throw new NotFoundError('User');
        }

        res.json(user);
    } catch (error) {
        next(error);
    }
});

// Error handler automatically uses the status!
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message
    });
});
```

**Why I love this:** Feels like throwing Laravel exceptions! `throw new NotFoundError('User')` 🎉

## Async Error Wrapper (DRY Your Code) 🌯

**Stop writing try/catch in every route:**

```javascript
// utils/asyncHandler.js
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = asyncHandler;

// Now your routes are CLEAN:
const asyncHandler = require('./utils/asyncHandler');

app.get('/api/users/:id', asyncHandler(async (req, res) => {
    const user = await db.getUser(req.params.id);
    if (!user) {
        throw new NotFoundError('User');
    }
    res.json(user);
    // No try/catch needed! Errors auto-forwarded to error handler!
}));

app.post('/api/users', asyncHandler(async (req, res) => {
    const user = await db.createUser(req.body);
    res.status(201).json(user);
    // So clean! 😍
}));
```

**Pattern I use everywhere:** Wrap ALL async routes. Never write try/catch again!

## Logging: console.log() Is Not Enough 📝

### The console.log() Trap

```javascript
// NEVER DO THIS IN PRODUCTION!
app.get('/api/users', async (req, res) => {
    console.log('Getting users');  // Goes to stdout, gets lost!
    const users = await db.getUsers();
    console.log('Found users:', users.length);  // No structure, no searching!
    res.json(users);
});

// Problems with console.log():
// ❌ No log levels (info vs error vs warn)
// ❌ No structured data (can't search/filter)
// ❌ No timestamps (when did this happen?)
// ❌ No context (which user? which request?)
// ❌ Gets lost in Docker/Kubernetes logs
// ❌ Can't send to monitoring services
```

### Proper Logging with Winston

```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()  // Structured logging!
    ),
    defaultMeta: { service: 'api-server' },
    transports: [
        // Write all logs to console (Docker/K8s captures this)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Write errors to file
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        // Write all logs to file
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ]
});

module.exports = logger;

// Usage:
const logger = require('./logger');

app.get('/api/users/:id', async (req, res) => {
    logger.info('Fetching user', {
        userId: req.params.id,
        ip: req.ip,
        method: req.method,
        url: req.url
    });

    try {
        const user = await db.getUser(req.params.id);
        logger.info('User fetched successfully', { userId: user.id });
        res.json(user);
    } catch (error) {
        logger.error('Failed to fetch user', {
            userId: req.params.id,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
```

**Why structured logging rocks:**
- Search by userId, IP, error type
- Filter by log level
- Send to Elasticsearch, Datadog, Splunk
- Actually debug production issues!

### Request Logging Middleware

```javascript
// middleware/requestLogger.js
const logger = require('../logger');

const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log when request finishes
    res.on('finish', () => {
        const duration = Date.now() - start;

        logger.info('Request completed', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            userId: req.user?.id
        });

        // Warn on slow requests
        if (duration > 1000) {
            logger.warn('Slow request detected', {
                method: req.method,
                url: req.url,
                duration: `${duration}ms`
            });
        }
    });

    next();
};

module.exports = requestLogger;

// app.js
app.use(requestLogger);
```

**Auto-logs every request!** See which endpoints are slow, which users have issues, etc.

## Production Monitoring (Sleep Better At Night) 🌙

### Option #1: Sentry (My Favorite)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0
});

// Sentry request handler (BEFORE routes)
app.use(Sentry.Handlers.requestHandler());

// Your routes here...

// Sentry error handler (BEFORE your error handler)
app.use(Sentry.Handlers.errorHandler());

// Your error handler
app.use((err, req, res, next) => {
    // Sentry already captured it!
    logger.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
```

**What you get:**
- Instant Slack/email alerts when errors happen
- Full stack traces with context
- See which users are affected
- Track error frequency
- Source map support

**Real impact:** Catch errors BEFORE users complain!

### Option #2: Custom Health Checks

```javascript
// routes/health.js
app.get('/health', async (req, res) => {
    const health = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        status: 'ok'
    };

    try {
        // Check database
        await db.query('SELECT 1');
        health.database = 'connected';
    } catch (error) {
        health.database = 'disconnected';
        health.status = 'error';
    }

    try {
        // Check Redis
        await redis.ping();
        health.redis = 'connected';
    } catch (error) {
        health.redis = 'disconnected';
        health.status = 'error';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
});

// Kubernetes/Docker uses this for liveness checks!
```

## Common Error Handling Mistakes 🙈

### Mistake #1: Swallowing Errors

```javascript
// BAD: Error disappears into the void!
try {
    await sendEmail(user.email, 'Welcome!');
} catch (error) {
    // Silent failure! You'll never know emails aren't sending!
}

// GOOD: Log it at minimum!
try {
    await sendEmail(user.email, 'Welcome!');
} catch (error) {
    logger.error('Failed to send welcome email', {
        userId: user.id,
        email: user.email,
        error: error.message
    });
    // Maybe retry? Maybe alert someone?
}
```

### Mistake #2: Exposing Sensitive Error Details

```javascript
// BAD: Leaking database structure to attackers!
app.use((err, req, res, next) => {
    res.status(500).json({
        error: err.message,  // "duplicate key value violates unique constraint users_email_key"
        stack: err.stack     // Full file paths, code structure!
    });
});

// GOOD: Generic message for clients, detailed logs for you!
app.use((err, req, res, next) => {
    logger.error('Error:', err);

    const isDev = process.env.NODE_ENV === 'development';
    res.status(err.status || 500).json({
        error: isDev ? err.message : 'Internal server error'
    });
});
```

### Mistake #3: Not Handling Async Middleware

```javascript
// BAD: If checkAuth() throws, it's unhandled!
app.get('/api/users', checkAuth, async (req, res) => {
    const users = await db.getUsers();
    res.json(users);
});

async function checkAuth(req, res, next) {
    const token = req.headers.authorization;
    const user = await verifyToken(token);  // Can throw!
    req.user = user;
    next();
}

// GOOD: Wrap middleware too!
const asyncHandler = require('./utils/asyncHandler');

const checkAuth = asyncHandler(async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        throw new UnauthorizedError('No token provided');
    }
    const user = await verifyToken(token);
    req.user = user;
    next();
});
```

## Your Production Error Checklist ✅

Before you deploy:

- [ ] Global `unhandledRejection` and `uncaughtException` handlers
- [ ] Error handling middleware in Express (4 parameters!)
- [ ] All async routes wrapped with asyncHandler or try/catch
- [ ] Custom error classes for different error types
- [ ] Proper logging with Winston (not console.log!)
- [ ] Request logging middleware
- [ ] Sentry or similar monitoring tool
- [ ] Health check endpoint
- [ ] No sensitive data in error responses
- [ ] Graceful shutdown on SIGTERM

## Quick Wins (Do These Today!) 🏃‍♂️

1. **Add global error handlers** - 5 minutes, saves hours of debugging
2. **Replace console.log with Winston** - Structured logging changes everything
3. **Add Sentry** - Free tier catches production errors
4. **Wrap async routes** - asyncHandler eliminates try/catch boilerplate
5. **Create custom error classes** - Clean, semantic error handling

## The Bottom Line

Error handling in Node.js is NOT automatic like in Laravel. Silent failures are the default. Proper error handling and logging? That's on YOU!

**The essentials:**
1. **Global error handlers** - Last line of defense
2. **Express error middleware** - Centralize error handling
3. **Proper logging** - Winston > console.log
4. **Monitoring tools** - Sentry catches what you miss
5. **Never swallow errors** - Log everything, fix later

Coming from Laravel where exceptions are handled gracefully out of the box, Node.js feels brutal. But once you set up proper error handling? You sleep better knowing your logs will tell you EXACTLY what went wrong at 3 AM! 💤

---

**Got error handling war stories?** Share them on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - we've all been there!

**Want to see my Node.js error handling patterns?** Check out my [GitHub](https://github.com/kpanuragh) - properly logged and monitored! 😉

*P.S. - If you're using console.log() in production right now, go install Winston. Your future self will thank you when debugging production issues!* 💥✨
