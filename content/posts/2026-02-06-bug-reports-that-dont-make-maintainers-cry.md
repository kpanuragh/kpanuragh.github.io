---
title: "How to Write Bug Reports That Don't Make Maintainers Cry 🐛😭"
date: "2026-02-06"
excerpt: "Opened an issue saying 'it doesn't work' and wondering why nobody's fixing your bug? Learn how to write bug reports that actually get fixed instead of ignored, closed, or causing maintainers to question their life choices."
tags: ["\\\"open-source\\\"", "\\\"github\\\"", "\\\"community\\\"", "\\\"contributing\\\""]
featured: "true"
---




# How to Write Bug Reports That Don't Make Maintainers Cry 🐛😭

**Real talk:** I once received a bug report that said "Your library is broken. Fix it." No details. No error messages. No code examples. Just pure rage in text form. 😤

**My response time?** Approximately never. Because I'm not psychic!

As a full-time developer who contributes to open source, I've seen THOUSANDS of bug reports. The good ones get fixed in hours. The bad ones? They get closed with "cannot reproduce" or sit in issue purgatory forever!

Let me show you how to write bug reports that maintainers will LOVE to fix! 🎯

## The Uncomfortable Truth About Bug Reports 💣

**What you think happens when you report a bug:**
```
You: "It's broken!"
Maintainer: "Oh no! Let me drop everything and fix this!"
*bug fixed in 10 minutes*
```

**What actually happens:**
```
You: "It's broken!"
Maintainer: *reads vague description*
Maintainer: *spends 30 minutes trying to understand*
Maintainer: *can't reproduce*
Maintainer: "Need more info"
You: *never responds*
Maintainer: *closes issue after 2 weeks*
```

**The stats that hurt:**
- **68%** of bug reports lack basic reproduction steps
- **54%** don't include error messages
- **81%** don't specify versions
- **43%** of reporters never respond to follow-up questions
- **ONE well-written bug report** can save 3 hours of maintainer debugging time!

**Translation:** Most bug reports are terrible, and YOUR report is probably one of them! 😬

**But hey!** You clicked this post, which means you're about to become one of the GOOD ones! 💪

## The Bug Report Spectrum (Where Do You Fall?) 🎯

### The "Useless" Bug Report ❌

**The classic:**
```markdown
Title: "Doesn't work"

Description:
Your library is broken. Please fix.
```

**Why it's terrible:**
- What doesn't work? Everything? One function? A specific feature?
- What did you expect to happen?
- What ACTUALLY happened?
- How can we reproduce this?
- Are you even using the latest version?

**Maintainer's reaction:** *closes issue immediately* or "Need more information"

**Your bug gets:** Ignored forever! 💀

### The "Novel" Bug Report 📚

**The other extreme:**
```markdown
Title: "Encountered an issue while implementing feature X in combination with Y when using Z on a Tuesday"

Description:
*5000 words of backstory*
*Your entire life story*
*Philosophy about software quality*
*Rant about other libraries*
*Somewhere buried in there: the actual bug*
*Maybe*
```

**Why it's bad:**
- TL;DR - maintainer gives up reading
- The actual bug is lost in noise
- Takes forever to parse

**Maintainer's reaction:** *skims* *gets confused* *asks for clarification*

### The "Perfect" Bug Report ✨ (BE THIS ONE!)

**The gold standard:**
```markdown
Title: "ParseError when using special characters in user input (v2.3.1)"

**Bug Description:**
The parseUserInput() function throws a ParseError when the input contains emoji characters.

**Expected Behavior:**
Should handle emoji characters gracefully or provide a clear validation error.

**Actual Behavior:**
Crashes with "ParseError: Unexpected token at position 5"

**Reproduction Steps:**
1. Call parseUserInput("Hello 👋 World")
2. Observe the error

**Minimal Reproduction:**
```js
import { parseUserInput } from 'your-library'
const result = parseUserInput("Hello 👋 World")
// Throws: ParseError: Unexpected token at position 5
```

**Environment:**
- Library version: 2.3.1
- Node version: 18.17.0
- OS: macOS 14.1

**Error Stack Trace:**
```
ParseError: Unexpected token at position 5
    at parseUserInput (index.js:45:12)
    at Object.<anonymous> (test.js:3:16)
```

**Possible Solution:**
Looks like the regex on line 45 doesn't handle unicode characters.
Maybe using /u flag would help?
```

