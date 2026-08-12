---
title: "🛎️ BFLA: When 'Admin Only' Just Means 'Admin Usually'"
date: "2026-08-12"
excerpt: "BOLA gets all the OWASP fame for letting you peek at someone else's data. Its quieter sibling, Broken Function Level Authorization, is the one that lets a regular user call an admin endpoint directly and quietly promote themselves. Same root cause, much scarier blast radius."
tags:
  - security
  - api-security
  - bfla
  - authorization
  - access-control
  - web-development
featured: true
---

# 🛎️ BFLA: When "Admin Only" Just Means "Admin Usually"

Quick quiz. Your API has this route:

```
POST /api/admin/users/:id/promote
```

It's not linked anywhere in the regular user's dashboard. There's no button for it. The admin panel is a completely separate frontend bundle that a normal user would never even load. So it's safe, right?

It is exactly as safe as leaving your front door unlocked because you hid the doorbell. The route still exists. It still responds. And if the only thing standing between "logged-in user" and "logged-in user who just made themselves an admin" is the fact that nobody *told* them the URL, you don't have access control — you have security through the hope that people don't read minified JS bundles for a living.

That's Broken Function Level Authorization, BFLA, sitting at #5 on the OWASP API Security Top 10. It's the less famous cousin of BOLA, and I'd argue it's scarier, because BOLA usually leaks *one record*. BFLA lets you call a *function you were never supposed to have* — delete endpoints, refund endpoints, "make this account an admin" endpoints. The blast radius isn't a row. It's a role.

## The Bug That Looks Like a Feature

Here's roughly how this happens, every single time. Someone builds the admin panel fast, because it's internal tooling and internal tooling never gets the same scrutiny as customer-facing surface:

```js
// auth middleware just checks: is there a valid token?
app.use('/api/admin', requireAuth);

app.post('/api/admin/users/:id/promote', async (req, res) => {
  await db.users.update(req.params.id, { role: 'admin' });
  res.json({ ok: true });
});
```

`requireAuth` answers "is this a real, logged-in session." It never asks "is this logged-in person actually an admin." The frontend enforces the role check by simply not rendering the button for non-admins — which is a UX decision, not a security boundary, and treating it as one is the entire bug in a single sentence. Anyone with dev tools and five minutes can read the API calls the admin dashboard makes, then replay one of them with their own regular-user session token:

```bash
curl -X POST https://api.example.com/api/admin/users/41/promote \
  -H "Authorization: Bearer $MY_TOTALLY_NORMAL_USER_TOKEN"
```

If that returns `{ "ok": true }` instead of a 403, congratulations, user 41 just self-promoted, and you found out the same way most companies do — from an incident report, not a code review.

## Why It's Easy to Ship and Easy to Miss

BFLA thrives in the gap between two teams' assumptions. The frontend team assumes "we only render this for admins, so it's fine." The backend team assumes "the frontend won't let a non-admin trigger this, so it's fine." Both statements are true and the API is still wide open, because neither team actually wrote the check — everyone was relying on someone else having done it. It's the access-control version of the bystander effect.

It also hides well in horizontally-scaled route files, because the vulnerable line isn't dramatic. It's the *absence* of a line. Reviewing a 40-route admin controller for "does every single one of these check role" is tedious in a way that reviewing for SQL injection isn't — there's no suspicious string concatenation to eyeball, just a middleware chain you have to mentally trace route by route.

The fix, once you actually go looking for it, is small and boring — same as BOLA:

```js
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(404).end(); // don't confirm the route exists
    }
    next();
  };
}

app.post(
  '/api/admin/users/:id/promote',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    await db.users.update(req.params.id, { role: 'admin' });
    res.json({ ok: true });
  }
);
```

Two middlewares stacked instead of one. The hard part was never writing `requireRole` — it's remembering to attach it to every single privileged route, forever, including the one a tired engineer adds at 6pm on a Friday six months from now.

## The Test That Actually Finds This

At Cubet, the check that catches BFLA before it ships isn't a linter — it's a contract test that enumerates every route tagged as privileged and calls each one twice: once with an admin token, once with a plain authenticated user token. The admin call should succeed; the regular-user call should get a 404 or 403. If your test suite only ever authenticates as an admin when it tests admin routes, you have exactly zero coverage for the failure mode that matters, and a fully green CI pipeline that means nothing about this vulnerability class.

The other habit worth stealing: treat "internal" or "admin-only" endpoints as *more* suspicious during review, not less, precisely because the frontend hiding them creates a false sense of safety. If a route can change someone's role, delete an account, issue a refund, or touch billing, it deserves an explicit `requireRole` check with its own test — not the vague comfort of "well, the button's not on their screen."

## The One-Sentence Rule

Authentication tells you who's knocking. Authorization has to separately tell you which doors they're allowed through — and a door with no lock is still a door, whether or not you painted a "staff only" sign on it.

---

Found a BFLA in a pentest, or have opinions on whether "just hide the button" should be a fireable offense? Come argue with me:

- 🐦 Twitter/X: [@kpanuragh](https://twitter.com/kpanuragh)
- 💼 LinkedIn: [kpanuragh](https://linkedin.com/in/kpanuragh)
- 🐙 GitHub: [kpanuragh](https://github.com/kpanuragh)
