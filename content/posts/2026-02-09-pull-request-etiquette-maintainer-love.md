---
title: "Pull Request Etiquette: How to Get Your PRs Merged (Not Ignored) 🚀✅"
date: "2026-02-09"
excerpt: "Opened a PR with 'fixed stuff' as the title and wondering why it's been sitting there for 3 weeks? Learn the unwritten rules of PR etiquette that'll make maintainers WANT to merge your code instead of closing it with 'thanks but no thanks.'"
tags: ["open-source", "github", "contributing", "community"]
featured: true
---

# Pull Request Etiquette: How to Get Your PRs Merged (Not Ignored) 🚀✅

**Real talk:** I once opened a PR to fix a typo. Just ONE character. The diff was literally `-` and `+` one letter. Easy merge, right? 😊

**WRONG.** It sat there for 2 months before getting closed because I didn't follow the contribution guidelines! 🤦‍♂️

**Plot twist:** The maintainer was 100% right to close it!

As a full-time developer who contributes to open source and maintains several Laravel packages, I've seen THOUSANDS of pull requests. The good ones get merged in hours. The bad ones? They rot in PR purgatory until someone closes them out of pity!

Let me show you the secret sauce of PR etiquette! 🎯

## The Uncomfortable Truth About Pull Requests 💣

**What you think happens when you submit a PR:**
```
You: *submits awesome code*
Maintainer: "OMG this is perfect! *merges immediately*"
You: *becomes open source hero*
```

**What actually happens:**
```
You: *submits PR with no description*
Maintainer: *sees notification*
Maintainer: *reads code*
Maintainer: "What is this even trying to fix?"
Maintainer: *labels as 'needs more info'*
You: *never responds*
Maintainer: *closes 2 weeks later*
You: "Why do they hate my code?!" 😭
```

**The stats that hurt:**
- **71%** of first-time PRs get rejected (not because of bad code!)
- **58%** of PRs lack proper descriptions
- **43%** don't follow the project's contribution guidelines
- **32%** of contributors never respond to review feedback
- **ONE well-crafted PR** can be the start of becoming a core contributor!

**Translation:** Most PRs fail because of bad etiquette, NOT bad code! 😬

**But here's the good news:** You're reading this, which means you're about to become one of the contributors that maintainers LOVE! 💪

## The PR Lifecycle (What's Really Happening) 🔄

**Your perspective:**
```
1. Write code
2. Submit PR
3. Wait for merge
4. ???
5. Profit!
```

**Maintainer's perspective:**
```
1. See PR notification (one of 47 today)
2. Check if it follows guidelines (90% don't)
3. Read description (if it exists)
4. Understand the problem (if explained)
5. Review code quality
6. Check tests (if included)
7. Look for breaking changes
8. Consider project direction
9. Write review feedback
10. Wait for response (often forever)
11. Maybe eventually merge
```

**See the difference?** Maintainers have a LOT to consider! Make their life easier and your PR gets merged! 🎉

## The Golden Rules of Pull Requests 📜

### Rule #1: Read the CONTRIBUTING.md (Like, Actually Read It)

**Every project has rules. Follow them!**

**Bad approach:**
```markdown
*ignores CONTRIBUTING.md*
*submits PR however you want*
*wonders why it gets closed*
```

**Good approach:**
```markdown
1. Find CONTRIBUTING.md (usually in repo root)
2. Read EVERY word (yes, really!)
3. Follow the guidelines EXACTLY
4. Your PR gets merged ✨
```

**Real example from my Laravel packages:**
```markdown
Our CONTRIBUTING.md says:
- Run `npm run lint` before submitting
- Write tests for all new features
- Follow PSR-12 coding standards
- Reference issue number in PR

PRs that follow this? Merged in <24 hours!
PRs that don't? "Please read CONTRIBUTING.md" ⏸️
```

**In the security community**, we're VERY strict about contribution guidelines because bad code can create vulnerabilities. Learn to follow the rules! 🔒

**Pro tip:** Bookmark the CONTRIBUTING.md! You'll reference it multiple times!

### Rule #2: One PR = One Thing

