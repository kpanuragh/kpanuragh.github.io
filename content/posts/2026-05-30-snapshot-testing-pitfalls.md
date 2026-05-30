---
title: "📸 Snapshot Testing Is Lying to You (And You Keep Clicking 'Update')"
date: "2026-05-30"
excerpt: "Snapshot tests feel like free coverage — press one key and 3,000 lines of assertions appear. But that update button is turning your test suite into a rubber stamp. Here's how snapshot testing goes wrong and how to actually use it well."
tags:
  - testing
  - code-quality
  - javascript
  - jest
  - backend
featured: true
---

There's a moment every developer knows. Your CI pipeline goes red. You open the test output, see a massive snapshot diff, squint for two seconds, and then type:

```bash
jest --updateSnapshot
```

Green. Ship it.

You just "fixed" your tests by telling them to expect whatever the code now does. Congratulations — your test suite is a mirror, not a safety net.

## What Snapshot Testing Promises

Snapshot testing is seductive. You write one test, Jest (or Vitest, or your framework of choice) serialises the output, saves it to a `.snap` file, and on every future run it compares against that saved version. Regressions are caught automatically! No hand-writing assertions! It even works for complex nested JSON objects where writing individual `expect()` calls would take half a morning.

At Cubet, when we first adopted Jest snapshots on a Node.js API project, the coverage numbers shot up overnight. Leadership loved the graphs. The team loved not writing assertions. Nobody asked what the snapshots were actually verifying.

That's the trap.

## Pitfall #1: The "Just Update It" Death Spiral

Snapshot tests fail for two reasons:
1. You introduced a bug that changed the output — **good failure, catch it!**
2. You intentionally changed something — **expected failure, update the snapshot.**

In theory, you can tell the difference. In practice, after the fourteenth PR this week and a deadline tomorrow, you update everything and move on. The bug hiding in line 847 of the snapshot diff ships to production wearing a passing test as camouflage.

The snapshot file grows. Nobody reviews it carefully. It becomes archaeology.

```javascript
// This test "covers" your serializer
it('serializes user response', () => {
  const result = serializeUser({ id: 1, role: 'admin', permissions: ['read', 'write', 'delete'] });
  expect(result).toMatchSnapshot();
});
```

Looks fine. But when a security refactor accidentally strips the `permissions` field from the response, the snapshot update is one keypress away from hiding a privilege escalation bug forever.

## Pitfall #2: Snapshots That Test the Framework, Not Your Logic

Here's a real pattern I see constantly in Express API codebases:

```javascript
it('returns 200 with user data', async () => {
  const res = await request(app).get('/api/users/1');
  expect(res.body).toMatchSnapshot();
});
```

The snapshot ends up containing `createdAt`, `updatedAt`, database-generated IDs, and sometimes request-timing metadata. Every run on a fresh database environment fails because the IDs are different. The team adds `expect.any(Number)` for IDs, `expect.any(String)` for timestamps, and suddenly the snapshot is so riddled with wildcards it's testing almost nothing except that the response *has those keys* — which a simple schema check would do better.

You're not testing your logic. You're testing that Express serialised an object to JSON, which Express has been doing correctly since 2011.

## Pitfall #3: The 10,000-Line Snapshot File Nobody Can Review

Here's what a `.snap` file looks like six months into a project:

- 847 test cases
- 12,000 lines
- Last meaningful review: never
- Reviewed in the last PR: "LGTM, snapshots updated"

Nobody has time to read 12,000 lines of serialised JSON during code review. So snapshot diffs become noise. Reviewers learn to ignore them. The snapshots stop providing any signal at all — they're just files that turn CI red when you change anything.

At this point your snapshot suite is pure overhead: it slows builds, confuses new team members, and provides false confidence.

## When Snapshots Actually Work

I'm not saying delete all your snapshots. There are cases where they earn their keep:

**Serialisation formats you own**: If you're building a custom serialiser for a wire format, binary protocol, or templating engine — something with complex deterministic output — snapshots are excellent. The output is stable and a regression really is a bug.

**CLI tool output**: Snapshot the rendered output of a command-line tool. It's deterministic, human-readable, and regressions are immediately obvious in the diff.

**Database migration outputs**: Snapshot the SQL that your query builder generates. A schema change that silently alters a `JOIN` is exactly the kind of regression you want a noisy diff for.

**Component render trees (carefully)**: For frontend components with complex conditional rendering, snapshots can catch structural regressions — but only if you're disciplined about reviewing diffs and ruthless about keeping snapshots small.

## The Fix: Explicit Assertions for the Things That Actually Matter

Instead of snapshotting the whole response, test the invariants:

```javascript
it('returns user without sensitive fields', async () => {
  const res = await request(app).get('/api/users/1');

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('id');
  expect(res.body).toHaveProperty('email');
  // The security invariant — explicit, always reviewed
  expect(res.body).not.toHaveProperty('passwordHash');
  expect(res.body).not.toHaveProperty('permissions');
  expect(Array.isArray(res.body.tags)).toBe(true);
});
```

Yes, this takes longer to write. That time spent is the point — it forces you to think about *what actually matters* about this output. The test now documents intent, not implementation. When a future developer reads it, they understand why `passwordHash` must be absent. A snapshot update would never teach them that.

## The Discipline Checklist

If you're going to keep snapshot tests, apply this checklist before every `--updateSnapshot`:

1. **Read the diff completely** — not the summary, the actual lines. All of them.
2. **Ask: did I intend every change in this diff?** Specifically, every removed field, every changed value.
3. **If the answer is "I think so, mostly" — that's a no.** Investigate before updating.
4. **Keep snapshots small.** If a snapshot is over 50 lines, it's testing too much. Split it.
5. **Make snapshots deterministic.** Mock timestamps, IDs, and anything environment-specific before they ever reach the serialiser.

A useful mental test: if a snapshot diff landed in your code review with no description, would you understand what changed and why? If not, the snapshot is covering too much.

## The Rubber Stamp Problem Is Really a Culture Problem

The `--updateSnapshot` reflex isn't a tool problem — it's what happens when teams treat green CI as the goal rather than working software. Snapshot tests are particularly vulnerable because updating them *feels* like maintenance. It's not. It's capitulation.

The best test suites I've worked on at Cubet treat test changes with the same scrutiny as source changes. A test that starts passing after you update it — rather than after you fix the code — is a test that just stopped protecting you.

Keep your snapshots small, keep them intentional, and stop clicking update until you've actually read the diff.

---

**Where are your snapshot files right now? If the answer is "somewhere in the repo, I think", go open them. You might be surprised what's in there.**
