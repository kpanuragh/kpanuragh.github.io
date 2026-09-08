---
title: "🔑 Passkeys: The Password Killer That Might Actually Work"
date: "2026-09-08"
excerpt: "We've been promised the death of passwords for a decade. Passkeys might finally deliver — here's how WebAuthn actually works under the hood, why it beats magic links and OTPs on phishing resistance, and where it still bites you in production."
tags: ["security", "authentication", "webauthn", "passkeys"]
featured: true
---

Every few years someone declares the password dead. Biometrics were supposed to kill it. Magic links were supposed to kill it (spoiler: they didn't, they just moved the attack surface into your inbox). Even SMS OTPs got a turn, right before we found out SIM-swapping is a thriving industry.

Passkeys are the first contender I've actually believed. Not because Apple and Google put pretty UI on top of it, but because the underlying primitive — WebAuthn / FIDO2 — is structurally different from everything that came before. It doesn't just make phishing *harder*. It makes the classic phishing attack **impossible to execute**, by construction.

Let's get into why, and where it still isn't magic.

## The trick: the browser won't let you phish it

Every prior "secure" auth mechanism — passwords, OTPs, magic links — has the same fatal flaw: the secret (or the proof of the secret) travels from the user's brain or inbox, through the user's own judgment, into a form. If an attacker builds a convincing fake login page, the user happily hands over the OTP, the password, or clicks the magic link on the phisher's relay.

WebAuthn sidesteps this by never giving the user something transferable in the first place. During registration, the browser generates a public/private keypair scoped to the *origin* (the exact domain) that requested it. The private key never leaves the device — it's usually sealed in a secure enclave or TPM. The server only ever stores the public key.

```javascript
// Registration: ask the browser to create a keypair for this origin
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: randomChallengeFromServer,
    rp: { name: "0x55aa", id: "iamanuragh.in" },
    user: { id: userIdBytes, name: "anuragh@example.com", displayName: "Anuragh" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  },
});
// credential.response.attestationObject → send to server, store the public key
```

Here's the part that kills phishing dead: `rp.id` is bound into the credential. If a phishing site at `iamanuragh-in.com` tries to trigger authentication, the browser's WebAuthn implementation checks the requesting origin against the credential's bound origin *before it ever asks the authenticator to sign anything*. There's no dialog to trick the user into approving on the wrong domain — the browser simply won't offer the credential. Compare that to a magic link, where the user is the one manually eyeballing a URL under time pressure and getting it wrong.

## Login is a signature, not a secret exchange

Authentication looks almost identical, just in reverse:

```javascript
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge: randomChallengeFromServer,
    rpId: "iamanuragh.in",
    userVerification: "required",
  },
});
// assertion.response.signature → server verifies against stored public key
```

The server verifies the signature against the stored public key, checks the challenge matches (replay protection) and that the origin matches. Nothing secret ever crossed the network. Even if you full-on man-in-the-middle the TLS session (somehow), there's no credential to steal — only a signed, single-use challenge that's useless a second later.

## Where it still isn't a free lunch

I rolled passkeys out for an internal admin panel at Cubet Techno Labs last year, and the two things that bit us weren't cryptography — they were UX and recovery:

1. **Account recovery becomes the new attack surface.** If a user loses their device, "recover access" has to fall back to *something* — email, SMS, a support ticket. Whatever that fallback is, it's now your actual security floor, no matter how strong the passkey crypto is. We ended up requiring a second registered passkey (phone + hardware key) before disabling email-based recovery entirely for privileged accounts.

2. **Synced vs. device-bound passkeys are a real policy decision.** Apple/Google/Microsoft sync passkeys across a user's devices via their cloud account (iCloud Keychain, Google Password Manager). Convenient, but it means the private key's blast radius is now "however well-protected the user's Apple/Google account is," not "however well-protected this one device is." For anything genuinely high-value, device-bound authenticators (hardware security keys, `authenticatorAttachment: "cross-platform"`) are still the stronger guarantee — you're trading convenience for a slightly different trust model, not eliminating trust altogether.

3. **Not every browser/OS combo plays nice, still.** Conditional UI (the autofill-style passkey prompt) support varies enough across older Android WebViews and embedded browsers that we still keep a password fallback for the long tail. Passwordless-only rollouts sound great until support tickets remind you 4% of your users are on a locked-down corporate browser from 2019.

## The actual takeaway

Passkeys aren't "biometrics as a marketing gimmick" — Face ID / fingerprint is just the *local unlock* for the private key, not the credential itself. The real win is that the trust decision (does this origin match?) happens in code, at the protocol layer, instead of in a tired human's head at 8am glancing at a URL bar. That's the first auth mechanism in a while that removes an entire *class* of attack instead of just raising the cost of it.

If you're building anything user-facing in 2026 and haven't looked at `@simplewebauthn/server` or your platform's native passkey APIs, it's worth the afternoon. Your users will thank you, and so will whoever's on call when the next credential-stuffing wave hits.

Got war stories from rolling out passkeys, or a recovery-flow disaster you want to swap notes on? Find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp) — always happy to talk auth.