**The problem:**
```diff
PR Title: "Misc fixes and improvements"

Changed files: 47
+ Fixed typo in README
+ Refactored entire auth system
+ Added new feature
+ Updated dependencies
+ Changed coding style in 20 files
+ Fixed unrelated bug
```

**Why this is terrible:**
- Impossible to review all at once
- One bad change blocks the good ones
- Conflicts with other PRs
- Breaks `git bisect` (for finding bugs later)
- Shows you don't understand git workflow

**The solution:**
```markdown
PR #1: "Fix typo in README.md" (1 file changed)
PR #2: "Add user avatar upload feature" (3 files changed)
PR #3: "Fix null pointer in login handler" (1 file changed)

Each PR = focused = easy to review = gets merged! ✅
```

**Real story:** I once submitted a PR that changed 200 files because I ran a formatter on the whole codebase PLUS added my feature. The maintainer said "I can't review this. Split it up." I learned my lesson! 😅

**Balancing work and open source taught me this:** Reviewers have limited time. Small, focused PRs respect their time and get merged faster! ⏰

### Rule #3: Write a Descriptive Title

**Bad titles:**
```
❌ "Update"
❌ "Fix"
❌ "Changes"
❌ "asdf"
❌ "final version"
❌ "please merge"
```

**Good titles:**
```
✅ "Fix XSS vulnerability in user profile rendering"
✅ "Add support for PostgreSQL 15"
✅ "Improve performance of search query by 60%"
✅ "Fix crash when user input contains emoji"
✅ "Add dark mode toggle to settings page"
```

**The formula:**
```
[Action] [What] [Where/Why]

Examples:
Fix null pointer exception in login handler
Add email validation to user registration
Refactor database connection pooling for better performance
```

**Many projects use conventional commits:**
```
feat: Add user export functionality
fix: Resolve memory leak in cache service
docs: Update API documentation for v2
refactor: Simplify authentication middleware
test: Add integration tests for payment flow
```

**Use the project's convention!** Check recent merged PRs to see the pattern!

### Rule #4: Write a Killer PR Description

**This is where most PRs fail!**

**Bad PR description:**
```markdown
Fixed the bug.
```

**That's it.** No context. No explanation. No nothing. 😱

**Good PR description:**
```markdown
## What
Fixes the null pointer exception that occurs when users with empty bio
try to view their profile.

## Why
Users were reporting crashes (issue #234). Bisected it to commit abc123.
Root cause: we assume bio field always exists, but it's optional.

## How
Added null check before accessing bio.text property.
Used optional chaining for safety.

## Testing
- ✅ Tested with user who has no bio
- ✅ Tested with user who has bio
- ✅ Added unit test to prevent regression
- ✅ All existing tests pass

## Screenshots
[Before] *screenshot of crash*
[After] *screenshot working*

Fixes #234
```

**Why this works:**
- ✅ Clear explanation of problem
- ✅ Shows you investigated
- ✅ Explains the solution
- ✅ Proves you tested it
- ✅ Links to related issue
- ✅ Maintainer can merge with confidence!

**In my AWS projects**, I use this template for every PR. Reviewers LOVE it because they understand the change instantly! 🎯

### Rule #5: Link to the Issue

**Most projects require this!**

**The workflow:**
```markdown
1. Find or create an issue describing the problem
2. Discuss the approach in the issue
3. Get maintainer approval
4. Then write the code
5. Link PR to issue
```

**Not:**
```markdown
1. Write code
2. Submit random PR
3. "Surprise! I fixed something you didn't ask for!"
4. Get rejected
```

**How to link:**
```markdown
Fixes #123
Closes #456
Resolves #789

GitHub auto-closes the issue when PR merges! ✨
```

**Real example:**
> "I spent a weekend building a feature. Submitted PR. Maintainer said 'We discussed this in issue #45 and decided NOT to add this.' I wasted my weekend because I didn't check first!" - Burned OSS Contributor

**The lesson:** Always start with an issue discussion! Don't code in a vacuum!

### Rule #6: Make It Easy to Review

**Reviewers are doing you a favor. Make their life easy!**

**Hard to review:**
```diff
- Massive changes with no comments
- No tests
- Breaking changes to API
- Inconsistent code style
- Commits like "wip", "fix", "ugh", "asdfasdf"
```

