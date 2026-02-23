---
title: "I Published My First Composer Package on Packagist and It Was Nothing Like I Expected 📦😅"
date: "2026-02-23"
excerpt: "I spent 3 days writing a Laravel helper package, 10 minutes publishing it to Packagist, and the next 6 months dealing with the consequences. Here's everything nobody told me before I clicked that 'Submit' button."
tags: ["open-source", "github", "php", "laravel", "community"]
featured: true
---

# I Published My First Composer Package on Packagist and It Was Nothing Like I Expected 📦😅

**Honest confession:** I once `composer require`'d a package, spotted a bug, thought "I could totally write this better," and then actually did it.

Big mistake. Best mistake.

As a full-time developer who contributes to open source, I can tell you there's a very specific kind of terror that hits you when you type `composer require your-own-name/your-own-package` for the first time and it **works**. Like... other people could install this now. Other people's production apps. With real users. Breathing. 😰

Let me walk you through what really happens when you publish your first PHP package.

## The "Simple" Package Idea 💡

It started innocently. I was working on a Laravel project and kept copying the same three helper functions between projects — a phone number formatter, a Bengali numerals converter, and a sneaky little method to mask sensitive data in logs.

Three functions. Every project. Copy-paste. Like an absolute caveman.

*"I'll just extract these into a package,"* I thought. *"How hard could it be?"*

(Famous last words in software development, right behind "I'll just add this one feature" and "we don't need tests for this.")

## Setting Up the Package Structure 🗂️

Here's the thing nobody tells you: Composer packages have opinions. Strong ones.

```
my-package/
├── src/
│   └── MyServiceProvider.php
├── tests/
├── composer.json
├── README.md
├── LICENSE
└── .github/
    └── workflows/
        └── tests.yml
```

Your `composer.json` is the heart of it all:

```json
{
    "name": "anuraghkp/laravel-utils",
    "description": "Handy utilities for Laravel projects",
    "type": "library",
    "license": "MIT",
    "require": {
        "php": "^8.1",
        "illuminate/support": "^10.0|^11.0"
    },
    "require-dev": {
        "orchestra/testbench": "^8.0|^9.0",
        "phpunit/phpunit": "^10.0"
    },
    "autoload": {
        "psr-4": {
            "Anuraghkp\\LaravelUtils\\": "src/"
        }
    }
}
```

**Balancing work and open source taught me this:** The version constraints in `require` will haunt you. Too strict and nobody can install your package alongside their other deps. Too loose and you're promising compatibility you haven't tested. The `^10.0|^11.0` syntax is your friend — it means "I've actually tested this on both, I promise."

## The Part Nobody Warns You About: The README 📝

I thought writing the code was the hard part. I was wrong.

The README is where packages live or die. I've closed browser tabs on packages with amazing code and terrible READMEs. Brutal? Yes. True? Absolutely.

My first README was 8 lines. A heading, one sentence description, and an installation command. That's it.

The first GitHub issue I received?

> **"How do I use this?"**

From a stranger. On the internet. About code I wrote. 😭

Real talk: a good open source README needs:

```markdown
## Installation
composer require anuraghkp/laravel-utils

## Usage
// Actual code examples. MANY of them.

## Configuration
// What can they customize?

## Requirements
// PHP 8.1+, Laravel 10+, etc.

## Contributing
// How to send PRs without making you cry

## License
// MIT, Apache, GPL — pick one and mean it
```

Spend as much time on the README as you spend on the code. I'm only slightly exaggerating.

## Releasing to Packagist 🚀

Actually submitting to Packagist is shockingly easy. You push your code to GitHub, go to packagist.org, paste the repo URL, click Submit.

That's... it.

The terrifying part is that **it's immediately installable by anyone on Earth.**

```bash
# Somewhere in the world, right now:
composer require anuraghkp/laravel-utils
```

