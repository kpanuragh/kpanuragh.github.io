---
title: "Node.js Error Handling: Stop Crashing Your Production Server 💥"
date: "2026-02-14"
excerpt: "Think try/catch is enough for error handling? Cool! Now explain why your Node.js server randomly crashes with 'unhandled promise rejection'. Let's dive into error handling patterns that actually work in production - from custom error classes to monitoring!"
tags: ["nodejs", "javascript", "backend", "best-practices"]
featured: true
---

# Node.js Error Handling: Stop Crashing Your Production Server 💥

**Confession time:** My first Node.js API crashed FIVE TIMES in the first week of production. The reason? A single database query that failed threw an error that wasn't caught anywhere. Result? "Unhandled promise rejection. Server will shut down." Users disconnected. Boss furious. Me? Updating LinkedIn. 😱

When I was building Node.js APIs at Acodez, I thought error handling was simple: "Just add try/catch blocks everywhere!" WRONG. Node.js error handling is a minefield of async edge cases, unhandled rejections, and silent failures that WILL bite you in production!

Coming from Laravel where exceptions bubble up nicely and get caught by the global handler, Node.js taught me some brutal lessons about async error handling. Let me save you from the 3 AM crashes I suffered through!

## What Even Is Error Handling in Node.js? 🤔

**Error handling** = Making sure your app doesn't crash when things go wrong (and they WILL go wrong!).

Think of it like driving a car:
- **No error handling:** Hit a pothole → Car explodes! 💥
- **Bad error handling:** Hit a pothole → Ignore it → Car breaks down later
- **Good error handling:** Hit a pothole → Suspension absorbs it → Log it → Keep driving smoothly

**The Node.js challenge:** You have synchronous errors, callback errors, Promise rejections, event emitter errors, and stream errors. Miss ONE type? Your server crashes! 🚨

## The Production Disaster (How I Learned) 💀

**My "brilliant" user registration endpoint at Acodez:**

```javascript
// DON'T DO THIS!
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    // Create user
    const user = await User.create({ email, password });

    // Send welcome email
    await sendWelcomeEmail(user.email);

    res.json({ success: true, user });
});
```

**What happened in production:**

```bash
# User registers with valid email
POST /api/register
✅ User created successfully
✅ Email sent
✅ Response: 200 OK

# User registers with invalid email
POST /api/register
✅ User created successfully
❌ sendWelcomeEmail() throws: "Invalid email address"
💥 Unhandled promise rejection!
💥 Node.js: "Shutting down in 10 seconds..."
💥 ALL USERS DISCONNECTED!
🔥 Production down!
📞 Boss calls at 2 AM!
```

**Why it crashed:**

1. `sendWelcomeEmail()` threw an error
2. No try/catch block to catch it
3. Async function = Promise rejection
4. Unhandled rejection = Node.js terminates process
5. Server dies. Everyone sad.

**The fix (basic version):**

```javascript
// Better, but still not great
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.create({ email, password });
        await sendWelcomeEmail(user.email);

        res.json({ success: true, user });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
```

**Better... but we'll make it MUCH better below!** 🚀

## Error Handling Mistake #1: Not Catching Async Errors 🎣

**The nightmare that crashes your server:**

```javascript
// BAD: Async error not caught!
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findById(req.params.id);
    // If findById() throws, entire server crashes!
    res.json(user);
});
```

**What happens when database is down:**

```bash
# Request comes in
GET /api/user/123

# Database connection fails
Error: Connection refused

# No try/catch = Unhandled rejection
# Node.js: "Fatal error, shutting down!"
# Your entire API: DEAD 💀
```

**The manual fix (tedious):**

```javascript
// Wrapping EVERY async route in try/catch
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Problem: You have 50 routes? That's 50 try/catch blocks!
```

**The smart fix - Async wrapper:**

```javascript
// utils/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
```

**Now use it everywhere:**

```javascript
const asyncHandler = require('./utils/asyncHandler');

// Clean! No try/catch needed!
app.get('/api/user/:id', asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json(user);
}));

// Errors automatically passed to error handler! 🎉
```

**Even better - Use express-async-errors:**

