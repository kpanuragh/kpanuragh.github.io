---
title: "🧠 Threat Modeling for Tired Engineers: The 20-Minute Version That Actually Ships"
date: "2026-07-05"
excerpt: "Real threat modeling doesn't require a whiteboard workshop, a STRIDE certification, or four hours you don't have. Here's the stripped-down version that fits into a sprint and still catches the bug that would've paged you at 2am."
tags: ["threat-modeling", "security", "incident-response", "appsec", "engineering"]
featured: true
---

Ask most engineers what "threat modeling" means and you'll get a wince, not an answer. It sounds like something a consultant does with sticky notes, a four-hour meeting, and a diagram nobody opens again after the workshop ends. So it doesn't happen. Features ship, "we'll do a security review later" becomes a running joke, and the actual threat model lives entirely in the reactive incident retro six months later titled "how did an attacker do *that*."

Here's the reframe that made it stick for me: threat modeling isn't a ceremony, it's a question you ask before you write the code instead of after you get paged for it. And the honest version — the one tired engineers with a sprint deadline can actually run — takes about 20 minutes, not a workshop.

## The four questions, minus the jargon

Adam Shostack's classic framing is four questions: what are we building, what can go wrong, what are we going to do about it, did we do a good enough job. That's still the right shape. The problem is everything built around it — STRIDE tables, attack trees, dedicated tooling — makes it feel like it needs a calendar invite. It doesn't. You can run all four questions as a comment thread on a design doc or five minutes at the start of a PR review.

**1. What are we building?** Not the whole system — just the diff. What's the new data flow? What's the new trust boundary? If you're adding a webhook endpoint, the trust boundary is "anyone on the internet can hit this URL," full stop, and that's the whole answer to question one.

**2. What can go wrong?** This is where most people reach for STRIDE and immediately check out. Skip the acronym. Ask instead: who's the annoyed user who wants to mess with this, and what's the laziest way they'd do it? For a webhook endpoint: someone replays a captured request, someone forges a request without ever having seen a real one, someone floods it. Three sentences, not a taxonomy.

**3. What are we doing about it?** This is the part that actually needs to make it into the code. Signature verification for forgery. A timestamp + nonce check for replay. Rate limiting for the flood. If the answer is "nothing, we'll deal with it if it happens," write that down explicitly — an accepted risk that's written down is a decision; an accepted risk nobody wrote down is just a gap waiting to be discovered by whoever's on call.

**4. Did we do a good enough job?** This is the question everyone skips, and it's the one that catches the "we implemented signature verification but forgot to reject requests where verification fails open on error" class of bug. It's a five-minute re-read of question three against the actual diff, not a new meeting.

## The part that makes this durable: writing it where the pager will find it

The reason threat models die in a wiki is that nobody re-reads a wiki at 2am. The reason a two-line comment survives is that it's sitting right next to the code that's currently on fire.

```javascript
// THREAT MODEL: this endpoint trusts X-Signature over the raw body.
// If verifyHmac() ever returns true on empty/missing signature, forgery is trivial.
// Verified fail-closed in tests/webhooks/signature.spec.js — do not weaken without re-running that suite.
function handleWebhook(req, res) {
  const signature = req.headers['x-signature'];
  if (!signature || !verifyHmac(req.rawBody, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('invalid signature');
  }
  // ... process the verified event
}
```

That comment is the entire "what can go wrong" and "what are we doing about it" answer, compressed into three lines that live exactly where the next engineer — possibly future tired you, mid-incident — will actually see them. It's not a diagram. It's a landmine warning sign placed directly on the landmine.

At Cubet, we started attaching a threat-model comment block like this to every new inbound integration point — webhooks, third-party callbacks, anything that accepts unauthenticated-by-default traffic — instead of running a separate review pass. It costs the author two minutes at write time. It's saved a reviewer from approving a fail-open auth check at least twice that I know of, because the question "what happens if this check errors instead of returning false" was sitting right there in the diff instead of buried in a design doc from three sprints ago.

## The incident-response payoff

Here's the part that actually justifies doing this when you're exhausted and just want to ship: a threat model written at design time becomes your incident response runbook for free. When something *does* go wrong, "what can go wrong" is no longer a hypothetical — it's a checklist. You already wrote down that replay was a known risk, so when the alert fires, you're not starting from zero, you're going straight to "check the nonce store, did it get bypassed or did it never get deployed."

Compare that to the usual incident retro, which starts with someone reconstructing the entire threat surface from scratch under pressure, three hours into an outage, while everyone's Slack DMs are on fire. A five-minute threat model at design time is a lot cheaper than a five-hour one during an incident.

## The one habit worth keeping

Don't adopt a framework. Adopt a checklist you can run in the time it takes coffee to brew: what's new here, what's the laziest attack against it, what did we actually do about it, and — the one everyone skips — did we check that the mitigation actually works, or just that it exists. Write the answer as a comment next to the code, not a slide in a deck nobody opens again.

Tired engineers don't need more security theater. We need the smallest version of the real thing, small enough that it survives contact with a Friday deploy.

---

Got a threat-modeling shortcut, a favorite "we should have caught this at design time" war story, or a hard disagreement with the "comment instead of wiki" approach? Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — I read everything.
