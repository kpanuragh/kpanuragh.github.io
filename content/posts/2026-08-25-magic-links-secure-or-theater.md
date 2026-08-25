---
title: "✨ Magic Links: Secure, or Just Security Theater?"
date: "2026-08-25"
excerpt: "No password, no problem — just click the link we emailed you. Magic links feel like they solve authentication by sidestepping it entirely. They don't. They just move the attack surface into your inbox, your logs, and your link-expiry logic, and most implementations get at least one of those wrong."
tags:
  - security
  - authentication
  - session-management
  - web-security
featured: true
---

Somewhere around 2019, "just click the link we emailed you" started replacing "enter your password" as the cool-kid way to log in. No password to forget, no password to leak in a breach, no password reset flow to build. Slack does it. Notion does it. Half of every SaaS onboarding flow you've clicked through this year does it.

It feels secure because it *removes* a thing — the password — that's historically been the source of most account-takeover headlines. But removing a weak thing doesn't automatically make what's left strong. It just means your security now lives entirely in a different place: a single-use, time-boxed token sitting in an email. And email, as an authentication delivery channel, has opinions about how much trust it actually deserves.

## The part that's genuinely good

Let's give magic links their due first, because the pitch isn't wrong. A well-built magic link:

- Can't be reused across sites (unlike a password, which gets recycled constantly)
- Can't be phished the same way a password can, since there's nothing to type into a fake form
- Sidesteps credential-stuffing entirely — there's no static secret to stuff

That's a real improvement over "users pick `Summer2024!` and reuse it on four sites." If your threat model is mass credential-stuffing bots, magic links genuinely help.

## Where it quietly falls apart

The problem is that "click this link" swaps one set of failure modes for another, and teams tend to ship the happy path without stress-testing the rest.

**1. The token itself is a bearer credential.** Whoever has the link is you. That sounds obvious, but it means every place the link could leak — browser history, a shared inbox, a corporate email gateway that "helpfully" pre-fetches links to scan them for malware — is now a login bypass. That last one isn't hypothetical; several vendors have shipped magic-link systems that got silently invalidated (or worse, silently *consumed*) by an email security scanner clicking the link before the human ever saw it.

**2. Expiry windows are usually way too generous.** A 24-hour magic link is a 24-hour open door sitting in an inbox that might get compromised, forwarded, or archived somewhere less protected than the app itself.

**3. Most implementations forget to invalidate on use, or invalidate the wrong thing.** If clicking the link twice logs you in twice, you don't have a magic link — you have a permanent shareable password that happens to look prettier.

Here's the naive version most tutorials show you, and the two things wrong with it:

```javascript
// naive: token is predictable-ish and never expires
app.post('/auth/magic-link', async (req, res) => {
  const token = crypto.randomBytes(16).toString('hex'); // 128 bits, ok-ish
  await db.tokens.insert({ token, email: req.body.email, createdAt: Date.now() });
  await sendEmail(req.body.email, `Click to log in: https://app.example.com/verify?token=${token}`);
  res.sendStatus(200);
});

app.get('/verify', async (req, res) => {
  const row = await db.tokens.findOne({ token: req.query.token });
  if (!row) return res.sendStatus(401);
  req.session.userId = row.userId; // no expiry check, no single-use check
  res.redirect('/dashboard');
});
```

No expiry, no consumption check, and — this one bites people constantly — the token rides in on a `GET` query string, which means it ends up in server access logs, browser history, and any proxy or CDN logging URLs by default.

A tighter version fixes the actual gaps:

```javascript
app.post('/auth/magic-link', async (req, res) => {
  const token = crypto.randomBytes(32).toString('hex'); // 256 bits
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.tokens.insert({
    tokenHash,               // store the hash, not the raw token
    email: req.body.email,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes, not 24 hours
    used: false,
  });
  await sendEmail(req.body.email, `https://app.example.com/verify?token=${token}`);
  res.sendStatus(200);
});

app.get('/verify', async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.query.token || '').digest('hex');
  const row = await db.tokens.findOneAndUpdate(
    { tokenHash, used: false, expiresAt: { $gt: Date.now() } },
    { $set: { used: true } } // atomic claim — second click fails
  );
  if (!row) return res.status(401).send('Link expired or already used');
  req.session.regenerate(() => {
    req.session.userId = row.userId;
    res.redirect('/dashboard');
  });
});
```

Short expiry, hashed storage (so a database read doesn't hand out live tokens), an atomic single-use claim so the email-scanner-clicks-it-first problem burns the link instead of the real user, and — because this is the same lesson from every other auth post — a session regeneration on privilege change, not a reuse of whatever anonymous session existed before.

## The part nobody puts in the tutorial

None of that fixes the underlying dependency: your auth system's security ceiling is now your users' email provider's security floor. If someone's inbox is compromised — old password reused, or a stale session on a shared computer — magic links hand over the whole account with a single click, no second factor required. Password-based login *can* be paired with MFA as an independent second channel; a magic link that comes from the same email account you'd use to reset a password often collapses "the thing you have" and "the thing that resets everything" into one inbox. It's not less secure than a weak password. It's not obviously more secure than a strong password plus TOTP, either. It's a different set of trade-offs wearing a friendlier UX.

At Cubet, we ended up treating magic links as *one* factor, not a full auth story — fine for low-risk actions, paired with a second signal (device fingerprint check, or a follow-up MFA prompt) for anything touching billing or account settings. "No password" isn't the same claim as "secure." It's just a claim that you moved the weak point somewhere else and now need to go look at it directly.

Running magic links in production, or debating them for a new signup flow? I'd like to hear how you're handling expiry and single-use enforcement — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