```javascript
// At the top of your app.js
require('express-async-errors');

// Now ALL async errors are caught automatically!
app.get('/api/user/:id', async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json(user);
    // Errors automatically handled! Magic! ✨
});
```

**A pattern I use in all my Node.js projects:**

```javascript
// app.js
require('express-async-errors'); // Must be early!
const express = require('express');
const app = express();

// Your routes...
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Global error handler (catches everything!)
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.statusCode || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});
```

**Result:** Haven't had an unhandled rejection crash since! 🎯

## Error Handling Mistake #2: Using Generic Error Messages 📝

**The unhelpful approach:**

```javascript
// BAD: All errors look the same!
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) throw new Error('Error'); // 🤦
        if (!user.verifyPassword(password)) throw new Error('Error'); // 🤦

        res.json({ token: generateToken(user) });
    } catch (error) {
        res.status(500).json({ error: 'Error' }); // So helpful! 😒
    }
});
```

**The user experience:**

```
User: *enters wrong email*
API: "Error"
User: "What error?"

User: *enters wrong password*
API: "Error"
User: "WHAT ERROR?!"

User: *database is down*
API: "Error"
User: *rage quits*
```

**The professional fix - Custom error classes:**

```javascript
// utils/errors.js
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // We threw this intentionally
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

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

module.exports = {
    AppError,
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError
};
```

**Now use them properly:**

```javascript
const { NotFoundError, UnauthorizedError, ValidationError } = require('./utils/errors');

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ValidationError('Email and password required');
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw new NotFoundError('User');
    }

    if (!user.verifyPassword(password)) {
        throw new UnauthorizedError('Invalid password');
    }

    res.json({ token: generateToken(user) });
});
```

**The global error handler knows what to do:**

```javascript
app.use((err, req, res, next) => {
    // Operational errors (we threw them intentionally)
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            error: err.message
        });
    }

    // Programming errors (bugs!) - don't leak details
    console.error('FATAL ERROR:', err);
    res.status(500).json({
        error: 'Something went wrong'
    });
});
```

**Coming from Laravel:** This is like Laravel's custom exceptions (`ModelNotFoundException`, `ValidationException`, etc.). Same concept, different syntax! 🎯

## Error Handling Mistake #3: Not Logging Errors Properly 📊

**The debugging nightmare:**

```javascript
// BAD: No context!
app.get('/api/data', async (req, res) => {
    try {
        const data = await fetchData();
        res.json(data);
    } catch (error) {
        console.log('Error'); // Useless!
        res.status(500).json({ error: 'Failed' });
    }
});
```

**When it crashes in production:**

```bash
# Your logs:
"Error"
"Error"
"Error"

# You: "WHICH ERROR? WHEN? WHERE? WHO?!"
# Logs: *unhelpful silence*
```

**The proper logging approach:**

```javascript
// Good: Structured logging with context
const logger = require('./utils/logger'); // Winston, Pino, etc.

app.get('/api/data', async (req, res) => {
    try {
        const data = await fetchData();
        res.json(data);
    } catch (error) {
        logger.error('Failed to fetch data', {
            error: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            userId: req.user?.id,
            timestamp: new Date().toISOString(),
            headers: req.headers,
            params: req.params,
            query: req.query
        });

        res.status(500).json({ error: 'Failed to fetch data' });
    }
});
```

**A logging setup I use in production:**

```javascript
// utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        // Write errors to error.log
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        // Write everything to combined.log
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ]
});

// In development, also log to console with colors
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

**Usage in error handler:**

```javascript
const logger = require('./utils/logger');

app.use((err, req, res, next) => {
    // Log with full context
    logger.error('Request error', {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id,
        body: req.body, // Careful! Don't log passwords!
        timestamp: new Date().toISOString()
    });

    res.status(err.statusCode || 500).json({
        error: err.isOperational ? err.message : 'Internal server error'
    });
});
```

**Now when errors happen, you have CONTEXT! 🎯**

```json
{
    "timestamp": "2026-02-14T10:30:45.123Z",
    "level": "error",
    "message": "Request error",
    "error": "Database connection timeout",
    "stack": "Error: Database connection timeout\n    at Connection.query...",
    "url": "/api/users/123",
    "method": "GET",
    "userId": "user_abc123",
    "ip": "192.168.1.100"
}
```

## Error Handling Mistake #4: Ignoring Process-Level Errors 🚨

**The ticking time bombs:**

```javascript
// BAD: No handlers! Server will crash unexpectedly!
const express = require('express');
const app = express();

