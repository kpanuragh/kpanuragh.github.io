---
title: "🧟 Shadow APIs: The Endpoints Nobody Remembers Deploying"
date: "2026-07-15"
excerpt: "Your API docs list 40 endpoints. Your API gateway is routing traffic to 63. That gap — undocumented, unmonitored, unauthenticated-by-accident routes — is one of the most common ways attackers get in, and nobody put it there on purpose."
tags:
  - security
  - api-security
  - cybersecurity
  - devops
  - appsec
featured: true
---

Quick exercise: open your API gateway's access logs and count the distinct paths that got a `2xx` response last week. Now open your OpenAPI spec and count the endpoints it documents. If those two numbers match, you're either very disciplined or you haven't looked closely enough.

That gap is called a shadow API (also "zombie API" when the culprit is a deprecated version nobody decommissioned). It's not a vulnerability class like SQL injection with a clean CWE number — it's a *governance* failure that quietly creates room for every other vulnerability class to live in, unmonitored, forever.

## How an API becomes a ghost

Nobody sits down and decides to ship an unmonitored, undocumented endpoint. It happens by accretion:

- **v1 never actually died.** You shipped `/api/v2/users`, updated the docs, told the frontend team to migrate — and left `/api/v1/users` mounted "just in case," with none of the rate limiting or auth hardening that got added to v2 afterward.
- **A feature flag experiment escaped.** Someone stood up `/api/internal/debug/export` behind a flag for a demo, the flag got flipped off in the UI, but the route is still registered and still responds if you hit it directly.
- **A partner integration outlived the partner.** `/api/webhooks/acme-corp` was built for one customer's custom flow two years ago. The contract ended. The route didn't.
- **The API gateway config and the app code drifted apart.** Someone adds a route in code during a sprint, gateway config (rate limits, WAF rules, auth requirements) never gets the matching update because updating gateway config is a separate ticket, in a separate repo, owned by a separate team.

Every one of these is individually a two-minute oversight. Collected across a few years of an active API, they add up to a meaningful chunk of your actual attack surface that never shows up in a threat model, because threat models are drawn from documentation — and this stuff isn't documented.

## Why this is worse than a "normal" bug

A documented, in-scope endpoint gets code review, gets a pentest pass, gets monitored for anomalous traffic, gets the current auth middleware applied when that middleware is upgraded. A shadow endpoint gets none of that — not because anyone decided it didn't need it, but because it's invisible to the process that decides what needs it.

Concretely, here's what "v1 never actually died" looks like in code:

```js
// v2 - current, reviewed, rate-limited, uses the current auth middleware
app.use('/api/v2/users', requireAuth, rateLimiter, usersRouterV2);

// v1 - "deprecated", mounted 2 years ago, still live
// auth middleware here predates the JWT rotation fix from last year
app.use('/api/v1/users', legacyAuthCheck, usersRouterV1);
```

`legacyAuthCheck` might still trust tokens signed with a key that was supposed to be rotated out. It might not check the same authorization rules `requireAuth` does now. Nobody's touched `usersRouterV1` in two years because touching legacy code without a reason is how regressions happen — so the fixes that landed everywhere else never landed here.

## Finding your own ghosts

The fix isn't a library, it's a habit: **treat "what's actually deployed" as the source of truth, not the docs.** A few concrete ways to do that:

**1. Diff your gateway routes against your OpenAPI spec.** If you're on something like Express, `express-list-endpoints` gives you the ground truth for what's actually mounted:

```js
const listEndpoints = require('express-list-endpoints');
const endpoints = listEndpoints(app).map(e => e.path);

const documented = Object.keys(openApiSpec.paths);
const shadow = endpoints.filter(p => !documented.includes(p));

if (shadow.length) {
  console.warn('Undocumented live routes:', shadow);
}
```

Run that in CI, fail the build (or at least post a loud Slack message) when the diff grows. The goal isn't zero forever — it's catching the moment a shadow route appears instead of finding it in an incident review two years later.

**2. Add a `Sunset` header and an actual kill date when you deprecate.** RFC 8594 gives you a standard way to say "this dies on this date":

```js
app.use('/api/v1/users', (req, res, next) => {
  res.set('Sunset', 'Wed, 01 Oct 2026 00:00:00 GMT');
  res.set('Link', '<https://api.example.com/api/v2/users>; rel="successor-version"');
  next();
}, legacyAuthCheck, usersRouterV1);
```

Then — the part everyone skips — put a calendar reminder or a CI check that actually enforces the date. A deprecation notice with no enforcement is just documentation for the shadow API you're about to create.

**3. Monitor by traffic, not by inventory.** Your WAF/gateway logs already know every path that's getting hit. Alert on any path receiving traffic that isn't in your route allowlist, regardless of whether it "should" exist. This flips the failure mode: instead of discovering a zombie endpoint because someone abused it, you discover it because it showed up in an alert the week it started getting traffic.

## Where this bit us

At Cubet Techno Labs, a routine access-control audit on a client's internal admin API turned up a `/reports/legacy-export` endpoint that had been built for a one-off finance request, wired to a service account with broad read access, and never removed once the request was fulfilled. It wasn't in the API docs, wasn't in the threat model, and wasn't covered by the rate limiting rules that had been added to the rest of the API after a scraping incident the year before. Nothing had exploited it — we found it during the audit, not an incident — but it had been sitting there, fully functional, for over a year. The fix was a one-line route removal. The actual fix was adding the CI diff check so the *next* one gets caught in a PR instead of an audit.

## The checklist

- [ ] Generate your route inventory from running code (gateway config or `express-list-endpoints`-style tooling), not from memory or docs.
- [ ] Diff that inventory against your OpenAPI spec in CI; alert on drift.
- [ ] Every deprecated endpoint gets a `Sunset` header and an enforced removal date, not just a comment saying "TODO: remove."
- [ ] Alert on gateway/WAF traffic to paths outside your known-route allowlist.
- [ ] When a partner integration or one-off feature flag ends, killing the route is part of the "done" definition, not a follow-up ticket that never gets prioritized.

None of this needs new infrastructure — most of it is a CI check and a habit change. The hard part is that shadow APIs are, by definition, the things nobody's looking at. The only real fix is making "what's actually live" impossible to lose track of.

---

Ever found a forgotten endpoint like this lurking in production? I'd genuinely like to hear the story — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
