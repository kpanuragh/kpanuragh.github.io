---
title: "🎁 Mass Assignment: The API That Trusted Your JSON a Little Too Much"
date: "2026-08-26"
excerpt: "You sent a signup request with `role: 'admin'` as a joke. The API said 'sure, why not.' Mass assignment is what happens when your ORM's convenience feature meets an attacker's curiosity."
tags:
  - security
  - api-security
  - mass-assignment
  - owasp
  - authorization
  - backend
featured: true
---

# 🎁 Mass Assignment: The API That Trusted Your JSON a Little Too Much

Here's a fun experiment. Next time you sign up for literally any API-backed app, open dev tools, find the `POST /register` request, and add one extra field to the JSON body: `"isAdmin": true`. Most of the time nothing happens — the server ignores it. But every so often, you get a response back, log in, and there's an admin panel waiting for you like the app just handed you the keys because you politely asked.

That's mass assignment. It's not a clever exploit. It's not a buffer overflow, it's not a race condition, it's not even really "hacking" in the Hollywood sense. It's a backend developer writing `User.create(req.body)` and an attacker discovering that "create user" and "create *any* user I want, with any fields I want" turned out to be the exact same code path.

## The Convenience Feature That Became a Vulnerability Class

Mass assignment exists because ORMs are trying to save you keystrokes. Instead of writing this:

```js
// The tedious-but-safe way
const user = await User.create({
  email: req.body.email,
  name: req.body.name,
  password: hashPassword(req.body.password),
});
```

Someone, at some point, decided this was nicer:

```js
// The "convenient" way
const user = await User.create(req.body);
```

Both versions work great in the demo. Both versions pass every happy-path test. The difference only shows up the day someone sends this instead of a normal signup payload:

```json
{
  "email": "attacker@example.com",
  "name": "Totally Normal User",
  "password": "hunter2",
  "role": "admin",
  "isVerified": true,
  "creditBalance": 999999
}
```

If your `User` model has `role`, `isVerified`, and `creditBalance` columns, and nothing between `req.body` and the database is filtering that object, congratulations — you just let an anonymous signup form grant admin access and free money. This made OWASP's API Security Top 10 by name (API3:2023 — "Broken Object Property Level Authorization," the spiritual successor of what everyone still calls mass assignment) precisely because it's this common and this boring to introduce.

## Where This Actually Bites in Production

The classic story is GitHub in 2012 — a researcher mass-assigned his SSH public key onto the Rails project's own repo by exploiting exactly this pattern in a public form, no credentials required. That was over a decade ago, and it fixed Rails' defaults industry-wide. But the pattern didn't die — it just moved from "attribute_accessible" gems to every framework that lets you `.create(payload)` or spread an object straight into an update.

The place I see it most isn't signup — it's the boring `PATCH /profile` endpoint nobody threat-models because "it's just editing your own profile, what's the worst that happens":

```js
// PATCH /api/users/me
app.patch('/api/users/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id);
  Object.assign(user, req.body); // looks harmless. it is not.
  await user.save();
  res.json(user);
});
```

The developer's mental model was "the user is editing their own name and bio." The attacker's mental model was "let me see what other fields exist on this document," followed by a quick `{"subscriptionTier": "enterprise"}` or `{"organizationId": "<someone-else's-org>"}`. Same bug, wearing a "profile settings" costume instead of a "signup form" costume. I've reviewed onboarding flows at Cubet where the fix was almost embarrassingly small — swap one `Object.assign(user, req.body)` for an explicit whitelist — but finding it required actually asking "what fields does this model have that this endpoint's *users* shouldn't touch," which is a very different question than "does this endpoint work."

## Fixing It: Allowlists, Not Blocklists

The fix is always the same shape: never let a request body decide which fields of your own domain model get written. Pick one of these, in order of how much I trust it:

**1. Explicit allowlist at the boundary (best):**

```js
function pickUpdatableFields(body) {
  const { name, bio, avatarUrl } = body;
  return { name, bio, avatarUrl };
}

app.patch('/api/users/me', authenticate, async (req, res) => {
  const updates = pickUpdatableFields(req.body);
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
  res.json(user);
});
```

Boring, explicit, and — crucially — it fails *closed*. Add a new column to the `users` table next quarter and forget to touch this function? The new field simply isn't writable from this endpoint until someone deliberately adds it. That's the direction you want your bugs to fail in.

**2. Schema validation with `strict` mode (Zod, Joi, class-validator, etc.):**

```ts
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(80),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
}).strict(); // rejects any key not listed above

const updates = UpdateProfileSchema.parse(req.body);
```

`.strict()` is doing the real work here — without it, Zod (like most validators by default) silently *strips* unknown keys, which is safe but can mask a bug where a legitimate field just never made it into your schema. Rejecting loudly during development beats stripping silently and finding out in a support ticket.

**3. DTO / serializer classes (NestJS, Django REST Framework, Rails strong params)** — same idea, enforced by the framework so nobody has to remember to do it by hand every time. Rails hasn't shipped `attr_accessible`-by-default vulnerable mass assignment since 4.0, precisely because the framework maintainers decided this shouldn't be an opt-in safety feature.

Whatever you pick, apply it per-endpoint, not per-model. "Admin can set `role`, user can't" isn't a property of the `User` model — it's a property of *which route is calling it*, and your authorization needs to live at that boundary, not be inferred from what happens to be in the request.

## The One-Line Audit

If you want to know whether this bug exists in your codebase right now, grep for it:

```bash
grep -rnE "\.create\(req\.body\)|Object\.assign\([a-zA-Z]+, req\.body\)|update\(req\.body\)" src/
```

Every hit is a candidate. Not every hit is exploitable — maybe the model genuinely only has three public fields, maybe there's a serializer downstream you missed — but every hit is worth five minutes of your afternoon, because the fix is small and the alternative is someone else finding it first and writing a very different kind of blog post about your API.

---

Found a mass assignment bug in the wild, or have a war story about a `role` field that shouldn't have been writable? I'd genuinely like to hear it — come argue with me on [Twitter/X](https://twitter.com/anuragh_kp) or check out more of my writing on [GitHub](https://github.com/kpanuragh). 🔐