app.listen(3000);
// That's it? Good luck! 😅
```

**What happens when things go wrong:**

```bash
# Scenario 1: Unhandled promise rejection
await someAsyncFunction(); // Rejects, no catch
# Node.js: "Warning: Unhandled promise rejection. This will crash in future versions."
# *Later* Node.js: *CRASH* 💥

# Scenario 2: Uncaught exception
JSON.parse(undefined); // Throws error
# Node.js: *IMMEDIATE CRASH* 💥

# Scenario 3: Database connection dies
# No error handler on DB client
# Node.js: *CRASH* 💥
```

**The production-ready approach:**

```javascript
// app.js
const express = require('express');
const logger = require('./utils/logger');

const app = express();

// Your routes and middleware...

// Start server
const server = app.listen(3000, () => {
    logger.info('Server started on port 3000');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', {
        reason: reason,
        promise: promise
    });

    // Close server gracefully
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', {
        error: error.message,
        stack: error.stack
    });

    // Close server gracefully
    server.close(() => {
        process.exit(1);
    });
});

// Handle SIGTERM (e.g., from Kubernetes, Docker)
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');

    server.close(() => {
        logger.info('Process terminated');
    });
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');

    server.close(() => {
        logger.info('Process terminated');
    });
});
```

**Why graceful shutdown matters:**

```bash
# Without graceful shutdown:
# User makes request
# You deploy new version
# Old server killed immediately
# User's request fails mid-flight! ❌

# With graceful shutdown:
# User makes request
# You deploy new version
# Old server finishes current requests
# Then shuts down
# User's request completes successfully! ✅
```

**A pattern I use for database connections:**

```javascript
// db.js
const mongoose = require('mongoose');
const logger = require('./utils/logger');

mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;

db.on('error', (error) => {
    logger.error('MongoDB connection error:', error);
    process.exit(1); // Can't run without DB!
});

db.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

db.on('connected', () => {
    logger.info('MongoDB connected successfully');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    db.close(() => {
        logger.info('MongoDB connection closed');
        process.exit(0);
    });
});

module.exports = db;
```

## Error Handling Mistake #5: Not Monitoring Errors in Production 📈

**The "hope it works" strategy:**

```javascript
// Deploy to production
// *Crosses fingers*
// "Hope nothing breaks!"

// 3 days later...
Boss: "Why did we lose 50% of users yesterday?"
You: "Wait, something broke?!"
```

**The professional approach - Error monitoring:**

### Option 1: Sentry (My favorite!)

```javascript
// app.js
const Sentry = require('@sentry/node');

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1 // 10% of requests
});

const app = express();

// Sentry request handler (must be first!)
app.use(Sentry.Handlers.requestHandler());

// Your routes...
app.use('/api/users', userRoutes);

// Sentry error handler (before your error handler!)
app.use(Sentry.Handlers.errorHandler());

// Your error handler
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    res.status(err.statusCode || 500).json({
        error: err.message
    });
});
```

**What you get:**

- Real-time error alerts (Slack, email, etc.)
- Stack traces with source maps
- User context (who was affected?)
- Release tracking (which deploy broke it?)
- Error grouping (not 1000 duplicates!)
- Performance monitoring

### Option 2: Custom error tracking

```javascript
// utils/errorTracker.js
const axios = require('axios');

async function trackError(error, context) {
    try {
        await axios.post(process.env.ERROR_TRACKING_URL, {
            message: error.message,
            stack: error.stack,
            context: context,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV
        });
    } catch (err) {
        // Don't crash if error tracking fails!
        console.error('Failed to track error:', err);
    }
}

module.exports = { trackError };
```

**Usage:**

```javascript
const { trackError } = require('./utils/errorTracker');

