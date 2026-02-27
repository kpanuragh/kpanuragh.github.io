---
title: "🏗️ Stop Putting Everything in app.js: Structure Your Express App Before It Eats You Alive"
date: 2026-02-27
excerpt: "Express gives you a blank canvas and infinite rope to hang yourself with. Coming from Laravel, I learned this the hard way when my 'quick' Node.js API turned into a 900-line app.js monster. Here's the structure I wish someone had shown me."
tags: ["nodejs", "express", "javascript", "backend", "architecture"]
featured: true
---

Here's how most Express apps start: you follow a tutorial, you write 30 lines in `app.js`, it works, and you think "this is so much simpler than Laravel." Six months later, `app.js` is 900 lines long, your routes reference your database directly, your validation lives next to your auth logic, and a new teammate opens the file and immediately submits their resignation letter.

I've been there. Multiple times.

When I moved from Laravel to Node.js at Acodez, the first thing that hit me was how much Laravel does for you without asking. `php artisan make:controller`, `php artisan make:model`, `php artisan make:middleware` — the framework *imposes* a structure before you can write a single line of business logic. You might hate it, but you'll never have a 900-line `UserController.php` because the framework physically won't let you build it that way.

Express gives you nothing. Just `app.use()` and `app.get()` and a blank canvas. Which sounds great until you actually try to build something real.

## 🤔 The Typical Mess

Here's what "just getting it working" looks like after a few weeks of feature additions:

```js
// app.js — week 6, send help
app.post('/users', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const existing = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'Already exists' });
  const hash = await bcrypt.hash(password, 10);
  const result = await db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hash]);
  const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET);
  res.status(201).json({ token });
});
```

Validation, database queries, password hashing, JWT signing — all jammed into a single route handler. Testing this is a nightmare. Reusing any of it is impossible. Changing the hashing algorithm means grep-ing through 47 route files.

Coming from Laravel, this gave me physical discomfort. In Laravel, you'd never write a controller action that directly queries the database. There's Eloquent for that. There are service classes. There's a natural separation that junior developers inherit for free.

In Express, you have to build that separation yourself. Deliberately.

## 🏗️ The Structure That Actually Works

After building enough production Node.js APIs to know what blows up and what doesn't, here's the folder layout I default to:

```
src/
├── routes/          ← HTTP layer: define endpoints, call controllers
├── controllers/     ← Handle request/response, validate, delegate to services
├── services/        ← Business logic, knows nothing about HTTP
├── repositories/    ← Database queries, knows nothing about business logic
├── middleware/      ← Auth, logging, validation helpers
├── models/          ← Data shapes, types (or your ORM models)
└── config/          ← Database, env, constants
```

This isn't revolutionary. It's basically MVC with a service layer. But it mirrors what Laravel enforces by default, and it scales past the point where a single developer understands the whole codebase.

## 🔀 Routes: Just Routing

Routes should do exactly one thing: map HTTP paths to controller functions. Nothing else.

```js
// src/routes/users.js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { UsersController } from '../controllers/UsersController.js';

const router = Router();
const controller = new UsersController();

router.post('/',               controller.create);
router.get('/:id',  authenticate, controller.getById);
router.patch('/:id', authenticate, controller.update);

export default router;
```

A new developer should be able to open any route file and immediately know what endpoints exist, which ones require auth, and which controller handles each one. No business logic. No database queries. Just wiring.

## 🎮 Controllers: HTTP Boundary

Controllers know about `req` and `res`. They validate input, call the appropriate service, and translate the result into an HTTP response. They don't know about your database.

```js
// src/controllers/UsersController.js
import { UserService } from '../services/UserService.js';

export class UsersController {
  constructor() {
    this.userService = new UserService();
    this.create = this.create.bind(this);
    this.getById = this.getById.bind(this);
  }

  async create(req, res, next) {
    try {
      const user = await this.userService.createUser(req.body);
      res.status(201).json(user);
    } catch (err) {
      next(err); // Let your error middleware handle it
    }
  }

  async getById(req, res, next) {
    try {
      const user = await this.userService.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Not found' });
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
}
```

