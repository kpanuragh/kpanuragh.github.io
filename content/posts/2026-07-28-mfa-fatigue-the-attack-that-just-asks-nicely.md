---
title: "🔔 MFA Fatigue: The Attack That Just Asks Nicely"
date: "2026-07-28"
excerpt: "You rolled out push-based MFA and called authentication solved. Then someone hammered a user with 50 approval prompts at 2 a.m. until they tapped 'Approve' just to make it stop. Here's why push MFA fails quietly, and how to build it so it doesn't."
tags: ["authentication", "mfa", "security", "session-security", "appsec"]
featured: true
---

Somewhere right now, someone is rolling out push-based MFA and feeling great about it. No more SMS codes, no more "enter this 6-digit number before it expires," just a friendly notification: *"Approve sign-in?"* Tap yes, get in. Users love it. Support tickets drop. Everybody's happy.

And then an attacker who already has the password — from a breach dump, a phishing kit, a stealer log, take your pick — sits there and hits "request login" fifty times in a row at 2 a.m. The user's phone lights up over and over. Eventually, half-asleep and annoyed, they tap Approve just to make the buzzing stop.

That's it. That's the whole attack. No exploit, no zero-day, no clever payload. Just... asking, repeatedly, until a tired human gives in. Security people call it MFA fatigue or push bombing, and it's not theoretical — it's how Uber's 2022 breach happened, and Cisco's, and a chunk of the Lapsus$ spree. The attacker didn't beat the cryptography. They beat the human sitting next to it.

## Why "just add MFA" isn't the finish line

The mental model a lot of teams have is: password = weak factor, push notification = strong factor, two factors = solved. But a push prompt that just says "approve or deny" with no context is barely a factor at all — it's a coin flip mediated by how annoyed the victim is. The naive implementation looks something like this:

```javascript
app.post("/mfa/push", async (req, res) => {
  const { userId } = req.body;
  await sendPushNotification(userId, {
    title: "Sign-in request",
    body: "Tap to approve",
  });
  res.json({ status: "pending" });
});
```

Nothing here rate-limits the attacker, nothing tells the user *where* the login is coming from, and nothing stops a script from calling this endpoint in a loop. From the attacker's side, this is free — every failed tap costs them nothing, and every annoyed tap costs them everything.

## Rate-limit the *ask*, not just the *answer*

Most teams rate-limit login attempts (wrong passwords) religiously and completely forget to rate-limit MFA challenge requests themselves. If the password is already leaked, the "wrong password" limiter never even fires — the attacker sails past it every time with a correct password and just spams the second factor.

```javascript
const pushAttempts = new Map(); // userId -> { count, windowStart }

function isPushBombing(userId) {
  const now = Date.now();
  const entry = pushAttempts.get(userId) ?? { count: 0, windowStart: now };

  if (now - entry.windowStart > 5 * 60 * 1000) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  pushAttempts.set(userId, entry);

  return entry.count > 3; // more than 3 pushes in 5 minutes? lock it down.
}

app.post("/mfa/push", async (req, res) => {
  const { userId } = req.body;

  if (isPushBombing(userId)) {
    await lockMfaChallenges(userId, { minutes: 15 });
    await notifySecurityTeam(userId, "possible MFA fatigue attack");
    return res.status(429).json({ status: "locked" });
  }

  await sendPushNotification(userId, buildContextualPrompt(req));
  res.json({ status: "pending" });
});
```

Three pushes in five minutes and unanswered is a strong signal something's wrong — a legitimate user retrying a flaky connection doesn't usually generate that pattern, and if they do, locking for 15 minutes with an in-app explanation is a much better outcome than a silent account takeover.

## Make the prompt say something

The other half of the fix is number matching — instead of a blind "Approve/Deny" button, show the user a two-digit number on the login screen that they have to enter into the notification. It sounds small, but it forces the person tapping the phone to actually be looking at the login screen at the same time, which kills the "spam them while they're asleep" version of the attack outright.

```javascript
function buildContextualPrompt(req) {
  const code = String(Math.floor(10 + Math.random() * 90)); // 10-99
  stashExpectedCode(req.body.userId, code, { ttlSeconds: 60 });

  return {
    title: `Sign-in from ${req.geo.city}, ${req.geo.country}`,
    body: `Enter ${code} to approve — device: ${req.device.name}`,
    metadata: { ip: req.ip, timestamp: Date.now() },
  };
}
```

Microsoft made this the default for Authenticator after their own fatigue-attack incidents, and it's genuinely one of the highest-value, lowest-effort changes you can make to an existing push MFA rollout — no new hardware, no new enrollment flow, just a smarter prompt.

## The actual lesson

MFA fatigue isn't a flaw in the cryptography of your second factor — the push notification itself is perfectly secure. It's a flaw in treating "add a second factor" as a checkbox instead of a UX and abuse-prevention problem. At Cubet, the rule of thumb we settled on for any push-based auth flow is: if an attacker can trigger the challenge for free, an unlimited number of times, with zero context shown to the user, you haven't added a factor — you've added a doorbell they can lean on all night.

Rate-limit the request, not just the response. Show context in the prompt. And if you're auditing an existing MFA rollout today, go check whether your push endpoint has *any* throttling on it at all — a lot of them don't, and that's the gap that gets exploited first.

Got a war story about push-bombing or MFA rollout pain? Find me on [GitHub](https://github.com/kpanuragh) or [Twitter/X](https://twitter.com/anuragh_kp) — always curious how other teams are handling this.
