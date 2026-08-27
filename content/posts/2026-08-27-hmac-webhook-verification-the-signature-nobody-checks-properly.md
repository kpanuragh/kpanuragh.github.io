---
title: "✍️ HMAC Webhook Verification: The Signature Nobody Checks Properly"
date: "2026-08-27"
excerpt: "Your webhook endpoint accepts POST requests from Stripe, GitHub, or Twilio. Anyone else on the internet can send the exact same POST request. HMAC signatures are the only thing standing between 'trusted event' and 'anonymous JSON from a stranger' — if you actually verify them right."
tags: ""
featured: "true"
---

# ✍️ HMAC Webhook Verification: The Signature Nobody Checks Properly

Here's a fact that should bother you more than it probably does: your `/webhooks/stripe` endpoint has a public URL, accepts `POST`, and parses JSON. So does literally anyone with `curl`. There's nothing about the URL itself that says "only Stripe is allowed to hit this." The only thing separating a legitimate payment event from a stranger typing `curl -X POST` and inventing a fake `checkout.session.completed` payload is one HTTP header you might not even be checking correctly.

That header is the HMAC signature. And I've reviewed enough webhook handlers at this point to tell you the failure mode isn't "we forgot to verify it." It's almost always "we verify it, technically, in a way that doesn't actually protect anything."

## What HMAC Is Actually Doing Here

HMAC (Hash-based Message Authentication Code) proves two things at once: the payload wasn't tampered with, and it was sent by someone who knows a shared secret. The sender computes a keyed hash of the raw request body and sticks it in a header. You recompute that same hash on your end with the same secret, and if the two match, the request is authentic.

```js
const crypto = require('crypto');

function computeSignature(secret, rawBody) {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}
```

Simple enough. The bugs never live in this function. They live in everything around it.

## Bug #1: You're Hashing the Wrong Body

The single most common webhook bug I see is verifying the signature against `JSON.stringify(req.body)` instead of the *raw bytes* that were actually sent. Express (and most frameworks) parse the body into an object before your handler ever sees it — and re-serializing that object doesn't guarantee byte-for-byte equality with what the sender originally hashed. Different key ordering, different whitespace, a trailing newline — any of it breaks the hash, and now you either reject legitimate traffic or, worse, someone "fixes" the flaky verification by loosening it until it silently stops checking anything.

```js
// Wrong: body has already been parsed and re-serialized
app.use(express.json());
app.post('/webhooks/github', (req, res) => {
  const expected = computeSignature(SECRET, JSON.stringify(req.body)); // ❌
  // ...
});

// Right: capture the raw bytes before parsing touches them
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.post('/webhooks/github', (req, res) => {
  const expected = computeSignature(SECRET, req.body); // req.body is a Buffer here
  const signature = req.headers['x-hub-signature-256']?.replace('sha256=', '');
  if (!timingSafeEqual(expected, signature)) return res.sendStatus(401);
  const payload = JSON.parse(req.body); // parse only after verifying
  // ...
});
```

Verify first, parse second. If you parse and re-stringify before hashing, you're not verifying the request Stripe sent — you're verifying your own interpretation of it, which is a much weaker claim.

## Bug #2: `===` Is Not a Comparison Function, It's a Timing Oracle

This one's subtler and it's the one that actually shows up in security write-ups. If you compare signatures with `expected === signature`, JavaScript's string comparison typically short-circuits on the first mismatched character. That means comparing a *correct* first byte takes marginally longer than comparing a *wrong* first byte — and with enough requests and enough patience, an attacker can measure that timing difference and brute-force the signature one byte at a time.

This isn't theoretical paranoia. It's why every crypto library ships a constant-time comparison function, and why you should always reach for it instead of the obvious operator:

```js
function timingSafeEqual(expectedHex, receivedHex) {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(receivedHex || '', 'hex');
  if (a.length !== b.length) return false; // lengths differ, still safe to bail
  return crypto.timingSafeEqual(a, b);
}
```

Note the length check happens before the timing-safe compare, not instead of it — `crypto.timingSafeEqual` throws if buffer lengths don't match, so you handle that case explicitly rather than letting an exception become an unhandled 500 that an attacker can also fingerprint.

## Bug #3: No Replay Protection

A valid signature only proves the payload was signed by someone with the secret at some point. It says nothing about *when*. If an attacker captures a legitimate webhook request (via a compromised proxy, a logging pipeline that shouldn't have captured it, a misconfigured CDN cache — pick your incident), they can replay that exact request forever and your endpoint will happily accept it again and again, because the signature still checks out.

This is why Stripe, GitHub, and most mature providers include a timestamp in the signed payload, not just in a separate header you could ignore:

```js
function verifyWithFreshness(secret, rawBody, header, toleranceSeconds = 300) {
  const [tPart, sigPart] = header.split(',');
  const timestamp = tPart.split('=')[1];
  const signature = sigPart.split('=')[1];

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = computeSignature(secret, signedPayload);

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false; // stale, reject even if signature matches

  return timingSafeEqual(expected, signature);
}
```

The timestamp being *part of the signed content* matters — if you only check a separate `X-Timestamp` header against your clock without including it in the hash, an attacker can just swap in a fresh timestamp on a replayed request and the signature check won't notice.

## Bug #4: The Secret Lives Somewhere It Shouldn't

None of the cryptography matters if the webhook secret is sitting in a `.env` file that got committed three months ago, or hardcoded as a fallback value ("if env var missing, use `'dev-secret-123'`" — I have genuinely seen this ship to production). Treat webhook secrets exactly like API keys: pull them from a secrets manager, rotate them when a provider supports it, and never log the raw header value even at debug level, because debug logs have a way of ending up somewhere searchable.

On my team at Cubet, the rule we landed on after a near-miss with a logging pipeline capturing signature headers is boring but effective: webhook secrets get the same handling as database credentials — same vault, same rotation cadence, same "nobody puts this in an error message" policy. It's not glamorous, but glamorous is not really what secrets management is for.

## The Checklist

If you're standing up a new webhook receiver, or auditing one that's already live, run through this:

1. Verify against the **raw request body**, captured before any JSON parsing middleware touches it.
2. Compare signatures with a **constant-time comparison**, never `===` or `==`.
3. Include a **timestamp in the signed payload** and reject anything outside a tolerance window (5 minutes is a common default).
4. Store the secret in a **proper secrets manager**, not an env file with a hardcoded fallback.
5. **Reject before you parse.** If the signature is bad, don't hand the body to `JSON.parse` at all — fail closed, fast, and boring.

Webhook signature verification is one of the rare cases in security where the correct implementation is genuinely short — maybe 15 lines. The failure mode isn't complexity, it's that those 15 lines get written once, pass a happy-path test with a real Stripe event, and then nobody looks at them again until someone finds out the hard way that `JSON.stringify` isn't the same as "the bytes on the wire."

---

Got a webhook horror story, or a signature bug you've caught in code review? I'd like to hear it — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp/). And if this saved you from shipping a `===` comparison, that's basically a public service — share it with whoever owns your webhook endpoints.
