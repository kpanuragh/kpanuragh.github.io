---
title: "Express.js Error Handling: Stop Leaking Stack Traces to Hackers 🛡️"
date: "2026-03-12"
excerpt: "Your Express API crashes, your users see a wall of Node.js internals, and somewhere a hacker is taking notes. Let's fix error handling once and for all with centralized middleware, typed errors, and zero information leakage."
tags: ["\"nodejs\"", "\"express\"", "\"backend\"", "\"javascript\"", "\"api\""]
featured: "true"
---

# Express.js Error Handling: Stop Leaking Stack Traces to Hackers 🛡️

Picture this: your Express API throws an unhandled error, and the response body looks like this:

```
Error: Cannot read property 'id' of undefined
    at /app/routes/users.js:42:23
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at next (/app/node_modules/express/lib/router/route.js:137:13)
```

Congratulations — you've just handed an attacker your file structure, your Node.js version, your ORM internals, and possibly the exact line of code where they can cause maximum damage. It's like leaving your car keys on the hood with a sticky note that says "please steal me."

Most Express tutorials show you `try/catch` blocks scattered across every route. That's not error handling — that's error *hoping*. Let's build a system that actually works.

## The Problem: Express's Default Error Handling Is Embarrassing

By default, Express will either crash your process silently, hang the request forever, or dump a stack trace in the response. None of these are acceptable in production.

The fix? A **centralized error handling middleware** at the bottom of your middleware stack, and a consistent way to throw errors throughout your app.

## Step 1: Create a Custom Error Class

First, stop throwing plain `Error` objects. Build an `AppError` class that carries an HTTP status code and a user-safe message:

```javascript
// errors/AppError.js
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // can we trust this error?
    Error.captureStackTrace(this, this.constructor);
  }
}

// Convenience factories
AppError.notFound = (msg = 'Resource not found') =>
  new AppError(msg, 404);

AppError.unauthorized = (msg = 'Unauthorized') =>
  new AppError(msg, 401);

AppError.badRequest = (msg = 'Bad request') =>
  new AppError(msg, 400);

module.exports = AppError;
```

Now anywhere in your route handlers you can do:

```javascript
const AppError = require('../errors/AppError');

router.get('/users/:id', async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(AppError.notFound('User not found'));
  res.json(user);
});
```

Notice the `next(error)` pattern — this is how you hand errors to Express's error middleware. Never throw inside async routes without catching first; Express won't know what hit it.

## Step 2: The Centralized Error Handler

This is where the magic happens. One middleware at the bottom of your app handles *everything*:

```javascript
// middleware/errorHandler.js
const AppError = require('../errors/AppError');

const errorHandler = (err, req, res, next) => {
  // Normalize non-AppError errors (Mongoose, JWT, etc.)
  let error = err;

  if (!(err instanceof AppError)) {
    // Handle specific library errors
    if (err.name === 'CastError') {
      error = new AppError('Invalid ID format', 400);
    } else if (err.code === 11000) {
      // MongoDB duplicate key
      const field = Object.keys(err.keyValue)[0];
      error = new AppError(`${field} already exists`, 409);
    } else if (err.name === 'JsonWebTokenError') {
      error = new AppError('Invalid token', 401);
    } else {
      // Unknown error — log it, but don't expose details
      console.error('UNHANDLED ERROR:', err);
      error = new AppError('Something went wrong', 500, false);
    }
  }

  const statusCode = error.statusCode || 500;

  // In development, show the stack trace
  // In production, show NOTHING internal
  const response = {
    status: 'error',
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  };

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
```

Wire it up in `app.js` *after* all your routes:

```javascript
const errorHandler = require('./middleware/errorHandler');

app.use('/api', routes);

// Must be last — 4 parameters = Express recognizes it as error middleware
app.use(errorHandler);
```

The four-parameter signature `(err, req, res, next)` is not optional — Express uses it to identify error-handling middleware. Forget one parameter and you've just built a normal middleware that happens to accept garbage input.

## Step 3: Don't Forget Async Routes

Here's the trap that catches everyone. This crashes Node silently:

```javascript
// WRONG — unhandled promise rejection
router.get('/data', async (req, res) => {
  const data = await fetchFromDB(); // throws? crashes!
  res.json(data);
});
```

The fix is a tiny wrapper:

```javascript
// utils/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;

// Usage
const asyncHandler = require('../utils/asyncHandler');

router.get('/data', asyncHandler(async (req, res) => {
  const data = await fetchFromDB();
  res.json(data);
}));
```

Now any thrown error or rejected promise gets forwarded to your centralized error handler automatically. No more `try/catch` copy-paste marathons across 40 routes.

## The Operational vs. Programming Error Distinction

Notice the `isOperational` flag on `AppError`. This distinction matters more than most tutorials acknowledge:

- **Operational errors**: "User not found", "Invalid token", "Rate limit exceeded" — expected failures you anticipated. Safe to return to the client.
- **Programming errors**: `TypeError: cannot read property of undefined`, out-of-bounds access — *your* bugs. Never expose these. Log them aggressively, alert your on-call, and return a generic 500.

A production error handler should check `isOperational` and either log-and-alert (programming error) or log-and-respond (operational error). Grafana, Sentry, or even a simple Slack webhook go a long way here.

## What Your API Response Should Look Like

**In development:**
```json
{
  "status": "error",
  "message": "User not found",
  "stack": "AppError: User not found\n    at routes/users.js:42..."
}
```

**In production:**
```json
{
  "status": "error",
  "message": "User not found"
}
```

Clean. Consistent. Nothing a hacker can weaponize.

## One More Thing: Handle Unhandled Rejections Globally

Your centralized middleware handles in-request errors. But what about promises that explode outside the request lifecycle — like a failed database reconnection?

```javascript
// At the bottom of app.js or server.js
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  // Graceful shutdown — give existing requests time to finish
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1); // Node is now in an unknown state — restart
});
```

Pair this with a process manager like PM2 that auto-restarts on crash, and your API becomes dramatically more resilient.

## The Payoff

Before this pattern: scattered `try/catch` blocks, inconsistent error response shapes, stack traces leaking into production responses, and mysterious silent crashes.

After: one place to look when something goes wrong, consistent JSON error responses your frontend team can actually rely on, and zero information leakage to attackers.

Error handling isn't glamorous. Nobody writes blog posts about it at conferences. But it's the difference between an API that feels professional and one that makes clients quietly start evaluating alternatives.

---

**Ready to clean up your Express error handling?** Start with the `AppError` class — it's a 15-minute change that pays dividends forever. Drop your biggest Express error handling headache in the comments; let's debug it together!