**Easy to review:**
```diff
+ Clean, focused changes
+ Tests included
+ Backwards compatible
+ Follows project style
+ Descriptive commit messages
+ Screenshots for UI changes
+ Performance benchmarks if applicable
```

**The checklist before submitting:**
```markdown
□ Code is properly formatted (ran the linter!)
□ Tests are included and passing
□ No commented-out code left behind
□ No debugging console.logs
□ Commit messages are descriptive
□ No merge commits (rebase if needed!)
□ Screenshots for visual changes
□ Documentation updated if API changed
```

**Pro move:** Review your own PR first!
```
1. Submit the PR
2. Look at the "Files changed" tab
3. Add comments on lines that need explanation
4. This helps reviewers AND shows you care!
```

### Rule #7: Write Good Commit Messages

**Your commits tell a story. Make it a good one!**

**Bad commits:**
```
fix stuff
wip
more changes
final
final final
ok now it works
```

**Good commits:**
```
Add user authentication with JWT tokens

- Implement login/logout endpoints
- Add middleware for protected routes
- Include refresh token mechanism
- Add tests for auth flow

Fixes #123
```

**The format:**
```
Brief summary (50 chars or less)

More detailed explanation if needed (wrap at 72 chars):
- What was changed
- Why it was changed
- Any caveats or side effects

Fixes #issue-number
```

**Why this matters:**
- Future developers understand the change
- `git log` is actually useful
- `git blame` shows context
- Makes code archaeology possible

**Balancing work and open source taught me:** Well-written commit messages save HOURS of "what was I thinking?" moments! 🤔

### Rule #8: Respond to Feedback (And Be Gracious!)

**Review feedback isn't personal. It's about the code!**

**Bad responses:**
```markdown
Reviewer: "Can you add a test for this edge case?"
You: "Tests are stupid" ❌

Reviewer: "This breaks backwards compatibility"
You: "Just update your code" ❌

Reviewer: "Please follow our style guide"
You: "My style is better" ❌

Reviewer: *crickets*
You: *never responds* ❌
```

**Good responses:**
```markdown
Reviewer: "Can you add a test for this edge case?"
You: "Good catch! Added test in abc123" ✅

Reviewer: "This breaks backwards compatibility"
You: "You're right! I've modified it to be backwards compatible" ✅

Reviewer: "Please follow our style guide"
You: "My bad! Fixed formatting in def456" ✅

Reviewer: "Have you considered using X instead of Y?"
You: "Great idea! I've refactored to use X. Much cleaner!" ✅
```

**The golden mindset:**
```
Feedback = Free code review from experts
Feedback = Learning opportunity
Feedback = They care about the project
Feedback ≠ Personal attack

Be grateful! Say "thanks for the review!" 🙏
```

**Real story:** I once had a PR that went through 15 rounds of review. Each round I learned something new. The maintainer eventually offered me a job because I was so responsive and willing to learn! 💼

### Rule #9: Keep Your PR Up to Date

**PRs can get stale while waiting for review!**

**The problem:**
```
Day 1: You submit PR
Day 3: Someone merges other changes
Day 5: Your PR has merge conflicts
Day 7: Maintainer can't merge it
Result: Your PR sits forever ⏳
```

**The solution:**
```bash
# Regularly update your branch
git checkout main
git pull upstream main
git checkout your-branch
git rebase main
git push -f origin your-branch

# Or use GitHub's "Update branch" button
```

**When to update:**
- When conflicts appear
- When tests start failing
- When maintainer asks you to rebase
- When it's been more than a week

**Be proactive!** Don't make the maintainer ask!

### Rule #10: Know When to Close Your PR

**Sometimes the right move is closing your PR.**

**Close when:**
```markdown
✅ Maintainer explains it won't be merged (philosophy/direction reasons)
✅ Someone else submitted a better solution
✅ You realize you were wrong about the issue
✅ The project went a different direction
✅ You don't have time to address feedback
```

**DON'T close when:**
```markdown
❌ First round of feedback (they're trying to help!)
❌ Review takes more than 2 days (maintainers are busy!)
❌ You're frustrated (take a break, come back)
```

