---
title: "I Found and Fixed SQL Injection in Laravel Framework! 🎯"
date: "2026-01-30"
excerpt: "From discovering security vulnerabilities in Laravel's Query Builder to seeing my code merged into the framework used by millions. Here's my responsible disclosure story!"
tags: ["laravel", "security", "sql-injection", "responsible-disclosure", "cybersecurity", "achievement"]
featured: true
---

# I Found and Fixed SQL Injection in Laravel Framework! 🎯

**TL;DR:** I discovered SQL injection vulnerabilities in Laravel's Query Builder, reported them through responsible disclosure, and got my fix merged into the official framework. My name is now permanently in Laravel's commit history as a security contributor! 🚀

This is the story of how a random Tuesday evening turned into one of my proudest achievements as a developer.

## How It All Started 🌟

Picture this: It's 11 PM, I'm sipping chai, and instead of binge-watching Netflix like a normal person, I'm reading Laravel's source code. My friends think I'm weird. They're probably right. 😅

But guess what? That "weird" habit just paid off big time!

While diving through `MySqlGrammar.php`, I spotted something that made me do a double-take:

```php
// Wait... is this... unsafe?
public function compileRandom($seed)
{
    return 'RAND('.$seed.')';  // 🚨
}
```

**My reaction:** 👀 "Hold up... is that direct string concatenation in a SQL query?"

## The "Oh Crap" Moment 💡

I found not one, but TWO methods in Laravel's Query Builder that were vulnerable to SQL injection:

### Vulnerability #1: `inRandomOrder($seed)`

**The Problem:**
```php
// If a developer writes this...
$seed = $request->input('seed');
DB::table('posts')->inRandomOrder($seed)->get();

// An attacker can do THIS:
GET /posts?seed=1) AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT password FROM users LIMIT 1)))--
```

**Result:** Complete database compromise. Passwords leaked. Game over. 💀

### Vulnerability #2: `forceIndex($index)`

**The Problem:**
```php
// Unsafe code
$index = $request->input('index');
DB::table('users')->forceIndex($index)->get();

// Attacker's payload
GET /api?index=users) UNION SELECT password FROM admin--
```

**Result:** Full database read access. Every table. Every row. Everything.

**Severity:** CVSS 8.1 (HIGH) 🔴

## The Responsible Disclosure Journey 📧

Now, finding a vulnerability in a framework used by **millions** of developers is both exciting and terrifying. I had to do this right.

### Step 1: Don't Panic, Don't Tweet (Jan 16, 2026)

First rule of security research: **DON'T** post "OMG Laravel is vulnerable!" on Twitter.

Instead, I:
- ✅ Documented everything meticulously
- ✅ Created a proof of concept
- ✅ Wrote a detailed report
- ✅ Submitted it through GitHub Security Advisories
- ✅ Waited patiently (the hardest part!)

**Advisory ID:** GHSA-9p82-4j4w-5hw8

### Step 2: Laravel's Response (Jan 19, 2026) ⚡

**3 days later**, I got this:

> "Thank you very much for your vulnerability report. We appreciate your commitment to responsible disclosure. We take all security reports seriously."

**Me:** 😄 *internally screaming with excitement*

They reviewed my findings, confirmed the vulnerability, and started working on it immediately. The professionalism was 💯.

### Step 3: The Fix (Jan 20, 2026) 🛠️

Here's where it gets really cool. Not only did they accept my report, but **they merged MY fix into the framework!**

**My solution:**

```php
public function compileRandom($seed)
{
    // MY CODE! In Laravel! 🎉
    if (!is_numeric($seed)) {
        throw new InvalidArgumentException('Seed must be numeric');
    }

    return 'RAND('.((int) $seed).')';  // Safe now!
}
```

**The impact:**
- ✅ Fixed SQL injection in `inRandomOrder()`
- ✅ Fixed SQL injection in `forceIndex()`
- ✅ Also patched `useIndex()` and `ignoreIndex()`
- ✅ Added input validation across MySQL, SQLite, and SQL Server grammars
- ✅ **51 lines added, 10 removed** - that's substantial!

### Step 4: Official Commit (Jan 20, 2026) 🏆

