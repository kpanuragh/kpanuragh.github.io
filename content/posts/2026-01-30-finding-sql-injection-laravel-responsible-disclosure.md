---
title: "I Accidentally Found SQL Injection in Laravel (While Procrastinating) 😅"
date: "2026-01-30"
excerpt: "Was building my 'perfect' framework with DDD, TDD, and Clean Architecture. Ended up finding security bugs in Laravel instead. Classic developer move."
tags: ["laravel", "security", "sql-injection", "responsible-disclosure", "cybersecurity"]
featured: true
---

# I Accidentally Found SQL Injection in Laravel (While Procrastinating) 😅

**TL;DR:** I was supposed to be building a "revolutionary" framework with DDD, TDD, Clean Architecture, and all the fancy buzzwords. Instead, I found SQL injection bugs in Laravel and somehow got my fix merged. My mom still doesn't understand what I do for a living.

This is the story of how procrastination, curiosity, and too much chai led to an accidental security contribution.

## The Setup: Every Developer's Famous Last Words 🎬

"I'm gonna build my own framework!"

Yeah, I said it. We all say it at some point, right?

There I was, trying to create the "perfect" base framework with:
- **Domain-Driven Design** (because monoliths are for peasants)
- **Test-Driven Development** (write tests first, they said, it'll be fun, they said)
- **Clean Architecture** (Uncle Bob would be proud!)
- **All the patterns** (Factory, Repository, Strategy, Singleton, you name it)

**Spoiler:** I didn't finish the framework. But I did find something interesting! 😂

## The Accidental Discovery 🕵️

So I'm building this query builder for my framework (because obviously I need to reinvent that wheel too), and I'm like:

*"Let me see how Laravel does it. Just for inspiration. Not copying, I swear."*

I open up `MySqlGrammar.php` and I see this:

```php
public function compileRandom($seed)
{
    return 'RAND('.$seed.')';
}
```

**Me:** 🤔 "Wait... that's just string concatenation?"

**Also me:** 🤨 "That can't be right. Laravel is used by millions. They must have validation somewhere else."

**Narrator:** *They did not have validation somewhere else.*

## The "Oh No" Moment 💡

I started testing my own framework's query builder against SQL injection (because TDD, right?) and thought:

*"Let me make sure Laravel isn't vulnerable to the same thing. Just to be safe."*

Turns out... it was.

**Two methods, actually:**

### Bug #1: `inRandomOrder($seed)`

```php
// This seemed fine...
DB::table('posts')->inRandomOrder(42)->get();

// Until I tried THIS:
$seed = "1) AND EXTRACTVALUE(1,CONCAT(0x7e,DATABASE()))--";
DB::table('posts')->inRandomOrder($seed)->get();
```

**Result:** Hello, database name! 👋

**Me:** 😳 "Okay, that's... not good."

### Bug #2: `forceIndex($index)`

```php
// Normal use case
DB::table('users')->forceIndex('email_idx')->get();

// What if someone passes user input?
$index = "users) UNION SELECT password FROM admin--";
DB::table('users')->forceIndex($index)->get();
```

**Result:** All your passwords are belong to us. 💀

**Me:** 😰 "Oh crap. OH CRAP."

## The Panic Phase 😨

Now, normal people would:
1. Report it responsibly
2. Wait for a response
3. Move on with their lives

Me? I went through these stages:

**Stage 1: Denial**
*"Nah, I must be doing it wrong. Laravel has millions of users!"*

**Stage 2: More Testing**
*Tests 20 different payloads*
*All work*

**Stage 3: Imposter Syndrome**
*"I'm a nobody. Who am I to find bugs in Laravel?"*

**Stage 4: Responsible Adult**
*"Okay, I need to report this properly."*

**Stage 5: Procrastination**
*"But what if they laugh at me?"*

**Stage 6: Finally Reporting It**
*"Here goes nothing..."*

## The Responsible Disclosure (AKA: Scary Email Time) 📧

**January 16, 2026, 2:37 AM** (because of course it's 2 AM)

I submitted a security advisory through GitHub. My hands were literally shaking. The email basically said:

> "Hi, uh, I think I found something? Maybe? I'm probably wrong but here's what I found. Sorry if this is dumb. Please don't hate me."

**My actual report was more professional. But that's what it felt like.**

What I included:
- The two vulnerable methods
- Proof of concept code
- Attack scenarios
- A suggested fix (because if I'm reporting it, might as well help fix it)

**Advisory ID:** GHSA-9p82-4j4w-5hw8

Then I waited. And waited. And refreshed my email 847 times.

## The Response (They Didn't Laugh!) 😅

**3 days later**, I got this:

> "Thank you very much for your vulnerability report. We appreciate your commitment to responsible disclosure. We take all security reports seriously."

**My reaction:**
1. They responded! 🎉
2. They took it seriously! 🎉🎉
3. They didn't call me an idiot! 🎉🎉🎉

They reviewed it, confirmed it was real, and started working on a fix.

**The crazy part?** They asked if I wanted to submit a patch.

**Me:** "Wait, you want MY code in Laravel? LARAVEL LARAVEL?"

## The Fix (My Code in Laravel?!) 🛠️

Here's what I submitted:

```php
public function compileRandom($seed)
{
    // Validate it's actually a number
    if (!is_numeric($seed)) {
        throw new InvalidArgumentException('Seed must be numeric');
    }

    // Cast to int for extra safety
    return 'RAND('.((int) $seed).')';
}
```

**Simple fix. But it works.**

They reviewed it, made some tweaks, and **merged it**!

**Commit:** [`1dcf0b3`](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)
**Version:** Laravel 12.48.0
**My name:** Right there in the commit!

My mom called and asked if I was famous now. I said "kinda?" She still doesn't get it. 😂

## The Plot Twist: It's Not Really a Bug? 🤔

After merging the fix, Laravel's team sent me this:

> "We've decided not to issue a CVE. These methods aren't meant to receive user input directly. The vulnerability only exists if developers don't validate input first."

**Translation:** "Your fix is good, but developers shouldn't be passing raw user input to database methods anyway."

**And they're right!**

This is like finding out your car's gas tank isn't explosion-proof... but realizing you shouldn't be throwing matches at it in the first place. 😅

**Bad code that would trigger this:**
```php
// Don't do this. Ever.
$seed = $request->input('seed');
DB::table('posts')->inRandomOrder($seed)->get();
```

**Good code:**
```php
// Do this instead
$allowedSeeds = [1, 2, 3, 42];
$seed = $request->input('seed');

if (!in_array($seed, $allowedSeeds, true)) {
    abort(400, 'Invalid seed');
}

DB::table('posts')->inRandomOrder($seed)->get();
```

## What I Actually Learned 📚

### Lesson 1: Procrastination Can Be Productive

Was I supposed to be building my framework? Yes.
Did I get distracted reading Laravel's source? Also yes.
Did it work out? Surprisingly yes!

**Conclusion:** Productive procrastination is still procrastination, but with better stories.

### Lesson 2: Imposter Syndrome Is a Liar

I almost didn't report it because "who am I to find bugs in Laravel?"

**Reality check:** Even the best codebases have bugs. Finding them doesn't make you special, it makes you lucky. Reporting them makes you helpful.

### Lesson 3: The Real Lesson (Boring But Important)

**NEVER. PASS. RAW. USER. INPUT. TO. DATABASE. METHODS.**

I don't care if it's Laravel, my framework, or your grandma's PHP scripts from 2005.

```php
// ❌ BAD - How to get hacked
$sort = $_GET['sort'];
DB::table('users')->orderBy($sort)->get();

// ✅ GOOD - How to keep your job
$allowed = ['name', 'email', 'created_at'];
$sort = in_array($_GET['sort'], $allowed) ? $_GET['sort'] : 'name';
DB::table('users')->orderBy($sort)->get();
```

**It's not rocket science. It's just validation.**

## The "Achievement" (I Guess?) 🏆

Look, I'm not gonna lie and say this doesn't look good on a resume. It does.

**What I got:**
- My name in Laravel's commit history ([proof](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814))
- A cool story for interviews
- Validation that reading source code is useful
- Street cred with exactly 3 of my developer friends

**What I didn't get:**
- Money (Laravel has no bug bounty)
- Fame (my mom still doesn't get it)
- A job offer from Laravel (a guy can dream)
- My framework finished (still procrastinating on that)

**Was it worth it?** Hell yeah!

## My "Revolutionary" Framework Status: Still Not Done 😂

Remember that DDD/TDD/Clean Architecture framework I was building?

**Current status:**
- ✅ Has a cool name
- ✅ Has a GitHub repo
- ❌ Has literally zero code
- ✅ Has a bunch of TODO comments
- ✅ Helped me find bugs in Laravel (task failed successfully!)

I'll finish it someday. Maybe. Probably not. Who am I kidding? 🤷‍♂️

## Actual Practical Advice 💡

### If You're Building Your Own Framework:

1. **Don't** (use Laravel, it's good!)
2. But if you must, read other frameworks' source code
3. Test EVERYTHING for SQL injection
4. Use parameterized queries
5. Validate ALL user input

### If You're Using Laravel (or any framework):

**Stop doing this:**
```php
// This is how you lose your job
$userInput = $request->input('column');
DB::table('users')->orderBy($userInput)->get();
```

**Start doing this:**
```php
// This is how you keep your job
$allowedColumns = ['name', 'email', 'created_at'];
$column = in_array($request->input('column'), $allowedColumns)
    ? $request->input('column')
    : 'created_at';
DB::table('users')->orderBy($column)->get();
```

### If You Find a Security Bug:

1. Don't panic (I panicked, learn from my mistakes)
2. Report it privately (GitHub Security Advisories for public repos)
3. Give them time to fix it (don't tweet about it immediately)
4. Be nice (maintainers are people too)
5. Don't expect money (but recognition is cool)

## Resources (Boring But Useful) 📖

**Report Laravel security issues:**
- GitHub: [https://github.com/laravel/framework/security/advisories](https://github.com/laravel/framework/security/advisories)
- Email: taylor@laravel.com (for private reports)

**My commit in Laravel:**
- [View it on GitHub](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)

**Learn more about SQL injection:**
- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- Or just... validate your inputs. Really. Just do it.

## The Bottom Line 🎯

I set out to build a framework. I ended up finding bugs in Laravel instead.

**Lessons learned:**
- Procrastination can be productive
- Imposter syndrome is dumb
- Always validate user input
- Reading source code is underrated
- My framework is never getting finished

**Would I do it again?** Absolutely. Finding this bug was more educational than any tutorial.

**Will I finish my framework?** Check back in 5 years. Maybe. No promises.

---

## Connect & Stuff 🤝

If you enjoyed this story of accidental success:

🔗 **LinkedIn:** [linkedin.com/in/anuraghkp](https://www.linkedin.com/in/anuraghkp)
👨‍💻 **GitHub:** [github.com/kpanuragh](https://github.com/kpanuragh)
🔒 **The Actual Commit:** [See my name in Laravel!](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)

**Questions?** DMs are open. Just don't ask when my framework will be ready. 😅

---

## Update Timeline ⏰

**Jan 16, 2026:** Accidentally found bugs while "researching" for my framework
**Jan 16, 2026, 2:37 AM:** Finally got courage to report it (GHSA-9p82-4j4w-5hw8)
**Jan 19, 2026:** Laravel responded (didn't laugh at me!)
**Jan 20, 2026:** My patch merged ([Commit 1dcf0b3](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814))
**Jan 30, 2026:** Writing this blog instead of finishing my framework
**Version fixed:** Laravel 12.48.0+

---

**Remember:** The best code you'll ever write is code that makes someone else's code better. Even if you found it by accident while procrastinating. 😊

*P.S. - If anyone wants to collaborate on that DDD/TDD/Clean Architecture framework... just kidding, I'm never finishing it. But the dream lives on!* 😂

*P.P.S - Validate your damn inputs.*