**The graceful close:**
```markdown
"After thinking about the feedback, I agree this isn't the right
approach for the project. Closing this PR. Thanks for the discussion!"
```

**This shows maturity and maintainers will remember you positively!** 🌟

## The Perfect PR Template 📋

**Save this template and use it every time:**

```markdown
## Description
[What does this PR do? Be specific!]

## Motivation
[Why is this change needed? Link to issue!]

## Changes
- [Bullet point list of changes]
- [Be specific about what was modified]

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
- [ ] Test A
- [ ] Test B
- [ ] All existing tests pass

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)
[Add screenshots to help explain your changes]

## Additional Notes
[Any additional information for reviewers]

Fixes #[issue-number]
```

**Many projects have PR templates!** Use theirs if it exists, or adapt this one!

## Real PR Examples (Learn from These!) 🎓

### Example #1: The Perfect Bug Fix PR

**Title:** `Fix null pointer exception when rendering empty user bios`

**Description:**
```markdown
## Description
Fixes crash that occurs when users with empty bio field try to view
their profile page.

## Motivation
Users were reporting 500 errors when viewing their profiles (issue #234).
After investigation, found that we assume `user.bio.text` always exists,
but bio is an optional field.

## Changes
- Added null check in ProfileView.render()
- Used optional chaining: `user.bio?.text ?? "No bio"`
- Added defensive coding in bio-related components

## How Has This Been Tested?
- ✅ Created test user with no bio - renders correctly
- ✅ Created test user with bio - still works
- ✅ Added unit test: `test_empty_bio_renders_gracefully()`
- ✅ All 247 existing tests pass

## Performance Impact
No performance impact - optional chaining has negligible overhead.

## Screenshots
Before: [500 error screenshot]
After: [working profile with "No bio" placeholder]

Fixes #234
```

**Why this is perfect:**
- Clear problem statement
- Shows investigation work
- Specific solution
- Comprehensive testing
- Proves it works with screenshots
- Links to issue

**Result:** Merged in 4 hours! ⚡

### Example #2: The Perfect Feature PR

**Title:** `feat: Add user avatar upload functionality`

**Description:**
```markdown
## Description
Implements user avatar upload feature as discussed in issue #156.

## Motivation
Users requested the ability to upload custom avatars instead of using
default placeholder images.

## Changes
- Added avatar upload endpoint: POST /api/users/avatar
- Implemented image validation (format, size, dimensions)
- Added S3 integration for avatar storage
- Created AvatarUpload React component
- Updated user profile page to use uploaded avatars
- Added fallback to default avatar if upload fails

## Technical Decisions
- Max file size: 5MB (configurable via env var)
- Allowed formats: JPG, PNG, WebP
- Auto-resize to 400x400 (preserves aspect ratio)
- S3 bucket: user-avatars-prod (already exists)
- Used existing ImageProcessor service

## How Has This Been Tested?
Manual testing:
- ✅ Upload JPG avatar - works
- ✅ Upload PNG avatar - works
- ✅ Upload too-large file - shows error
- ✅ Upload invalid format - shows error
- ✅ Upload without auth - returns 401

Automated testing:
- ✅ Added 12 unit tests for validation
- ✅ Added 5 integration tests for upload flow
- ✅ All 259 existing tests pass

## Security Considerations
- File type validation (not just extension check!)
- Size limits enforced server-side
- Sanitized filenames (prevent directory traversal)
- Authenticated endpoints only
- S3 bucket has proper CORS and access policies

## Performance
- Image processing happens async (doesn't block request)
- Thumbnails generated in background job
- CDN caching configured (CloudFront)

## Screenshots
[Before: Default avatar placeholder]
[After: Upload modal UI]
[After: Uploaded avatar displayed]

## Breaking Changes
None - this is purely additive.

## Documentation
- Updated API docs with new endpoint
- Added user guide for avatar upload
- Updated .env.example with new config vars

Closes #156
```

**Why this is excellent:**
- Comprehensive explanation
- Shows you thought about edge cases
- Security considerations (important!)
- Performance considerations
- Documentation updated
- No breaking changes (maintainer loves this!)

**Result:** Maintainer response: "This is beautiful! Merging!" 😍

### Example #3: The "Please Don't Do This" PR