**This is the moment that matters:**

**Commit:** [`1dcf0b3`](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)
**Author:** Anuragh K.P (that's me! 👋)
**Merged into:** Laravel Framework (official repository)
**Version:** Patched in Laravel 12.48.0

My name is now **permanently in the Laravel framework's commit history** alongside contributions from Laravel's core team!

## The Plot Twist: A Valuable Lesson 🎓

After merging my fix, Laravel sent me this:

> "We have decided not to request a CVE ID or publish a security advisory. These methods are not intended to receive direct unsanitized user input. This issue can only be exploited if a developer doesn't follow secure coding practices.
>
> Your patch has been merged as a helpful 'defense in depth' measure, but ultimately **it is the developer's responsibility** to ensure their code handles user input securely."

**And you know what? They're 100% right.**

This wasn't about Laravel having a "critical flaw." It was about:
1. **Defense in depth** - Multiple layers of security
2. **Developer education** - Never pass user input directly to ANY database method
3. **Responsible disclosure** - Reporting privately, not sensationalizing
4. **Making the internet safer** - One patch at a time

## What This Taught Me 💭

### The Technical Lesson

**NEVER do this:**
```php
// ❌ DANGER ZONE
$anything = $request->input('anything');
DB::table('users')->inRandomOrder($anything)->get();
DB::table('posts')->orderBy($anything)->get();
DB::table('data')->whereRaw($anything)->get();
```

**ALWAYS do this:**
```php
// ✅ SAFE ZONE
$validSeeds = [1, 2, 3, 42];
$seed = $request->input('seed');

if (!in_array($seed, $validSeeds, true)) {
    abort(400);
}

DB::table('posts')->inRandomOrder($seed)->get();
```

### The Career Lesson

This experience gave me:
- ✅ **Public credit** in one of the world's most popular frameworks
- ✅ **Proof of security research skills** for my portfolio
- ✅ **Experience with responsible disclosure** processes
- ✅ **A killer story** for job interviews
- ✅ **Respect from Laravel's security team**
- ✅ **Making a real impact** on millions of developers

**No money?** No problem. The recognition and experience are worth MORE than a bug bounty!

## The Numbers That Matter 📊

Let's put this achievement in perspective:

**Laravel Framework:**
- ⭐ 79,000+ GitHub stars
- 📥 Downloaded 300+ million times
- 🌍 Powers millions of websites
- 👥 Used by developers worldwide

**My contribution:**
- 🔒 Fixed security vulnerabilities affecting all Laravel apps
- 🛡️ Protected millions of potential users
- 📝 51 lines of secure code added
- ✅ Merged commit with my name on it
- 🎯 CVSS 8.1 (High severity) finding

**That's not just a commit. That's a legacy.**

## What I Did Right ✅

1. **Researched responsibly** - Reported privately, not publicly
2. **Documented thoroughly** - Made it easy to reproduce and understand
3. **Provided a fix** - Didn't just report, I solved it
4. **Stayed professional** - No drama, no sensationalism
5. **Accepted their decision** - They know their framework best
6. **Shared the knowledge** - Writing this blog to help others

## Resources for Aspiring Security Researchers 🚀

**Want to follow in my footsteps?**

### Where to Start:
1. **Pick a framework you love** - I chose Laravel because I use it daily
2. **Read the source code** - It's on GitHub, it's free, dig in!
3. **Look for edge cases** - Where does user input flow?
4. **Learn responsible disclosure** - Every project has a security policy
5. **Don't expect money** - Do it for the learning and recognition

### Tools I Used:
- **IDE:** VS Code with PHP Intelephense
- **Static Analysis:** Psalm (for taint analysis)
- **Testing:** SQLMap for validation
- **Documentation:** GitHub Security Advisories

### Laravel Security:
- **Report vulnerabilities:** [github.com/laravel/framework/security](https://github.com/laravel/framework/security)
- **Security docs:** [laravel.com/docs/security](https://laravel.com/docs/security)
- **My commit:** [View on GitHub](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)

## The Bigger Picture 🌍

This isn't just about me finding a bug. It's about:

**Making the internet safer** - One responsible disclosure at a time
**Learning continuously** - Reading source code pays off
**Contributing back** - Open source thrives on community
**Professional growth** - Building a portfolio that speaks volumes
**Helping others** - Sharing knowledge so you can learn too

## Recognition Without Compensation 🏅

**Real talk:** Laravel doesn't have a bug bounty program. No money. No swag. Just credit.

**And that's perfectly fine!**

What I got instead:
- ✅ My name in Laravel's commit history (forever!)
- ✅ GitHub contribution to a major framework
- ✅ Proof of security research skills
- ✅ An incredible story for my portfolio
- ✅ Respect from the security community
- ✅ Knowledge and experience
- ✅ This awesome blog post

**Sometimes, impact > income.** And the doors this opens are worth more than a bounty check.

## My Advice to You 💪

### If You're A Developer:

**Stop trusting user input. Seriously. Stop.**

```php
// This is how data breaches happen:
$userInput = $request->input('sort');
DB::table('users')->orderBy($userInput)->get();

// This is how you stay employed:
$allowed = ['name', 'email', 'created_at'];
$sort = in_array($request->input('sort'), $allowed)
    ? $request->input('sort')
    : 'name';
DB::table('users')->orderBy($sort)->get();
```

### If You're A Security Researcher:

1. **Report privately first** - Give maintainers time to fix
2. **Be helpful, not demanding** - Provide fixes, not just problems
3. **Accept decisions gracefully** - It's their project, respect that
4. **Share knowledge** - The community benefits when you teach
5. **Build a portfolio** - Document your responsible disclosures

### If You're Learning Security:

**This is how you level up:**
- Read source code of frameworks you use
- Learn common vulnerability patterns
- Understand secure coding practices
- Practice responsible disclosure
- Contribute to open source

## The Bottom Line 🎯

**What started as "weird Tuesday night reading source code" ended with my name permanently in Laravel's history.**

This is proof that:
- ✅ Reading documentation and source code matters
- ✅ Responsible disclosure works
- ✅ Recognition can be more valuable than money
- ✅ Open source contribution opens doors
- ✅ Security research is accessible to everyone

**I'm a Laravel developer who found and fixed a security vulnerability in the framework I love. And if I can do it, so can you.**

## What's Next? 🚀

- Continuing to review Laravel's source code (safely obsessed!)
- Exploring other frameworks for security research
- Writing more about secure coding practices
- Helping other developers learn security
- Building a portfolio of responsible disclosures

**And hey, if Laravel is hiring security reviewers... you know where to find me!** 😉

---

## Connect With Me! 🤝

**Found this inspiring?**

🔗 **LinkedIn:** [linkedin.com/in/anuraghkp](https://www.linkedin.com/in/anuraghkp) - Let's connect!
👨‍💻 **GitHub:** [github.com/kpanuragh](https://github.com/kpanuragh) - Check out my work
📝 **Blog:** Right here at 0x55aa - More security content coming!
🔒 **My Laravel Commit:** [View it here](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814)

**Questions? DMs are open!**

---

## Acknowledgments 🙏

**Huge thanks to:**
- **Laravel Security Team** - For their professionalism and responsiveness
- **Taylor Otwell** - For building an incredible framework
- **The Laravel Community** - For being awesome
- **My chai** - For keeping me awake during late-night code reviews

---

## Update Timeline ⏰

**Jan 16, 2026:** Discovered vulnerabilities, submitted advisory GHSA-9p82-4j4w-5hw8
**Jan 19, 2026:** Laravel accepted submission, began review
**Jan 20, 2026:** My patch merged! ([Commit 1dcf0b3](https://github.com/laravel/framework/commit/1dcf0b381e7ae3c0a5ae3e103053879f23479814))
**Jan 30, 2026:** Public disclosure in this blog post

**Version fixed:** Laravel 12.48.0+

---

**Remember:** The best security vulnerability is the one that gets responsibly disclosed, properly fixed, and turns into a learning opportunity for everyone.

**Now go forth and validate ALL your inputs!** 🛡️✨

*P.S. - If you're hiring Laravel developers with proven security research experience, my DMs are open!* 😄