**Why this is PERFECT:**
- ✅ Clear, specific title with version
- ✅ Describes what's expected vs. actual
- ✅ Minimal reproduction code
- ✅ All environment details
- ✅ Full error trace
- ✅ Even suggests a solution!

**Maintainer's reaction:** "This is beautiful! Let me fix this RIGHT NOW!" 😍

**Your bug gets:** Fixed in the next release! 🎉

## The Golden Rules of Bug Reports 📜

### Rule #1: Do Your Homework First

**Before opening that issue:**

```markdown
□ Search existing issues (maybe it's already reported!)
□ Read the documentation (maybe you're using it wrong!)
□ Check GitHub Discussions/Stack Overflow
□ Try the latest version (maybe it's already fixed!)
□ Test with minimal dependencies (isolate the problem!)
□ Actually try to solve it yourself first
```

**Real story:**
> "I was about to file a bug. Then I searched and found 3 existing issues about the same problem, one of which had a workaround. Saved everyone's time!" - Smart Developer

**In the security community**, we ALWAYS do recon before reporting vulnerabilities. Same principle applies to bugs! 🔍

### Rule #2: Reproduce It Consistently

**If you can't reproduce it reliably, don't report it yet!**

**Bad:**
```markdown
"Sometimes the app crashes. Not sure when."
```

**Good:**
```markdown
"App crashes 100% of the time when calling function X
with empty array as input on Node 18+"
```

**How to find reproduction steps:**

1. **Isolate the problem:**
   - Does it happen with minimal code?
   - Can you remove dependencies?
   - What's the SMALLEST code that triggers it?

2. **Test consistently:**
   - Does it happen every time?
   - Or only under specific conditions?

3. **Document the steps:**
   - Start from zero
   - List EVERY step
   - Include the commands

**Example:**
```bash
# Reproducible bug report
git clone https://github.com/user/repo
cd repo
npm install
npm run dev
# Navigate to /users
# Click "Delete" button
# Observe error in console
```

**Balancing work and open source taught me this:** I have limited time. A bug I can reproduce in 30 seconds gets fixed IMMEDIATELY. A bug that takes 30 minutes to understand gets... postponed indefinitely! ⏰

### Rule #3: Provide Environment Details

**ALWAYS include:**

```markdown
## Environment
- Library/Package version: X.Y.Z (check package.json!)
- Language/Runtime version: Node 18.17.0 / Python 3.11 / etc.
- Operating System: macOS 14.1 / Ubuntu 22.04 / Windows 11
- Browser (if relevant): Chrome 120 / Firefox 121 / Safari 17
- Relevant dependencies: Express 4.18.2, React 18.2.0
```

**Why this matters:**

```javascript
// This bug only happens on:
- Node 16 (not Node 18)
- Windows (not Mac/Linux)
- With specific dependency versions

// Without environment info, maintainer can't reproduce!
```

**Pro tip:** Use `npx envinfo` to generate environment details automatically! 🎯

### Rule #4: Show, Don't Tell

**Bad:**
```markdown
"The function doesn't work with large arrays"
```

**Good:**
```markdown
"The sortArray() function takes 45 seconds with 100K items"

Reproduction:
const largeArray = Array.from({ length: 100000 }, (_, i) => i)
console.time('sort')
sortArray(largeArray)
console.timeEnd('sort')
// Output: sort: 45234.892ms
```

**The power of code examples:**

- ✅ Removes ambiguity
- ✅ Maintainer can copy-paste to test
- ✅ Proves you actually tried it
- ✅ Shows you understand the problem

### Rule #5: Include the Error Message (Complete!)

**Bad:**
```markdown
"Getting an error when I run the code"
```

**Good:**
```markdown
"Getting TypeError when calling fetchUser():

```
TypeError: Cannot read property 'name' of undefined
    at fetchUser (src/api.js:23:18)
    at async loadUserProfile (src/components/Profile.js:45:21)
    at async handleLogin (src/auth.js:89:5)
```

Full console output: [link to pastebin/gist]
```

**Pro tips:**

```markdown
# Copy the ENTIRE error (not just first line!)
# Include the stack trace
# Don't screenshot errors (text is better!)
# If it's long, use a gist/pastebin and link it
```

**In my Laravel work**, I learned this the hard way: The stack trace tells you EXACTLY where the bug is. Without it, you're flying blind! 🦇

### Rule #6: Provide a Minimal Reproduction

