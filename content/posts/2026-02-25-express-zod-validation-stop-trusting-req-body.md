---
title: "🛡️ Stop Trusting req.body: Runtime Validation in Express with Zod"
date: 2026-02-25
excerpt: "Your Express API trusts whatever JSON the client sends. That's cute. Let's fix it with Zod — the schema validation library that'll save you from yourself."
tags: ["nodejs", "express", "backend", "typescript", "validation", "zod"]
featured: true
---

Here's a fun game: open your Express codebase, search for `req.body.`, and count how many times you just *trust* what's in there. No checks. No types. Just vibes.

```js
app.post('/users', async (req, res) => {
  const user = await db.create({
    name: req.body.name,       // could be null
    email: req.body.email,     // could be "lol not an email"
    age: req.body.age,         // could be "banana"
  });
  res.json(user);
});
```

This is the backend equivalent of leaving your front door open with a sign that says *"please be cool."* Sometimes users are cool. Sometimes they send `{ "age": "undefined" }` and your database has a very bad day.

## Enter Zod: TypeScript's Runtime Bodyguard

[Zod](https://zod.dev) is a schema declaration and validation library for TypeScript. The pitch is simple: define what your data *should* look like, and Zod enforces it at runtime. No more hoping. No more `if (req.body.email && typeof req.body.email === 'string')` spaghetti.

Install it with:

```bash
npm install zod
```

That's it. No configuration, no 47 peer dependencies, no existential dread.

## Defining a Schema (Your Data Contract)

Think of a Zod schema like a job description for your data. It tells the world exactly what you expect, and rejects anything that doesn't qualify — unlike that one company that posts "5 years experience required for junior role."

```ts
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  age: z.number().int().min(18).max(120).optional(),
  role: z.enum(['admin', 'user', 'moderator']).default('user'),
});

// TypeScript type — FREE, inferred automatically
type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

Now here's the magic: `z.infer<typeof CreateUserSchema>` gives you a TypeScript type *for free*. No duplicating your schema as an interface. No drift between your validation and your types. One source of truth. Your future self will send a thank-you card.

## Wiring It Into Express

Here's a reusable middleware pattern that turns Zod schemas into Express validation middleware. Write it once, use it everywhere:

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace req.body with the parsed, type-safe data
    req.body = result.data;
    next();
  };
}

// Usage
app.post('/users', validate(CreateUserSchema), async (req, res) => {
  // req.body is now fully typed and validated
  const user = await db.create(req.body);
  res.status(201).json(user);
});
```

The key detail: `safeParse` instead of `parse`. The regular `parse` throws on failure — great for scripts, awkward for HTTP handlers. `safeParse` returns a `{ success, data, error }` object you can inspect gracefully, like a civilized API.

When validation fails, clients get a clean, structured error response instead of a cryptic 500:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email" },
    { "field": "age", "message": "Number must be greater than or equal to 18" }
  ]
}
```

Compare that to what they'd get without validation: a mystery 500 error, a database constraint violation, or worse — silent data corruption. The `details` array tells the client *exactly* what to fix. Your frontend devs will love you. Or at least hate you slightly less.

## Beyond the Basics: Validating Query Params and Headers Too

`req.body` gets all the attention, but `req.query` is equally sketchy. Query parameters are *always strings* — even numbers. So `?limit=20` arrives as `"20"`, not `20`. Zod handles this beautifully with `coerce`:

```ts
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    req.query = result.data as any;
    next();
  };
}

app.get('/posts', validateQuery(PaginationSchema), async (req, res) => {
  const { page, limit, sort } = req.query as z.infer<typeof PaginationSchema>;
  // page is a number. limit is a number. life is good.
  const posts = await db.findMany({ skip: (page - 1) * limit, take: limit });
  res.json(posts);
});
```

`z.coerce.number()` automatically converts `"20"` → `20`. It's the validation equivalent of a translator — it speaks both human and database.

## Why This Beats Manual Validation

The old way — manual `if` checks — has problems beyond verbosity:

1. **Drift**: Your validation and your TypeScript types eventually disagree. Bugs hide in that gap.
2. **Incompleteness**: You always forget one field. Always. It's cursed.
3. **Poor error messages**: You return "invalid input" and wonder why your error logs are useless.
4. **No coercion**: Manually converting `"true"` → `true` → `boolean` is a rite of passage nobody asked for.

Zod handles all of this. It's not magic — it's just the right level of abstraction for the job.

## Practical Takeaways

- Install Zod. Seriously, it weighs 14KB gzipped. It costs nothing.
- Define schemas next to your routes. Don't put them in a random `schemas/` folder you'll never look at again.
- Use `z.infer<typeof YourSchema>` as your TypeScript type. One schema = one source of truth.
- Use `safeParse` in middleware, `parse` in scripts where throwing is fine.
- Validate `req.query` and `req.params` too — they're just as untrusted as `req.body`.

## The Bottom Line

Every request your Express server receives is from an untrusted source. That source might be a legit client app, a confused developer hitting the wrong endpoint, or a bot probing for `{ "$where": "1==1" }`. Runtime validation with Zod is the difference between an API that bends gracefully under bad input and one that falls over dramatically.

Your schema is your contract. Enforce it at the door.

---

**Using Zod in your Express projects?** Drop your favorite Zod trick in the comments — I'm always looking for new validation patterns to steal. And if you're still hand-rolling validation with `if/else` chains, no judgment... but also, please read this post again.
