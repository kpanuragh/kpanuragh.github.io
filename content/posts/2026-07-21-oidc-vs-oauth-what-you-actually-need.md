---
title: "🪪 OAuth Isn't Login. OIDC Is. Here's Why That Mix-Up Keeps Shipping to Prod"
date: "2026-07-21"
excerpt: "\"Login with Google\" isn't OAuth, no matter how many tutorials call it that. OAuth was never designed to answer \"who is this user\" — and every team that uses it that way ends up building a shakier version of OIDC by accident."
tags:
  - security
  - authentication
  - oauth
  - oidc
  - web-development
featured: true
---

# 🪪 OAuth Isn't Login. OIDC Is. Here's Why That Mix-Up Keeps Shipping to Prod

Here's a sentence that should make you flinch a little: "we added login with Google using OAuth."

No, you didn't. You *can't* — not really. OAuth 2.0 has no concept of "who is logged in." It has no identity, no user profile, no notion of "this is a person and they are who they claim to be." OAuth answers exactly one question: **"does this app have permission to act on a resource on someone's behalf?"** That's it. It's an authorization protocol, not an authentication one. If your login flow works, it's because you (or, more likely, a library you imported) bolted identity semantics onto a protocol that was never built to carry them — which is exactly the mess OpenID Connect (OIDC) exists to fix.

## The Tell: What Does the Token Actually Say?

Pure OAuth gives your app an **access token**. That token's entire job is to get handed to an API — "here, this proves I'm allowed to read this user's Google Calendar." The access token is opaque to your app in spirit; you're not supposed to inspect it or trust claims inside it, you're supposed to hand it to the resource server and let *it* decide if the token is good.

Nowhere in that exchange does anything tell *your app* who the user is. Teams that "do login with OAuth" typically improvise one of two hacks:

1. Take the access token, call the provider's `/userinfo`-shaped endpoint, and treat whatever comes back as gospel identity.
2. Decode the access token itself (if it happens to be a JWT) and start reading claims out of it — claims that were never guaranteed to be there or stable, because the spec doesn't promise you an identity payload at all.

OIDC's whole contribution is boringly simple and exactly why it matters: it adds a second, standardized token — the **ID token** — whose entire purpose is answering "who is this." It's always a JWT, it's always signed, and it has a spec-mandated shape:

```json
{
  "iss": "https://accounts.google.com",
  "sub": "110169484474386276334",
  "aud": "your-client-id.apps.googleusercontent.com",
  "exp": 1751000000,
  "iat": 1750996400,
  "email": "user@example.com",
  "email_verified": true,
  "nonce": "n-0S6_WzA2Mj"
}
```

`sub` is the durable, stable user identifier — not the email, which can change. `aud` tells you this token was minted for *your* client specifically. `nonce` ties the token back to the specific login request you started, which is the piece that stops replay. None of this exists in plain OAuth, because plain OAuth was never supposed to answer this question.

## The Bug This Confusion Actually Causes

This isn't pedantry for its own sake — the access-token-as-identity shortcut has a concrete failure mode: **audience confusion**. If your backend accepts any valid access token from a provider as proof of identity, without checking who that token was issued *for*, you've opened the door to token substitution. A malicious app that gets a user to authorize it for an unrelated scope now holds a legitimate, provider-signed access token for that user — and if your login endpoint doesn't check `aud`, it'll happily treat that token as "yes, this is the user, log them in."

This is precisely the class of bug OIDC's ID token closes, because `aud` and `nonce` are non-negotiable parts of verifying it. When I've reviewed login flows at Cubet that were built directly against a raw OAuth provider (skipping an OIDC-aware library because "we just needed login, not scopes"), this is the exact gap that shows up — someone validated that the token was *signed by the right issuer* and stopped there, without checking it was signed *for this app*.

Verifying it properly looks like this — and note it's checking things plain OAuth access tokens don't even guarantee exist:

```javascript
const { payload } = await jwtVerify(idToken, JWKS, {
  issuer: 'https://accounts.google.com',
  audience: process.env.GOOGLE_CLIENT_ID, // catches token-substitution
});

if (payload.nonce !== sessionNonce) {
  throw new Error('nonce mismatch — possible replay');
}

// only now is payload.sub safe to treat as "this user"
```

## So When Do You Actually Want Plain OAuth?

Genuinely: when you need delegated access to a resource, not a login. If your app needs to read someone's Google Drive files, post to their Slack, or pull their GitHub repos on their behalf, that's a real OAuth job — you want an access token scoped to `drive.readonly` or whatever, and you don't care about the user's identity beyond "did they authorize this." Plenty of legitimate integrations are pure OAuth and should stay that way; forcing OIDC into a pure API-delegation flow just adds an unused token you have to store and rotate for no benefit.

The rule of thumb that's saved me from overthinking this: **if your next sentence after the token exchange is "...and now show them their dashboard," you need OIDC's ID token. If it's "...and now call this API on their behalf," plain OAuth access tokens are the right and sufficient tool.** Most real apps need both — an ID token to establish the session, and an access token to actually do delegated work afterward — which is exactly why OIDC is layered *on top of* OAuth 2.0 instead of replacing it.

The fix for the audience-confusion bug above isn't "write your own JWT verification" — it's "use an OIDC client library that refuses to skip audience and nonce checks," because rolling your own is how this keeps happening in the first place.

---

Got a login flow that quietly trusts an access token as identity? Worth a five-minute audit before someone else finds the gap for you. I write about this kind of thing regularly — find me on [GitHub](https://github.com/kpanuragh), [LinkedIn](https://www.linkedin.com/in/anuraghkp), or [Twitter/X](https://twitter.com/anuragh_kp) if you want to argue about token scoping.