Notice what's missing: no `db.query()`, no password hashing, no JWT signing. The controller trusts the service to do the right thing and just translates the result to HTTP.

## ⚙️ Services: Business Logic Lives Here

This is the layer Laravel developers will feel most at home in. Services contain the actual business rules — the "what should happen" — without any knowledge of HTTP or database implementation details.

```js
// src/services/UserService.js
import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/UserRepository.js';

export class UserService {
  constructor() {
    this.repo = new UserRepository();
  }

  async createUser({ email, password, name }) {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const existing = await this.repo.findByEmail(email);
    if (existing) {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }

    const hash = await bcrypt.hash(password, 12);
    return this.repo.create({ email, password: hash, name });
  }

  async findById(id) {
    return this.repo.findById(id);
  }
}
```

The beautiful thing about this layer: it's trivially testable. Pass in mock repositories, call `createUser()`, assert the result. No HTTP server required. No database connection needed. Pure functions exercising pure logic.

A pattern I use in Express for multi-tenant APIs: services are where tenant scoping decisions live. The controller passes `req.tenantId`, the service passes it to the repository, and all the "which database do we query?" logic stays in one place.

## 🗄️ Repositories: Database Speaks Here

Repositories translate business needs into database operations. If you switch from MySQL to PostgreSQL, you change repositories — nothing else.

```js
// src/repositories/UserRepository.js
import { db } from '../config/database.js';

export class UserRepository {
  async findByEmail(email) {
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] ?? null;
  }

  async findById(id) {
    const [rows] = await db.execute('SELECT id, email, name FROM users WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async create({ email, password, name }) {
    const [result] = await db.execute(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, password, name]
    );
    return { id: result.insertId, email, name };
  }
}
```

Coming from Laravel, this is basically what Eloquent models do under the hood — except you own it. No magic. No `User::where('email', $email)->first()` mystery. Just SQL you can read, debug, and optimize.

## 🚨 The Mistakes I See Most

**Skipping the service layer.** Controllers calling repositories directly is the most common shortcut. It feels fine until you need to add business validation in two places, or until you need to trigger a side effect (send email, update audit log) from three different routes. The service layer is where those shared decisions live.

**Treating `app.js` as a catch-all.** Route definitions, middleware setup, database connection, even utility functions — all of it in `app.js`. Keep `app.js` (or `server.js`) focused: import routes, register middleware, export the app. That's it.

**Not using a global error handler.** Every layer should throw — controllers, services, repositories. One error middleware at the bottom of your Express setup catches all of it:

```js
// src/middleware/errorHandler.js
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}
```

Register it last: `app.use(errorHandler)`. Now every unhandled error flows to one place, and your route handlers stay clean.

## 🆚 vs. Laravel: What Node.js Gets Right (and Wrong)

Laravel gives you this structure for free, but it also locks you in. Want a controller that isn't in `app/Http/Controllers`? Good luck with the autoloader. Want a service class that isn't a facade? Time to configure the service container.

Express gives you nothing for free, which means you own every decision. That's terrifying for solo projects, and genuinely powerful for teams with architectural opinions. The best Express apps I've worked on were more precisely structured than any Laravel app I've seen — because someone had to *choose* the structure, not just accept the default.

The downside: new developers don't get a map. In Laravel, any developer knows where to look. In Express, if you don't document your conventions, every team member writes a slightly different pattern and your codebase turns into an archaeology project.

## 📋 TL;DR

- Routes: HTTP wiring only. No logic.
- Controllers: HTTP boundary. Validate, delegate, respond.
- Services: Business logic. Knows nothing about HTTP or database implementation.
- Repositories: Database queries. Knows nothing about business rules.
- One global error handler at the bottom. Every layer throws, one layer catches.
- Don't fight the blank canvas — design your structure early and document it.

Express will let you build anything. It will also let you build a 900-line `app.js` that nobody can maintain. The framework won't save you. The structure you choose will.

---

**Using this pattern or something different in your Express apps?** I'm curious what the services vs. domain objects debate looks like in your team's codebase. Drop it in the comments. And if you're still writing database queries directly in route handlers — no judgment, just open a new file and start moving things. You'll thank yourself in six weeks.
