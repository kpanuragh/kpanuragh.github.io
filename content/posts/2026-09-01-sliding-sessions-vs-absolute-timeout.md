---
title: "🔄 Sliding Sessions vs. Absolute Timeout: The Expiry Policy Nobody Actually Chose"
date: "2026-09-01"
excerpt: "Most apps don't design a session expiry policy — they inherit whatever the framework default was on day one. Then someone asks 'why is this banking-adjacent app still logged in after 3 days of idle tabs' and nobody has a good answer."
tags: ["security", "authentication", "session-management", "appsec", "web-security"]
featured: true
---

Quick quiz: does your app log users out after a fixed 24 hours no matter what, or does every click reset the clock so an active user could theoretically stay logged in forever? If you had to go check the code to answer that, you're not alone — session expiry is one of those decisions that gets made once, by accident, in whatever the auth library shipped as a default, and then never revisited until a pentest report flags it three years later.

I've seen both failure modes in production. An internal tool that logged people out mid-incident because their "24 hours since login" absolute timeout didn't care that they'd been actively working the whole time. And, worse, a customer-facing app where a session token issued once would silently renew forever as long as *some* request came in every 30 days — which meant a stolen cookie from a shared library computer stayed valid indefinitely, because "indefinitely" was never actually a decision anyone made.

## The two knobs, and why they fight each other

There are really two separate timers hiding inside "session expiry," and most bugs come from only thinking about one:

- **Idle timeout (sliding expiration)** — the session dies after N minutes of *inactivity*. Every request pushes the expiry further out.
- **Absolute timeout** — the session dies at a fixed point after login, full stop, no matter how active the user is.

A sliding-only policy is the one that quietly turns into "logged in forever" for anyone who keeps a tab open or has a background poller hitting your API. An absolute-only policy is the one that logs your on-call engineer out mid-incident. You almost always want both, and the interesting design work is in how they interact with renewal.

```javascript
// Express-style session check — both timers, checked independently
function checkSessionExpiry(session) {
  const now = Date.now();

  const idleExpired = now - session.lastActivityAt > 30 * 60 * 1000; // 30 min idle
  const absoluteExpired = now - session.createdAt > 12 * 60 * 60 * 1000; // 12 hr hard cap

  if (idleExpired || absoluteExpired) {
    return { valid: false, reason: idleExpired ? 'idle' : 'absolute' };
  }

  session.lastActivityAt = now; // slide the idle window forward
  return { valid: true };
}
```

Twelve hours as an absolute cap, thirty minutes idle — those numbers aren't magic, they're a conversation your team should actually have based on what the session protects. A read-only marketing dashboard and a payments admin panel should not share a config.

## Renewal is where fixation sneaks back in

Here's the part that trips people up even after they've got both timers right: *how* you renew matters as much as *whether* you renew. The naive approach — just push the same session ID's expiry further out on every request — works fine for the timeout logic, but it means a session identifier that leaked once (browser history, a proxy log, a referrer header from a sloppy redirect) stays exploitable for as long as the legitimate user keeps the session alive by using the app normally. The attacker doesn't need to catch a fresh token; the victim's own activity keeps the old one warm forever.

The fix that's easy to skip because it's mildly annoying to implement: **rotate the session identifier on renewal, not just the expiry timestamp.** Issue a new token, invalidate the old one, keep the underlying session data intact.

```python
# Rotating renewal — new token, old one dead, same session state
def renew_session(old_token: str, session_store) -> str:
    session = session_store.get(old_token)
    if session is None or session.is_expired():
        raise SessionExpired()

    new_token = generate_secure_token()
    session_store.set(new_token, session.data, ttl=IDLE_TIMEOUT)
    session_store.delete(old_token)  # old token is now useless, even if leaked

    return new_token
```

This is genuinely the same principle behind fixing session fixation attacks — never trust a token you didn't just mint — just applied continuously through the session's life instead of only once at login. A rotated-on-renewal token turns "the leaked cookie works until the victim logs out" into "the leaked cookie works until the next request the legitimate user happens to make," which in practice is a much smaller window.

## What I'd actually check in a review

At Cubet, when I'm looking at an auth flow, the questions that catch real issues aren't "do you have session timeout" — everyone answers yes — they're:

1. Is there an absolute cap independent of activity, or can a session theoretically live forever?
2. Does renewal rotate the identifier, or just bump a timestamp on the same token?
3. Does logging out on one device actually invalidate the server-side session, or just clear a client-side cookie? (Client-only logout is depressingly common and means a copied token outlives the "logout" that was supposed to kill it.)
4. Are idle and absolute timeouts tuned per sensitivity — same values for a public blog and an admin console is a smell, not a policy.

None of this is exotic. It's just the kind of thing that's easy to leave as "whatever the default was" until someone asks the question out loud.

---

What's your idle-vs-absolute timeout split, and did your team actually decide it or inherit it? I want to know either way:

🐦 [Twitter/X](https://twitter.com/kpanuragh) · 💼 [LinkedIn](https://linkedin.com/in/kpanuragh) · 🐙 [GitHub](https://github.com/kpanuragh)