**This is the MOST IMPORTANT rule!**

**The concept:**
```markdown
Minimal Reproduction = Smallest possible code that triggers the bug
```

**NOT minimal:**
```markdown
"Clone my entire 50-file production app and run it"
```

**Minimal:**
```markdown
// bug.js (5 lines)
const lib = require('your-library')
const result = lib.parse(null)
// Throws: TypeError
```

**How to create a minimal reproduction:**

1. **Start with your full code**
2. **Remove everything unrelated**
3. **Test - does bug still happen?**
4. **Keep removing until you can't anymore**
5. **You now have the minimal case!**

**Tools that help:**

- **CodeSandbox** - For frontend bugs
- **StackBlitz** - For full-stack reproductions
- **GitHub Gist** - For simple scripts
- **Replit** - For quick tests

**Example minimal reproduction:**

```markdown
Reproduction: https://codesandbox.io/s/bug-repro-abc123

Steps:
1. Open the sandbox
2. Click "Run"
3. See error in console
```

**Maintainer's reaction:** "I can click this link and see the bug IMMEDIATELY! Amazing!" 🌟

### Rule #7: Be Respectful and Constructive

**Remember: You're asking volunteers for FREE help!**

**Bad:**
```markdown
❌ "This is garbage! Who wrote this code?"
❌ "Fix this NOW or I'm switching libraries"
❌ "This is a critical production bug!" (for your personal project)
❌ "A junior dev could fix this in 5 minutes"
```

**Good:**
```markdown
✅ "Found a potential issue with the parser"
✅ "This might be affecting other users too"
✅ "Happy to provide more info if needed"
✅ "Thanks for maintaining this library!"
```

**The tone difference:**

```markdown
Hostile: "Your library is broken"
Collaborative: "I think I found a bug"

Demanding: "Fix this ASAP"
Respectful: "Would appreciate help with this"

Rude: "This is obviously wrong"
Constructive: "Expected X but got Y"
```

**Your attitude directly affects response time!** Maintainers are human - they WANT to help nice people! 😊

## The Perfect Bug Report Template 📋

**Copy this for your next bug report:**

```markdown
**Bug Description:**
[One sentence: What's broken?]

**Expected Behavior:**
[What should happen?]

**Actual Behavior:**
[What actually happens?]

**Reproduction Steps:**
1. [First step]
2. [Second step]
3. [See error]

**Minimal Code Example:**
```js
// Smallest code that reproduces the bug
```

**Environment:**
- Package version:
- Runtime version:
- Operating System:
- Other relevant info:

**Error Message/Stack Trace:**
```
[Paste complete error here]
```

**Screenshots (if relevant):**
[Add screenshots showing the bug]

**Possible Cause/Solution:**
[Optional: Your investigation or suggested fix]

**Additional Context:**
[Anything else relevant]
```

**Save this template!** Use it every time! 🎯

## Real Bug Report Examples (Learn from These!) 🎓

### Example #1: Performance Bug

**❌ Bad Report:**
```markdown
Title: "Slow performance"

Description:
Your library is really slow. Can you optimize it?
```

**✅ Good Report:**
```markdown
Title: "Performance degradation with large datasets (>10K items) - v3.2.1"

**Bug Description:**
The filterItems() function becomes unusably slow with datasets over 10,000 items.

**Expected Behavior:**
Should filter 10K items in under 100ms (like similar libraries)

**Actual Behavior:**
Takes 8+ seconds to filter 10K items

**Reproduction:**
```js
const items = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  name: `Item ${i}`
}))

console.time('filter')
const result = filterItems(items, { name: 'Item 5000' })
console.timeEnd('filter')
// Output: filter: 8234ms
```

**Benchmark:**
- 1K items: 80ms
- 10K items: 8234ms (100x slower!)
- 100K items: Freezes browser

**Profiling:**
Looks like the issue is in the nested loop on line 156.
Algorithm appears to be O(n²) instead of O(n).

**Environment:**
- Library: 3.2.1
- Node: 18.17.0
- Dataset: 10,000 objects with 2 properties each

**Suggested Fix:**
Using a Map for lookups instead of nested arrays might help?
```

**Why this works:**
- ✅ Quantifies the problem (8 seconds!)
- ✅ Shows it scales badly
- ✅ Includes benchmarks
- ✅ Did profiling
- ✅ Suggests solution
- ✅ Clear reproduction

### Example #2: Crash/Error Bug