In the security community, we talk a lot about supply chain attacks — malicious packages sneaking into legitimate dependency trees. Publishing a package means you're now part of someone else's supply chain. That responsibility hit me like a truck.

**Security basics I learned the hard way:**

```bash
# Set up GitHub secret scanning
# (Packagist tokens in your repo = someone else's free package publishing)

# Add a SECURITY.md file
# Tell people HOW to report vulnerabilities to you privately

# Sign your releases
# Or at minimum, use GitHub's protected tags
```

## Versioning Will Break Your Soul 💔

Semantic versioning sounds simple: `MAJOR.MINOR.PATCH`.

- Patch: bug fix (1.0.1)
- Minor: new feature, backwards compatible (1.1.0)
- Major: breaking change (2.0.0)

Then someone opens an issue saying your bug fix *is* a breaking change for their use case. And they're right. And you have to figure out whether to yank a release.

**I yanked a release once.** I had a method that silently returned `null` on failure (bug). I "fixed" it to throw an exception (correct behavior). Three people were depending on the null return behavior. Oops. **Version bump to 2.0.0** it is.

The lesson: read the [PHP-FIG semantic versioning guide](https://semver.org/) before your first release, not after your second crisis.

## CI/CD Is Non-Negotiable 🔄

Before I got serious about this, my "testing process" was running `php artisan test` in my Laravel app. For a standalone package, that doesn't work.

Enter `orchestra/testbench` — the magic package that lets you test Laravel packages without a full Laravel app:

```php
// tests/TestCase.php
class TestCase extends \Orchestra\Testbench\TestCase
{
    protected function getPackageProviders($app): array
    {
        return [MyServiceProvider::class];
    }
}
```

And a GitHub Actions workflow that actually runs:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        php: ['8.1', '8.2', '8.3']
        laravel: ['10.*', '11.*']
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
      - run: composer require "laravel/framework:${{ matrix.laravel }}" --no-update
      - run: composer install
      - run: ./vendor/bin/phpunit
```

**That matrix test setup saved me embarrassment at least four times.** Code that worked perfectly on PHP 8.2 silently broke on 8.1. Users would have found it before I did. Not a great look.

## The First "Stranger PR" Moment 🤝

Three weeks after publishing, I got a pull request from someone I'd never met.

They'd found a bug in my phone formatter for numbers with country codes, written a failing test to reproduce it, fixed it, and submitted the PR. Clean. Documented. Already tested.

I stared at that notification for a full minute.

Someone spent their Saturday morning improving code I wrote. For free. Because they found it useful.

That's it. That's why open source exists. That single PR made every hour I spent on documentation, CI setup, and changelogs worth it.

**In the security community**, we talk about trust — and getting your first external contributor is the moment your package becomes a community instead of a personal project. Treat their contribution like a gift, because it is one.

## What I'd Tell My Past Self 📣

**Before you publish:**
- Write tests. Real ones. Using `testbench`.
- Write a README that a complete stranger can follow.
- Set up GitHub Actions. The matrix tests will save you.
- Add a `SECURITY.md` file with a way to report vulnerabilities privately.
- Pick a license. MIT is fine. Just pick one.

**After you publish:**
- Set up Packagist webhooks so releases auto-update.
- Keep a `CHANGELOG.md`. Every release. No exceptions.
- Respond to issues within a week. Ghost your users and they'll fork and abandon you.
- Tag your releases — don't make people `dev-main`.

**The uncomfortable truth:** When someone `composer require`'s your package in production, they're trusting you. That's a real thing. Take it seriously.

## Your Move 🎯

Got a bunch of helper functions you keep copying between projects? That's a package. An opinionated validation rule? That's a package. A Blade component you use everywhere? That's a package.

The barrier to entry is lower than you think. The responsibility is higher.

Both of those facts are good.

---

**Building a Laravel package?** Hit me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'll review your `composer.json` and tell you what's going to break before Packagist does. 😄

*Now stop copy-pasting your helpers and ship something the community can use.* 📦✨