**Title:** `Update`

**Description:**
```markdown
fixed stuff
```

**Changed files:** 43

**Commits:**
```
wip
more
asdf
final
ok
```

**Tests:** None

**Issue link:** None

**Result:** Closed with "Please read CONTRIBUTING.md and open a focused PR" 🚫

**Don't be this person!**

## The Follow-Up Etiquette 🎭

### When Maintainer Requests Changes

**Good response:**
```markdown
"Thanks for the thorough review! I've addressed all your comments:

1. Added tests for edge cases (commit abc123)
2. Fixed the performance issue with caching (commit def456)
3. Updated docs (commit ghi789)

Ready for another look! Let me know if anything else needs attention."
```

**Bad response:**
```markdown
"k fixed"
```

**The maintainer put effort into reviewing. Show you appreciate it!**

### When Your PR Gets Merged

**ALWAYS say thank you!**

```markdown
"Thanks so much for merging this! And thanks for the patient review
and feedback - I learned a lot! Happy to contribute more in the future! 🎉"
```

**Why this matters:**
- Maintainers are volunteers
- Positive interactions build community
- You're likely to contribute again
- Karma is real in open source!

### When Your PR Gets Closed

**Stay professional:**

```markdown
"Thanks for taking the time to review this and explain why it doesn't
fit the project direction. I understand now and appreciate the feedback.
I'll keep this in mind for future contributions!"
```

**DON'T:**
```markdown
"This is bullshit! My code is good!"
"You don't know what you're doing!"
"Fine, I'll fork and make my own!"
```

**Remember:** The open source community is small. Burning bridges helps no one!

## Common PR Mistakes (I've Made Them All!) 🚨

### Mistake #1: The "Surprise" PR

**The trap:**
```markdown
*Spends 2 weeks building feature*
*Submits PR*
Maintainer: "We decided not to add this. Discussed in issue #45"
```

**The fix:** ALWAYS discuss in an issue first! Get approval BEFORE coding!

### Mistake #2: The "Force Push After Review"

**The disaster:**
```bash
Reviewer: *leaves 15 comments on your code*
You: git push -f  # Rewrites history
Reviewer: *all their comments are now orphaned*
Reviewer: *cries*
```

**The fix:** Don't force push after people have reviewed! Add new commits!

### Mistake #3: The "I'll Fix It Later" PR

**The problem:**
```markdown
You: "I know the tests are failing but merge it and I'll fix later"
Maintainer: "No."
```

**The fix:** Fix it BEFORE submitting! Don't merge broken code!

### Mistake #4: The "I Changed Everything" PR

**The chaos:**
```diff
+ Reformatted entire codebase (10,000 lines)
+ Also added my feature (100 lines)
```

**The fix:** One PR = one change! Don't bundle refactoring with features!

### Mistake #5: The "No Tests" PR

**The problem:**
```markdown
You: "Added new feature"
Maintainer: "Where are the tests?"
You: "I tested it manually"
Maintainer: "That's not how this works"
```

**The fix:** Add automated tests! Manual testing isn't enough!

## Advanced PR Tips (Level Up!) 🚀

### Tip #1: Use Draft PRs

**When you're not ready for review:**
```markdown
Open as "Draft PR"
Get early feedback on approach
Mark as "Ready for review" when done
```

**This is GOLD for:**
- Getting feedback before you finish
- Showing progress on long-running work
- Collaborating with other contributors

### Tip #2: Use PR Labels

**Help maintainers triage:**
```markdown
Add labels: "bug", "feature", "documentation"
Some projects auto-label based on PR title
Follow the project's labeling convention
```

### Tip #3: Request Specific Reviewers

**If the project allows:**
```markdown
@mention experts in the area you changed
"Hey @db-expert, could you review the SQL changes?"
Don't abuse this - only when truly relevant
```

### Tip #4: Use GitHub Suggestions

**Make reviewer's life easy:**
```markdown
Reviewer can click "Commit suggestion" button
Their feedback gets applied instantly
Shows you respect their expertise
```

### Tip #5: Add Benchmarks for Performance

**For performance improvements:**
```markdown
## Benchmarks

Before:
Query time: 2.3s
Memory usage: 450MB

After:
Query time: 0.3s (-87%)
Memory usage: 120MB (-73%)

Tested with 10,000 records.
```