**❌ Bad Report:**
```markdown
Title: "Error"

App crashes when I use your library
```

**✅ Good Report:**
```markdown
Title: "Null pointer exception in getUserById() when user doesn't exist - v1.5.2"

**Bug Description:**
Calling getUserById() with a non-existent ID throws an uncaught exception
instead of returning null or throwing a documented error.

**Expected Behavior:**
Should return null or throw a UserNotFoundError (as documented)

**Actual Behavior:**
Throws: TypeError: Cannot read property 'name' of undefined

**Reproduction:**
```js
import { getUserById } from 'your-library'

const user = await getUserById('non-existent-id')
// Expected: null or UserNotFoundError
// Actual: TypeError: Cannot read property 'name' of undefined
```

**Error Stack Trace:**
```
TypeError: Cannot read property 'name' of undefined
    at getUserById (src/users.js:45:18)
    at Object.<anonymous> (test.js:3:16)
    at Module._compile (internal/modules/cjs/loader.js:1063:30)
```

**Root Cause:**
Line 45 in src/users.js assumes user object exists:
```js
return user.name // Crashes if user is undefined!
```

**Suggested Fix:**
```js
return user?.name ?? null // Safe navigation
```

**Environment:**
- Library: 1.5.2
- Node: 18.17.0
- Database: PostgreSQL 14

**Additional Context:**
This happens when database returns no results. The docs say it should
return null, but implementation doesn't handle this case.
```

**Why this is excellent:**
- ✅ Exact error with stack trace
- ✅ Expected vs actual clearly stated
- ✅ Found the root cause (line 45!)
- ✅ Provided fix
- ✅ References documentation
- ✅ Explains when it happens

### Example #3: Security Vulnerability

**⚠️ IMPORTANT: Don't publicly report security bugs!**

**Bad:**
```markdown
Title: "SQL injection vulnerability in your login code"
[Public issue with exploit details]
```

**Good:**
```markdown
[Email maintainer privately or use security@project.org]

Subject: Security vulnerability in user authentication

I discovered a potential SQL injection vulnerability in the
login function. I've followed responsible disclosure:

1. Not posting publicly
2. Waiting for fix before disclosure
3. Providing details privately

Details:
[Vulnerability explanation]
[Proof of concept]
[Suggested fix]

Timeline:
- Discovered: Feb 6, 2026
- Waiting for: Fix + patch release
- Planning disclosure: 90 days after patch

Contact: [your email]
```

**Why this is right:**
- ✅ Private disclosure (not public issue!)
- ✅ Follows responsible disclosure
- ✅ Gives time to fix before public
- ✅ Provides details and fix
- ✅ Professional approach

**In the security community**, we ALWAYS use responsible disclosure. Publicly posting security bugs puts users at risk! 🔒

## Common Bug Report Mistakes (I've Made Them All!) 🚨

### Mistake #1: The "It Doesn't Work" Report

**The trap:**
```markdown
Title: "Doesn't work"
Description: "I tried to use it and it doesn't work"
```

**Why it fails:** WHAT doesn't work? WHEN? HOW?

**Fix:** Be specific! "Function X throws error Y when called with Z"

### Mistake #2: The "Works on My Machine" Dismissal

**The scene:**
```markdown
Maintainer: "Can't reproduce this"
You: "Well it works on MY machine!"
*never provides environment details*
```

**Fix:** Provide COMPLETE environment info! Maybe it's specific to your setup!

### Mistake #3: The Missing Reproduction

**The problem:**
```markdown
"Here's my 500-line app. The bug is somewhere in there."
```

**Fix:** Create a 5-line minimal reproduction! Don't make maintainers dig through your codebase!

**Balancing work and open source taught me:** I have 30 minutes for OSS. If figuring out your bug takes 2 hours, I'll skip it. Make it EASY for me to help! 🙏

### Mistake #4: The Screenshot of Text

**The horror:**
```markdown
[Blurry phone photo of laptop screen showing error message]
```

**Why it's terrible:**
- ❌ Can't copy-paste error to search
- ❌ Hard to read
- ❌ Missing context
- ❌ Looks unprofessional

**Fix:** COPY-PASTE text! Use screenshots only for UI bugs!

### Mistake #5: The "Urgent" Demand

**The entitlement:**
```markdown
"URGENT: Production is down! Fix in next 2 hours!"
```

**Reality check:**
- It's free software
- Maintained by volunteers
- Your emergency ≠ their emergency
- No SLA on open source!

