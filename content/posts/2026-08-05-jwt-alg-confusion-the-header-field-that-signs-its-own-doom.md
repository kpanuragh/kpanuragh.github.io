---
title: "🎭 JWT Alg Confusion: The Header Field That Signs Its Own Doom"
date: "2026-08-05"
excerpt: "Your JWT library trusts the token to tell it how to verify itself. That's the whole bug. A one-word change to the `alg` header can turn your RS256 public key into an HMAC secret, and suddenly every user is you. Here's how alg confusion actually works, and the three lines of config that kill it dead."
tags:
  - security
  - api-security
  - jwt
  - appsec
  - authentication
featured: true
---

# 🎭 JWT Alg Confusion: The Header Field That Signs Its Own Doom

Here's a sentence that should never be true, and yet: the token you're using to authenticate a request also gets to decide *how it should be checked for authenticity*. That's not a metaphor, it's literally how the `alg` field in a JWT header works in a lot of default library setups, and it's the reason "alg confusion" has been quietly popping up in bug bounty reports for the better part of a decade.

If you've never run into it, the short version sounds almost too dumb to be real: change one word in a JWT header, and some servers will happily verify a forged token as legitimate — using a key they were never supposed to trust for that purpose. Let's break down why, because the "why" is what makes it stick.

## The setup: two signing worlds, one field deciding between them

JWTs support two very different families of signing algorithms:

- **Asymmetric** (RS256, ES256): the server signs with a *private* key and verifies with a *public* key. The public key can be handed out to anyone — that's the whole point, it's public.
- **Symmetric** (HS256): the same secret is used to both sign and verify. If you know the secret, you can mint tokens.

A well-behaved server picks one algorithm for a given key and hardcodes it. A poorly-configured one reads the `alg` field out of the *token itself* and asks its JWT library "verify this using whatever the token says to use." That second pattern is the entire vulnerability.

```json
{
  "alg": "RS256",
  "typ": "JWT"
}
```

Change that to:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

...and then sign the token using **the server's own RS256 public key as the HMAC secret**. If the verification code does something like `jwt.verify(token, publicKey)` without pinning the expected algorithm, the library dutifully treats `publicKey` as an HMAC secret string, computes an HMAC signature, and — since you signed it with the exact same string — it matches. Congratulations, you've just forged a valid signature on an arbitrary payload, and the public key that was supposed to be safe to share turned into the skeleton key.

## Why the public key even works as a valid secret

This is the part people find hard to believe the first time: public keys are just... text. A PEM-encoded RSA public key is a big base64 blob wrapped in `-----BEGIN PUBLIC KEY-----`. HMAC doesn't care what its secret "means" semantically — it's just bytes fed into a hash function. So if an attacker can get their hands on your public key (which, again, is meant to be public — it's often served at a `/.well-known/jwks.json` endpoint on purpose), they have everything they need to sign a token your server will accept as HS256-valid.

The vulnerable code usually looks something like this in Node with `jsonwebtoken`:

```js
// VULNERABLE: alg is whatever the attacker's token claims
const payload = jwt.verify(token, publicKey);
```

The fix is to stop letting the token pick its own verification method:

```js
// SAFE: server dictates the algorithm, ignores what the token claims
const payload = jwt.verify(token, publicKey, {
  algorithms: ["RS256"],
});
```

That `algorithms` array isn't optional decoration — it's the whole mitigation. Without it, `jsonwebtoken` (and plenty of libraries in other languages had the same footgun before 2018-ish) inspects the header's `alg` and branches its verification logic accordingly. With it, the library refuses to even attempt verification under any algorithm you didn't explicitly allow, no matter what the header claims.

## The "none" algorithm variant, because of course there's one

Alg confusion has a sibling bug that's even more absurd: JWT's spec technically defines `"alg": "none"`, meaning "this token is unsigned, don't bother checking." Some early library implementations honored that literally — strip the signature, set `alg: none`, and the token sails through with zero cryptographic verification at all. It's the security equivalent of a bouncer who lets you in because you wrote "I'm on the list" on a napkin.

Modern libraries reject `none` by default now, but it's worth explicitly testing for on any homegrown or older auth service, especially anything glued together from a five-year-old Stack Overflow answer.

## Where this actually bites in production

At Cubet, we caught a version of this during a security review of a partner-facing API gateway — not a live exploit, but a config audit before a client's compliance deadline. The service validated tokens issued by an external identity provider and verified them using the IdP's published RSA public key, but the verification call didn't pin `algorithms: ["RS256"]`. Nobody had exploited it, but the JWKS endpoint was public by design (as it should be), which meant the ingredients for a forged-HMAC token were sitting in plain sight. One line of config closed it, and it went into the same PR as two other "this shouldn't be possible but technically is" findings from that audit.

The pattern to watch for isn't just JWT-specific, either — it generalizes to "never let untrusted input choose its own validation path." Same family of bug as letting a `Content-Type` header decide your parser, or letting a redirect URL decide which domain allowlist check runs. If the attacker controls the field that selects the security policy, they've already won half the fight.

## Three things to actually check today

1. **Pin the algorithm explicitly** in every `jwt.verify()` call — never trust the header's `alg` field to select behavior.
2. **Use separate key material per algorithm family** if you must support both RS256 and HS256 anywhere (ideally: don't support both on the same endpoint at all).
3. **Reject `alg: none`** explicitly even if your library claims to block it by default — test it, don't assume it.

None of this requires a rewrite. It requires reading the third argument of a function you probably called once, two years ago, and haven't looked at since.

Found a JWT verification path in the wild that skipped the `algorithms` allowlist? I'd genuinely like to see it (redacted, obviously). Find me on [GitHub](https://github.com/kpanuragh), [Twitter/X](https://twitter.com/anuragh_kp), or [LinkedIn](https://linkedin.com/in/anuraghkp).