**Numbers speak louder than words!** 📊

## The Bottom Line 💡

Good PR etiquette is the difference between getting merged and getting ignored!

**What you learned today:**
1. Read CONTRIBUTING.md (seriously!)
2. One PR = one focused change
3. Write descriptive titles and descriptions
4. Link to issues
5. Make it easy to review
6. Respond to feedback gracefully
7. Keep PRs updated
8. Say thank you!
9. Tests are not optional
10. Respect maintainers' time

**The reality:**

**Good PR etiquette:**
- ✅ Gets merged quickly
- ✅ Builds your reputation
- ✅ Leads to more contributions
- ✅ Makes maintainers happy
- ✅ Improves the project
- ✅ You learn and grow

**Bad PR etiquette:**
- ❌ PR sits forever or gets closed
- ❌ Damages your reputation
- ❌ Wastes everyone's time
- ❌ Frustrates maintainers
- ❌ Doesn't help the project
- ❌ You learn nothing

**My mantra:** Treat every PR like you're applying for a job (because in open source, you kind of are!)

## Your Action Plan 🚀

**Next time you open a PR:**

1. Read CONTRIBUTING.md (yes, really!)
2. Check if issue discussion happened
3. Make focused, single-purpose change
4. Write killer title and description
5. Add tests
6. Review your own PR first
7. Be responsive to feedback
8. Say thank you when merged

**This week:**

1. Review your open PRs (cringe time!)
2. Update any that are waiting for you
3. Close any that are clearly dead
4. Improve descriptions on pending PRs

**This month:**

1. Become known for excellent PRs
2. Help review others' PRs (give back!)
3. Contribute to projects you use
4. Build relationships with maintainers

**Going forward:**

1. Make PR quality your signature
2. Maintainers will WANT your contributions
3. Get invited to be a maintainer yourself
4. Help others learn good etiquette! 🎓

## Resources You Need 📚

**Templates:**
- The template in this post (copy it!)
- GitHub's PR template feature
- Project-specific templates

**Tools:**
- GitHub CLI (`gh pr create`)
- Git hooks for pre-commit checks
- Linters and formatters
- PR checklist apps

**Reading:**
- How to Write a Git Commit Message (Chris Beams)
- GitHub's PR best practices
- Your favorite project's CONTRIBUTING.md

**Examples of great PR etiquette:**
- Check merged PRs in well-run projects
- Rust project (amazing PR culture)
- React (great review process)
- Rails (excellent contributor guidelines)

## Final Thoughts 💭

**The uncomfortable truth:**

Maintainers get dozens of PRs per week. Most are low-effort and waste their time. Yours is probably one of them!

**But here's the good news:**

By following proper PR etiquette, YOUR contributions will stand out. Maintainers will see your name and think "Oh good, this person gets it. Let me prioritize this!" 🌟

**The best part?**

Good PR etiquette is a SKILL that makes you better at:
- Communication (clarity wins!)
- Collaboration (teamwork!)
- Code quality (review makes you better!)
- Project management (understanding scope!)
- Career growth (employers notice OSS contributions!)

**Your next PR will be AMAZING!** 💪

**So here's my challenge:**

Right now, think of a project you use. Find a small issue. Open a PERFECT PR using this guide. Experience the joy of getting merged!

**Questions to ask yourself:**
- Have I been opening lazy PRs? (Time to step up!)
- Do I respond to feedback promptly? (Make it a priority!)
- Am I following contribution guidelines? (Read them!)
- Am I being respectful to maintainers? (Always!)

**Your move!** ♟️

---

**Want to master PR etiquette?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I review PRs daily!

**See my PR style in action?** Check out my [GitHub](https://github.com/kpanuragh) contributions and open PRs!

*Now go open some beautiful PRs!* 🚀✅✨

---

**P.S.** If you're a maintainer reading this: Share this with your contributors! Maybe it'll reduce the "fixed stuff" PRs! 😅

**P.P.S.** Remember: Every maintainer was once a nervous first-time contributor. Be patient with newbies, but also expect them to follow the guidelines. Setting standards raises the whole community! 💚
