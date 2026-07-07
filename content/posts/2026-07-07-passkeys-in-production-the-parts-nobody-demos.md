---
title: "🔑 Passkeys in Production: The Parts Nobody Demos"
date: "2026-07-07"
excerpt: "Passkeys demo beautifully — tap your fingerprint, you're in, no password in sight. Then you ship it and discover account recovery, cross-device sync, and 'what happens when the authenticator is gone' are entirely your problem now."
tags: ["security", "authentication", "passkeys", "webauthn", "session-security"]
featured: true
---

Every passkey demo follows the same script. Someone opens a laptop, taps Touch ID, and boom — logged in, no password typed, crowd goes wild. It looks like magic because the demo is carefully engineered to show you the one path that always works: same device, same browser, freshly registered, nothing has gone wrong yet.

Nothing has gone wrong yet is doing a lot of work in that sentence.

I spent a chunk of this year at Cubet helping migrate a customer-facing app from "password + optional 2FA" to passkey-first auth. The WebAuthn ceremony itself took an afternoon. The stuff around it — recovery, sync, session binding, the users who show up on a work laptop that gets wiped every six months — took weeks. Nobody warns you about that part, so let's talk about it.

## The Ceremony Is the Easy Bit

Registration and authentication with WebAuthn really is short. Client side, you're mostly gluing together `navigator.credentials.create()` and `navigator.credentials.get()`:

```js
// Registration: browser asks the authenticator to mint a keypair
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: base64ToBuffer(serverChallenge),
    rp: { name: "0x55aa", id: "iamanuragh.in" },
    user: {
      id: base64ToBuffer(userId),
      name: user.email,
      displayName: user.name,
    },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  },
});

// Send credential.id, credential.response.attestationObject,
// and clientDataJSON to your server for verification and storage.
```

Server side, you verify the attestation, store the public key and credential ID against the user, and you're done with registration. Login is the mirror image — request a challenge, sign it with the private key the authenticator never lets leave the device, verify the signature server-side. No password ever crosses the wire. Phishing a passkey is functionally impossible because the credential is scoped to the origin — a lookalike domain just doesn't get a signature.

That part genuinely is as good as the marketing says. The private key never existing on your server is a real, structural improvement over anything password-based. This is not the part that bit us.

## Where It Actually Gets Hard

**Recovery is now an identity problem, not a "forgot password" email.** With passwords, losing access means "reset via email, verify, set a new one." With passkeys, if someone loses their only enrolled authenticator — phone stolen, laptop wiped, they switched from Android to iOS and the sync didn't carry over how they expected — you need a fallback that doesn't quietly become a phishing-resistant system with a phishable back door. We ended up requiring at least two enrolled authenticators before disabling the password fallback for an account, and building an explicit "add a backup passkey" nag into settings. Skip this and your support queue fills up with people permanently locked out of their own accounts.

**Sync is a vendor decision, not a spec detail.** Platform passkeys sync via iCloud Keychain, Google Password Manager, or a third-party manager, and that sync behaves differently across ecosystems. A passkey created on an Android phone doesn't just appear on a Windows desktop unless the user explicitly does something (QR-code cross-device auth, which itself is its own UX cliff). We had users assume passkeys were "in the cloud" the way passwords felt like they were, and get confused when a new device had none of them. Set expectations in your UI copy — don't let users discover this mid-login.

**A passkey login still ends with a session cookie, and that cookie is still your weakest link.** This is the part that's easy to forget: WebAuthn solves credential theft, not session theft. Once the ceremony succeeds, you issue a session token like you always did, and if that token is stealable via XSS or a misconfigured `SameSite` attribute, none of the passkey rigor matters.

```js
// The auth ceremony was phishing-resistant.
// This part still needs to be attacker-resistant too.
res.cookie("session", sessionToken, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  maxAge: 60 * 60 * 8, // bind session lifetime to something sane
});
```

Treat the moment right after WebAuthn verification the same way you'd treat it after any other successful login: rotate the session identifier, bind it to enough context (IP range, UA fingerprint) to make replay annoying, and give it a real expiry. Passkeys upgrade *how* someone proves who they are. They do nothing for *what happens after* — that's still ordinary session hygiene, and it's still the part attackers go after because it's usually softer than the shiny new auth ceremony protecting it.

## What I'd Tell Past Me

Budget real time for recovery flows and cross-device edge cases — they'll take longer than the WebAuthn integration itself. Keep a password (or magic-link) fallback available but rate-limited and monitored, rather than pretending you can go passwordless on day one. And don't let "we added passkeys" become an excuse to get lazy about session cookie flags, rotation, and expiry — that layer is still doing the same job it always did, passkeys or not.

Passkeys are a real improvement. Just ship them like the auth system they are, not like the demo you saw at a conference.

---

Rolling out passkeys and hit a weird edge case? I want to hear it — find me on [Twitter/X](https://twitter.com/kpanuragh) or [GitHub](https://github.com/kpanuragh). And if your app still only offers passwords, this is your sign to at least start the conversation with your team. 🔐
