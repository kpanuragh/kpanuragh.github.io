---
title: "🛡️ Express Request Validation with Zod: Stop Trusting User Input"
date: "2026-03-18"
excerpt: "Every unvalidated request is a ticking time bomb. Learn how to use Zod to add bulletproof, type-safe validation to your Express APIs — and sleep soundly at night."
tags: ["\\\"nodejs\\\"", "\\\"express\\\"", "\\\"validation\\\"", "\\\"zod\\\"", "\\\"backend\\\"", "\\\"typescript\\\""]
featured: "true"
---

# 🛡️ Express Request Validation with Zod: Stop Trusting User Input

Here's the uncomfortable truth about your API: users are lying to you.

Not maliciously (well, sometimes maliciously), but your frontend is sending strings where you expect numbers, missing fields you assume are required, and occasionally just dumping raw garbage into your endpoints. If you're relying on TypeScript types alone to protect you, I have bad news — TypeScript types disappear at runtime. They're compile-time fairy dust.

What you need is **runtime validation**. And the best tool for the job in 2026? [Zod](https://zod.dev).

## What Even Is Zod?

Zod is a TypeScript-first schema declaration and validation library. You define the shape of your data once, and Zod enforces it at runtime *and* infers TypeScript types from it. It's like having a bouncer at your API's door who also fills out the TypeScript paperwork automatically.

Think of it this way: TypeScript is a contract that your *developer* promises to honor. Zod is a contract that your *users* are forced to honor.

```bash
npm install zod
```

That's it. No peer dependencies, no configuration files, no ritual sacrifices.

## The Problem Without Validation

Here's a classic Express endpoint that trusts user input with the naivety of a golden retriever:

```js
// ❌ The "trust me bro" approach
app.post('/users', async (req, res) => {
  const { name, email, age } = req.body;

  // What if name is undefined? What if age is "banana"?
  // What if email is { "$gt": "" }? (That's a NoSQL injection, by the way)
  const user = await db.createUser({ name, email, age });
  res.json(user);
});
```

This endpoint will happily accept `{ age: "DROP TABLE users" }` and pass it straight to your database layer. Your error messages are stack traces. Your logs are a crime scene. Your users get a 500 with no useful feedback.

## Zod to the Rescue

Here's the same endpoint, now with actual self-respect:

```ts
import { z } from 'zod';
import express from 'express';

const app = express();
app.use(express.json());

// Define your schema ONCE — Zod infers the TypeScript type automatically
const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100),
  email: z.string().email('Must be a valid email address'),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['user', 'admin', 'moderator']).default('user'),
});

// TypeScript type inferred for free — no duplicate type definitions!
type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Reusable validation middleware factory
function validate(schema: z.ZodSchema) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    // Replace req.body with the parsed + coerced data
    req.body = result.data;
    next();
  };
}

// ✅ Clean, validated, type-safe
app.post('/users', validate(CreateUserSchema), async (req, res) => {
  const user: CreateUserInput = req.body; // TypeScript knows the exact shape
  const created = await db.createUser(user);
  res.status(201).json(created);
});
```

When someone sends bad data, they get a *useful* error response:

```json
{
  "error": "Validation failed",
  "details": {
    "email": ["Must be a valid email address"],
    "name": ["Name cannot be empty"]
  }
}
```

No stack traces. No 500 errors. Just clean, actionable feedback. Your API is now a responsible adult.

## Validating Query Params and Route Params Too

Don't stop at the request body. Query strings and route params are equally dangerous:

```ts
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const UserIdSchema = z.object({
  id: z.string().uuid('Must be a valid UUID'),
});

// Extend validate() to handle query params and route params
function validateQuery(schema: z.ZodSchema) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.query = result.data;
    next();
  };
}

app.get('/users', validateQuery(PaginationSchema), async (req, res) => {
  const { page, limit, search } = req.query as z.infer<typeof PaginationSchema>;
  // page and limit are guaranteed to be numbers — z.coerce handled the string→number conversion
  const users = await db.getUsers({ page, limit, search });
  res.json(users);
});
```

Note the `z.coerce.number()` magic — query params arrive as strings, and Zod will coerce `"42"` into `42` for you. No `parseInt` scattered everywhere.

## Practical Schema Tricks You'll Actually Use

Zod has a remarkably expressive API. Here are patterns that pay for themselves immediately:

```ts
// Passwords with complexity requirements
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number');

// Cross-field validation (password confirmation)
const RegisterSchema = z
  .object({
    email: z.string().email(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Strip unknown fields (security win — no mass assignment)
const SafeUpdateSchema = z
  .object({
    name: z.string().optional(),
    bio: z.string().max(500).optional(),
  })
  .strict(); // Throws if any extra fields are present
```

That `.strict()` at the end? That's your defense against mass assignment vulnerabilities. Send `{ role: "admin" }` to a strict schema and it gets rejected. No accidental privilege escalation.

## Error Formatting for Your Frontend

Raw Zod errors are powerful but verbose. Wrap them into something your frontend can actually use:

```ts
function formatZodError(error: z.ZodError) {
  return error.errors.reduce((acc, err) => {
    const field = err.path.join('.');
    acc[field] = err.message;
    return acc;
  }, {} as Record<string, string>);
}

// Result: { "email": "Must be a valid email", "name": "Name cannot be empty" }
```

Now your React form can map directly from field name to error message. Your frontend developer will owe you a coffee.

## The Pattern in Production

For real projects, organize your schemas in a dedicated `schemas/` directory alongside your routes. One schema file per feature. Export both the Zod schema and the inferred TypeScript type. Use the same schema on both server and client if you're on a full-stack TypeScript setup — Zod is isomorphic.

```
src/
  schemas/
    users.ts       ← CreateUserSchema, UpdateUserSchema, etc.
    products.ts
  routes/
    users.ts       ← imports schemas, uses validate() middleware
```

This single pattern eliminates an entire class of bugs: the "works in TypeScript but explodes in production with real data" class.

## Your Next Step

Add Zod to your next Express endpoint. Start with just one route — your most-public, most-dangerous endpoint. Write the schema, add the middleware, watch the type safety flow down into your handler.

Then notice how many fewer `if (!req.body.email)` checks you write. Notice how your database layer stops getting nonsense. Notice how your error logs become useful again.

User input will always be chaotic. Your validation layer doesn't have to be.

---

*Already using Zod or a different validation library like Joi or express-validator? Hit me up — I'd love to hear how your setup compares.*
