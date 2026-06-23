---
title: "🔐 OIDC vs OAuth: What You Actually Need to Know"
date: 2026-06-23
excerpt: "OAuth doesn't authenticate users — OIDC does. If your app is using OAuth to log people in, you're doing it wrong. Here's the real difference and what to use when."
tags:
  - security
  - authentication
  - oauth
  - oidc
  - web-security
featured: true
---

Let me tell you about a bug I once traced to a fundamental misunderstanding baked into an app's architecture: an API was using a raw OAuth access token to identify the logged-in user. It worked in dev, passed code review, and shipped to production. It also meant that if an attacker got hold of a valid access token for *any* resource — say, your calendar API — they could impersonate you in the app.

The developer wasn't careless. They'd just confused OAuth with authentication. Most people do. The names don't help.

## The Core Confusion

Here's the TL;DR nobody bothers to say clearly:

> **OAuth is an authorization protocol. OIDC is an authentication protocol built on top of OAuth.**

OAuth answers: *"Can this app access this resource on your behalf?"*  
OIDC answers: *"Who are you?"*

If your app is asking "who is this user?", OAuth alone is not your answer. OIDC is.

This isn't pedantic. The distinction has real security consequences.

## What OAuth Actually Does

OAuth 2.0 (the relevant version) is a delegation framework. A user grants an application permission to access something — your Google Drive, your GitHub repos, your Stripe account — without handing over their password.

The app gets an **access token**. That token says: *"the bearer of this token may do X on behalf of user Y."* It says nothing reliable about identity.

Why unreliable? Because:

1. Access tokens are opaque by default — you can't decode them safely to get user identity.
2. Even if a token happens to be a JWT with a `sub` claim, that claim is scoped to the resource server, not necessarily your app.
3. The token could have been issued for a completely different application.

Using an access token to authenticate a user is a bit like using someone's gym key card to confirm they live at your address. It tells you something — but not that.

## What OIDC Adds

OpenID Connect layers an identity layer on top of OAuth 2.0. It introduces one critical addition: the **ID token**.

The ID token is a JWT issued specifically to identify the user to **your** application. It contains:

- `sub` — a stable, unique identifier for the user
- `aud` — your client ID (so you know it was issued *for your app*)
- `iss` — the identity provider's URL
- `iat` / `exp` — when it was issued and when it expires
- Optional: `email`, `name`, `picture`, etc.

Here's what a minimal OIDC token exchange looks like:

```python
# After the authorization code callback, exchange the code
import requests

token_response = requests.post(
    "https://auth.example.com/oauth/token",
    data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
)

tokens = token_response.json()

# OAuth gives you this — for calling APIs
access_token = tokens["access_token"]

# OIDC gives you this — for identifying the user
id_token = tokens["id_token"]
```

You **verify** the ID token (signature, issuer, audience, expiry) and then trust its claims. You do NOT do the same with an access token.

## Validating the ID Token — Where Devs Cut Corners

The part people mess up: actually verifying the ID token rather than just decoding it.

```python
from jose import jwt
import requests

# Fetch the provider's public keys (cache these!)
jwks_uri = "https://auth.example.com/.well-known/jwks.json"
jwks = requests.get(jwks_uri).json()

# Verify: signature, issuer, audience, expiry
claims = jwt.decode(
    id_token,
    jwks,
    algorithms=["RS256"],
    audience=CLIENT_ID,
    issuer="https://auth.example.com",
)

user_id = claims["sub"]
email = claims.get("email")
```

Skipping the `audience` check is the most common mistake. Without it, an ID token issued for *another application* at the same provider would be accepted. If two apps share a provider, an attacker could use an ID token from App A to log into App B. At Cubet, we hit exactly this edge case when two internal tools shared a Keycloak realm but had different client IDs — the audience check was the only thing standing between them.

## When to Use What

The rule is simple:

| Goal | Use |
|---|---|
| Log a user into your app | OIDC (get an ID token) |
| Call a third-party API on the user's behalf | OAuth (get an access token) |
| Both | OIDC flow — you get both tokens |

If you're building "Sign in with Google", you want OIDC. Google's OAuth scope `openid` triggers the OIDC extension and gives you an ID token alongside the access token.

If you're building an app that also needs to read the user's Gmail — you want OIDC for login *plus* the `https://www.googleapis.com/auth/gmail.readonly` scope for the API access.

## The UserInfo Endpoint Trap

OIDC also defines a `/userinfo` endpoint — you call it with an access token and it returns user claims. Some developers skip ID token validation entirely and just call `/userinfo` instead.

This works but has a gotcha: the userinfo endpoint requires a network call every time you need to identify the user. The ID token is self-contained and verifiable locally (once you've cached the provider's JWKS). For anything at scale, token-local verification is dramatically faster.

Use the userinfo endpoint when:
- You need claims that aren't in the ID token (providers vary in what they embed)
- You want a fresh assertion of identity (the ID token could be minutes old)

Verify the ID token first. Call userinfo only when you need something it doesn't have.

## The Practical Checklist

Before you ship your auth flow:

- [ ] Are you requesting the `openid` scope? (That's what turns OAuth into OIDC)
- [ ] Are you validating the ID token's `iss`, `aud`, and `exp`?
- [ ] Are you using the ID token (not the access token) to identify the user?
- [ ] Are you storing `sub` (not `email`) as the stable user identifier? Emails change; `sub` doesn't.
- [ ] Are you caching the provider's JWKS instead of fetching on every request?

The last one trips teams more than you'd think. Fetching JWKS on every token verification is a latency bomb and a single point of failure. Cache with a short TTL — 15 minutes is fine for most providers.

## The Bottom Line

OAuth and OIDC are not interchangeable. One is for delegation, one is for identity — and mixing them up leads to auth bugs that are subtle, hard to reproduce, and potentially exploitable.

When you need "who is this person", reach for OIDC. Request the `openid` scope, get the ID token, verify it properly (signature + iss + aud + exp), and use `sub` as the user's identity anchor.

Everything else — calling APIs, requesting scopes, managing access tokens — is the OAuth layer underneath. Useful, necessary, but not identity.

Understand the stack and use each layer for what it's built for.

---

Found this useful? I write about web security, backend architecture, and the bugs we ship by accident — follow me on [X/Twitter](https://x.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). And if your auth flow currently uses an access token to identify users... now's a good time to fix that.