**Fix:** Be patient and respectful. Or sponsor the maintainer for priority support! 💰

### Mistake #6: Version Ambiguity

**The confusion:**
```markdown
"I'm using the latest version"
*latest version is actually 2 years old*
```

**Fix:** ALWAYS specify exact version numbers! `1.2.3`, not "latest"!

### Mistake #7: Too Many Issues at Once

**The dump:**
```markdown
Title: "Multiple bugs found"

I found 15 bugs:
1. This doesn't work
2. That crashes
3. This is slow
4-15. More problems
```

**Fix:** ONE issue per bug report! Easier to track, discuss, and close individually!

## The Follow-Up Etiquette 🎭

### When Maintainer Asks for More Info

**❌ Don't:**
```markdown
*never respond*
*or*
"I don't have time to provide that"
*or*
"Just fix it!"
```

**✅ Do:**
```markdown
"Sure! Here's the additional info you requested:
[detailed response]

Let me know if you need anything else!"
```

**Remember:** If you don't respond, your issue gets closed as "cannot reproduce"! 🚫

### When They Suggest a Workaround

**❌ Don't:**
```markdown
"That's not a real fix! I want it PROPERLY fixed!"
```

**✅ Do:**
```markdown
"Thanks for the workaround! That unblocks me for now.

Should I keep this issue open for a permanent fix,
or close it since there's a workaround?"
```

**Workarounds are GIFTS!** They solve your problem NOW while permanent fix is planned! 🎁

### When They Close Your Issue

**❌ Don't:**
```markdown
"Why did you close this?! This is a real bug!"
*reopens aggressively*
```

**✅ Do:**
```markdown
"I see you closed this. Can you help me understand why?

I provided [reproduction/details]. Is there additional
info I can provide, or is this working as intended?"
```

**Maybe there's a good reason!** Or maybe they need clarification. Ask nicely! 🤝

## The Tools That Make Bug Reporting Easy 🛠️

### For Creating Reproductions

**CodeSandbox** - Frontend bugs
```
- Instant React/Vue/Angular sandbox
- Share link in bug report
- Maintainer can fork and fix
```

**StackBlitz** - Full-stack bugs
```
- Node.js backend support
- Multiple files
- Terminal access
```

**Replit** - Any language
```
- Supports 50+ languages
- Easy sharing
- Real-time collaboration
```

### For Sharing Errors/Logs

**GitHub Gist** - Code snippets
```
- Syntax highlighting
- Version control
- Easy embedding
```

**Pastebin/Hastebin** - Quick pastes
```
- No account needed
- Expire after time
- Clean URLs
```

### For Environment Info

**npx envinfo** - Auto-generate environment details
```bash
npx envinfo --system --binaries --npmPackages

# Outputs:
System:
  OS: macOS 14.1
  CPU: Apple M1
Binaries:
  Node: 18.17.0
  npm: 9.6.7
npmPackages:
  react: 18.2.0
  # ... all relevant packages
```

**Just copy-paste this into bug reports!** 🎯

### For Screenshots/Videos

**For UI bugs, screenshots help!**

**Tools:**
- **Loom** - Record screen + voice explanation
- **CleanShot** - Annotated screenshots (Mac)
- **ShareX** - Screenshots + markup (Windows)
- **Peek** - GIF screen recorder (Linux)

**Pro tip:** Record a 30-second Loom showing the bug. Worth 1000 words! 📹

## The Bug Report Workflow (From Discovery to Fix) 🔄

**Here's the full process:**

### Step 1: Discover Bug

```markdown
"Hmm, this isn't working as expected..."
```

### Step 2: Investigate

```markdown
□ Is it actually a bug or am I using it wrong?
□ Check the documentation
□ Search existing issues
□ Try to understand the root cause
```

### Step 3: Reproduce Consistently

```markdown
□ Find exact steps to trigger bug
□ Create minimal reproduction
□ Test multiple times
```

### Step 4: Gather Information

```markdown
□ Environment details
□ Error messages
□ Code examples
□ Screenshots if relevant
```

### Step 5: Write Report

```markdown
□ Use issue template (if exists)
□ Follow the perfect bug report format
□ Be clear, specific, respectful
```

### Step 6: Submit

```markdown
□ Choose relevant labels
□ Add to project board (if exists)
□ Don't assign it to yourself unless fixing it
```