app.use((err, req, res, next) => {
    // Log to file
    logger.error('Error:', err);

    // Track in monitoring system
    trackError(err, {
        url: req.url,
        method: req.method,
        userId: req.user?.id,
        userAgent: req.get('user-agent')
    });

    // Send response
    res.status(err.statusCode || 500).json({
        error: err.message
    });
});
```

## Real-World Error Handling Patterns 🎯

### Pattern #1: Database Error Handling

```javascript
// services/userService.js
const { NotFoundError } = require('../utils/errors');

async function getUserById(userId) {
    try {
        const user = await User.findById(userId);

        if (!user) {
            throw new NotFoundError('User');
        }

        return user;
    } catch (error) {
        // Database errors vs. our errors
        if (error instanceof NotFoundError) {
            throw error; // Pass through our error
        }

        // Database connection error
        if (error.name === 'MongoNetworkError') {
            throw new AppError('Database unavailable', 503);
        }

        // Other database errors
        logger.error('Database error:', error);
        throw new AppError('Database error', 500);
    }
}
```

### Pattern #2: External API Error Handling

```javascript
// services/paymentService.js
const axios = require('axios');

async function processPayment(amount, cardToken) {
    try {
        const response = await axios.post('https://payment-api.com/charge', {
            amount,
            token: cardToken
        }, {
            timeout: 10000 // 10 second timeout
        });

        return response.data;
    } catch (error) {
        // Timeout
        if (error.code === 'ECONNABORTED') {
            throw new AppError('Payment service timeout', 504);
        }

        // API returned error
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.message;

            if (status === 402) {
                throw new AppError('Payment declined', 402);
            }

            throw new AppError(`Payment failed: ${message}`, status);
        }

        // Network error
        throw new AppError('Payment service unavailable', 503);
    }
}
```

### Pattern #3: Validation Error Handling

```javascript
const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

const userSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().min(2).max(50).required()
});

app.post('/api/register', async (req, res) => {
    // Validate input
    const { error, value } = userSchema.validate(req.body);

    if (error) {
        // Convert Joi error to our error
        throw new ValidationError(error.details[0].message);
    }

    // Use validated value
    const user = await User.create(value);
    res.json(user);
});
```

## Your Error Handling Checklist ✅

Before deploying to production:

- [ ] All async functions wrapped (express-async-errors or asyncHandler)
- [ ] Custom error classes defined (NotFoundError, ValidationError, etc.)
- [ ] Global error handler implemented
- [ ] Process-level error handlers (unhandledRejection, uncaughtException)
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Structured logging with context (Winston, Pino, etc.)
- [ ] Error monitoring setup (Sentry, Datadog, etc.)
- [ ] Database connection error handling
- [ ] External API timeout and error handling
- [ ] Input validation with proper errors
- [ ] No sensitive data in error messages
- [ ] Different error messages for dev vs production

## The Bottom Line 💬

Error handling in Node.js isn't optional - it's survival! One unhandled rejection can crash your entire server!

**The essentials:**

1. **Catch ALL async errors** (use express-async-errors!)
2. **Use custom error classes** (meaningful status codes + messages)
3. **Log with context** (Winston, Pino, structured logging)
4. **Handle process-level errors** (unhandledRejection, uncaughtException)
5. **Monitor in production** (Sentry, Datadog, etc.)
6. **Graceful shutdown** (finish requests before dying!)

**When I was building Node.js APIs at Acodez**, error handling was the difference between "works on my laptop" and "runs reliably in production". Coming from Laravel where exception handling is more straightforward, Node.js taught me: **In async world, errors can hide ANYWHERE. Hunt them down!** 🎯

Think of error handling like **wearing a seatbelt** - you don't need it until you REALLY need it. And in production, you WILL need it! 🚗💥

---

**Building production Node.js APIs?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - let's share error handling war stories!

**Want to see proper error handling?** Check my [GitHub](https://github.com/kpanuragh) - every error caught, logged, and monitored!

*P.S. - If you don't have unhandledRejection handler, add it RIGHT NOW. Your future self at 3 AM will thank you!* 🚨✨
