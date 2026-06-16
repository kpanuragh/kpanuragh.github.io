---
title: "Account Enumeration: Stop Letting Your Login Page Snitch on Your Users 🕵️"
date: "2026-06-16"
excerpt: "Your login form is telling attackers exactly which emails are registered — and you probably built this leak yourself. Here's how account enumeration works and how to plug the hole."
tags:
  - security
  - authentication
  - cybersecurity
  - web-security
  - appsec
featured: true
---

Here's a fun game. Go to almost any web app, try logging in with a random email, and watch the error message. Then try with a real email but a wrong password. If you get two *different* error messages, congratulations — you've just found an account enumeration vulnerability, and so has every attacker scanning your app at 3 AM.

Your login page is snitching. Let's make it shut up.

## What Even Is Account Enumeration?

Account enumeration is when an application reveals whether a particular username or email address is registered — without requiring any credentials. Attackers use this as a first step: build a list of valid accounts, *then* attack them (credential stuffing, spear phishing, targeted brute force).

The leak usually shows up in three places:

**1. Login error messages**

```
// What your app probably says today:
"User not found."          ← account doesn't exist
"Incorrect password."      ← account EXISTS, password wrong

// What it should say:
"Invalid email or password."  ← same message, every time
```

That first pair is a phonebook for attackers. They can throw millions of emails at your login endpoint and build a verified list of registered users with zero auth required.

**2. Password reset flows**

```
POST /forgot-password
{ "email": "victim@example.com" }

// Leaky response when email doesn't exist:
HTTP 404
{ "error": "No account with that email." }

// Leaky response when email exists:
HTTP 200
{ "message": "Check your inbox!" }
```

Same problem. An attacker just confirmed `victim@example.com` has an account with you — maybe at a healthcare or financial service. That's PII gold.

**3. Registration forms**

```
// Leaking during signup:
POST /register
{ "email": "already-registered@example.com" }

→ "That email is already in use."
```

This one feels unavoidable, but we'll get to the fix.

## Why Should You Care?

At Cubet Techno Labs, we flagged an enumeration issue during an internal security review on a client app. The registration flow cheerfully told you whether an email was taken, and the password reset confirmed which emails had accounts. The app handled medical appointment bookings. The fact that someone *had* an account was itself sensitive — it implied they'd sought certain types of care.

Even for a low-stakes app, enumeration feeds credential stuffing attacks. You hand attackers a validated email list; they run it through leaked password databases; they get in. [The 2019 Disney+ breach](https://www.theguardian.com/technology/2019/nov/16/disney-plus-hacked-accounts-for-sale) pattern — credential stuffing at scale — starts exactly here.

## Fixing the Login Error

The fix for login is mechanical: **one generic error message, always**.

```python
# Flask example — constant message regardless of what failed

@app.route("/login", methods=["POST"])
def login():
    email = request.json.get("email")
    password = request.json.get("password")

    user = User.query.filter_by(email=email).first()
    
    # Check password even if user is None — prevents timing differences
    # and keeps the same code path either way
    password_valid = False
    if user:
        password_valid = check_password_hash(user.password_hash, password)
    else:
        # Dummy check to normalize timing (bcrypt-equivalent cost)
        check_password_hash(DUMMY_HASH, password)

    if not user or not password_valid:
        return jsonify({"error": "Invalid email or password."}), 401

    return jsonify({"token": generate_token(user)}), 200
```

Two things happening here: same error message *and* a dummy hash check to keep response times consistent even when the account doesn't exist. Skip that dummy check and you've introduced a timing side-channel — a different flavour of the same bug.

## Fixing Password Reset

The fix here is to always return the same success response, then handle the "email not found" case silently:

```javascript
// Express example

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Always return 200 — don't leak whether the email is registered
  res.status(200).json({
    message: "If an account with that email exists, you'll receive a reset link shortly."
  });

  // Fire-and-forget: only send the email if the user exists
  const user = await User.findOne({ email });
  if (user) {
    await sendPasswordResetEmail(user);
  }
  // If no user → do nothing, but the HTTP response already went out
});
```

The key move: respond *before* checking whether the user exists, or respond with the same message regardless. The "if an account exists…" phrasing is now an industry standard — it's honest without being informative to attackers.

## Fixing Registration (The Tricky One)

This is harder because legitimate users need to know if they can register with a given email. The standard pattern:

1. **Always show the same success message**: "If that email isn't registered, you'll get a confirmation link."
2. **If the email is already registered**, send them a "someone tried to register with your email" notification to that inbox instead.
3. The attacker gets no useful signal. The real user gets context.

Some apps skip the problem entirely by not using email as a unique identifier during signup — they only enforce uniqueness at email confirmation time.

## What About Username Enumeration?

Public usernames are a special case — if usernames appear in profile URLs (`/users/anuragh`), they're inherently discoverable and enumeration protection doesn't apply. Focus on protecting *authentication-specific* signals: don't let your *login endpoint* confirm whether a username exists even if the profile is public.

## Quick Audit Checklist

Before you ship, run through these yourself:

- [ ] Same error message for "wrong email" and "wrong password" at login
- [ ] Same response time for both cases (add dummy work if needed)
- [ ] Password reset returns 200 with a generic message regardless of email existence
- [ ] Registration flow doesn't confirm existing emails in the HTTP response
- [ ] API error codes don't leak account status (HTTP 404 vs 401 pattern)

It's a small list. Most of it is just text changes and one dummy hash call. The blast radius of *not* doing it is your entire user list being scraped and sold.

## Wrap Up

Account enumeration sits in that uncomfortable security category of "totally preventable, but nobody thinks about it until it bites them." The fixes are cheap. The consistent-message pattern takes fifteen minutes to implement. And it blocks an entire class of reconnaissance that feeds everything from targeted phishing to credential stuffing at scale.

Fix your login page. Make it boring. Boring login pages are safe login pages.

---

*Got an enumeration war story, or found a subtle variant I didn't cover? Hit me up on [Twitter/X](https://twitter.com/iamanuragh) or connect on [LinkedIn](https://linkedin.com/in/anuragh). I read everything.*