### Step 7: Engage Constructively

```markdown
□ Respond to follow-up questions promptly
□ Test suggested fixes
□ Provide feedback
□ Say thank you when fixed!
```

### Step 8: Close or Update

```markdown
If fixed:
  □ Test the fix
  □ Confirm it works
  □ Close the issue
  □ Thank the maintainer!

If workaround exists:
  □ Document workaround
  □ Ask if should close or keep open
```

## The Bottom Line 💡

Good bug reports get fixed. Bad bug reports get ignored!

**What you learned today:**

1. Do homework before reporting (search, update, test)
2. Reproduce consistently with minimal code
3. Provide complete environment details
4. Include full error messages and stack traces
5. Create minimal reproductions (CodeSandbox!)
6. Be specific, clear, and respectful
7. Follow up promptly when asked
8. Use the perfect bug report template
9. One bug per issue
10. Your attitude affects response time!

**The truth:**

**Good bug reports:**
- ✅ Get fixed quickly
- ✅ Help other users too
- ✅ Build positive community
- ✅ Make maintainers happy
- ✅ Improve the project
- ✅ Save everyone time

**Bad bug reports:**
- ❌ Get ignored or closed
- ❌ Waste maintainer time
- ❌ Frustrate everyone
- ❌ Don't get fixed
- ❌ Damage community
- ❌ Make maintainers cry

**Which are YOU writing?** 🤔

## Your Action Plan 🚀

**Next time you find a bug:**

1. Search existing issues first
2. Create minimal reproduction
3. Gather all environment details
4. Use the perfect template
5. Be respectful and helpful
6. Follow up on questions
7. Thank the maintainer when fixed

**This week:**

1. Review your past bug reports (cringe!)
2. Update old reports with better info
3. Close reports you can't reproduce anymore
4. Help triage someone else's bug report

**This month:**

1. Become known for excellent bug reports
2. Help others write better reports
3. Contribute fixes for bugs you report
4. Build better relationships with maintainers

**Going forward:**

1. ALWAYS use the template
2. ALWAYS provide reproductions
3. ALWAYS be respectful
4. Watch your bugs get fixed faster! 🎉

## Resources You Need 📚

**Templates:**
- GitHub issue templates
- The template in this post
- Project-specific templates

**Tools:**
- CodeSandbox
- StackBlitz
- Loom
- npx envinfo
- GitHub Gist

**Reading:**
- [How to Report Bugs Effectively](https://www.chiark.greenend.org.uk/~sgtatham/bugs.html)
- [Stack Overflow's MCVE](https://stackoverflow.com/help/minimal-reproducible-example)
- Project-specific contribution guidelines

**Examples of great bug trackers:**
- Rust (excellent triage)
- React (clear templates)
- VS Code (detailed reports)

**Go learn from them!** 🎓

## Final Thoughts 💭

**The uncomfortable truth:**

Maintainers are drowning in badly-written bug reports. Yours is probably one of them!

**But here's the good news:**

By following this guide, YOUR bug reports will stand out! Maintainers will see your name and think "Oh good, this person writes EXCELLENT bug reports. Let me prioritize this!" 🌟

**The best part?**

Writing good bug reports is a SKILL that makes you better at:
- Debugging (you learn to isolate problems!)
- Communication (clarity matters!)
- Empathy (you respect maintainers' time!)
- Contributing (first step to PRs!)

**Your next bug report will be AMAZING!** 💪

**So here's my challenge:**

Right now, think of a bug you encountered recently. Write a proper bug report using this template. Even if you don't submit it, PRACTICE the skill!

**Questions to ask yourself:**
- Have I been writing terrible bug reports? (Probably yes!)
- Do I provide minimal reproductions? (Starting now!)
- Am I respectful to maintainers? (Always!)
- Can I improve my reporting skills? (Definitely!)

**Your move!** ♟️

---

**Ready to write amazing bug reports?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - share your best bug report!

**Want to see my reporting style?** Check out my [GitHub](https://github.com/kpanuragh) issues and PRs!

*Now go write bug reports that get FIXED instead of ignored!* 🐛✨

---

**P.S.** If you're a maintainer reading this: I feel your pain. Share this with your users! Maybe it'll reduce the "it doesn't work" reports! 😅

**P.P.S.** Remember: A great bug report is a GIFT to the maintainer. It shows you respect their time and want to help improve the project. Be the kind of contributor that maintainers LOVE to help! 💚
