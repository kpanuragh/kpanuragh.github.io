---
title: "Laravel Socialite: Stop Building Your Own OAuth (Your Users Are Begging You) 🔐"
date: "2026-03-04"
excerpt: "Rolling your own OAuth2 is like building your own airplane to go grocery shopping. Laravel Socialite exists. Use it."
tags: ["laravel", "php", "web-dev", "authentication", "oauth"]
---

# Laravel Socialite: Stop Building Your Own OAuth (Your Users Are Begging You) 🔐

I once watched a junior dev spend two weeks building a custom Google OAuth integration from scratch. Token exchanges, PKCE flows, state parameters, refresh token rotation... I felt the same secondhand exhaustion watching him as I do watching someone manually write a `for` loop to sum an array in 2026.

Laravel Socialite solves all of this in about 15 minutes. I am not exaggerating.

## The Problem: OAuth Is Deceptively Complex 😰

On paper, OAuth looks simple: "Click Google login → get user info → done." In practice, you're dealing with:

- State parameters (CSRF protection for the OAuth flow)
- Authorization code exchange for access tokens
- Token expiry and refresh logic
- Scope management
- Different providers doing things *slightly* differently (because of course they do)
- Edge cases when users deny permissions mid-flow

In production systems I've built, I've seen what happens when teams try to hand-roll this: subtle security bugs, tokens stored in plain text in sessions, missing state validation leaving users open to CSRF attacks. It's a nightmare dressed in a "this shouldn't be that hard" costume.

## The Solution: Socialite Does the Heavy Lifting 🏋️

```bash
composer require laravel/socialite
```

That's it. That's the installation.

Configure your providers in `config/services.php`:

```php
'google' => [
    'client_id' => env('GOOGLE_CLIENT_ID'),
    'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    'redirect' => env('GOOGLE_REDIRECT_URI'),
],
'github' => [
    'client_id' => env('GITHUB_CLIENT_ID'),
    'client_secret' => env('GITHUB_CLIENT_SECRET'),
    'redirect' => env('GITHUB_REDIRECT_URI'),
],
```

And your routes:

```php
Route::get('/auth/{provider}', [SocialiteController::class, 'redirect']);
Route::get('/auth/{provider}/callback', [SocialiteController::class, 'callback']);
```

## The Controller That Actually Does the Work 🎯

```php
use Laravel\Socialite\Facades\Socialite;

class SocialiteController extends Controller
{
    public function redirect(string $provider)
    {
        return Socialite::driver($provider)->redirect();
    }

    public function callback(string $provider)
    {
        $socialUser = Socialite::driver($provider)->user();

        $user = User::updateOrCreate(
            ['email' => $socialUser->getEmail()],
            [
                'name'              => $socialUser->getName(),
                'provider'          => $provider,
                'provider_id'       => $socialUser->getId(),
                'avatar'            => $socialUser->getAvatar(),
                'email_verified_at' => now(), // Already verified by Google/GitHub
            ]
        );

        Auth::login($user);

        return redirect('/dashboard');
    }
}
```

That's your entire social auth flow. The state validation, token exchange, CSRF protection — Socialite handles all of it silently in the background.

## Real Talk: The `updateOrCreate` Pattern Saves You 💡

Notice that `updateOrCreate` call? That's not an accident. As a Technical Lead, I've seen what happens when you use `firstOrCreate` instead:

A user signs up with their email/password first, then later tries "Login with Google" using the same email address. **Boom** — duplicate user, two accounts, support ticket, unhappy user.

`updateOrCreate` on the email field merges the social provider data onto the existing account. User doesn't even notice the behind-the-scenes linking. That's the kind of detail that separates production-grade auth from "it works on my machine" auth.

## Pro Tip: Don't Expose Your Callback to Every String 🛡️

The dynamic `{provider}` route is convenient, but always validate it:

```php
public function redirect(string $provider)
{
    abort_unless(
        in_array($provider, ['google', 'github', 'linkedin']),
        404
    );

    return Socialite::driver($provider)->redirect();
}
```

Without this check, an attacker could hit `/auth/someMaliciousProvider/callback` and potentially trigger unintended behavior. It's a small guard that costs you two lines and saves you a headache.

## Requesting Extra Scopes When You Need Them 📋

Sometimes "basic profile info" isn't enough. Maybe you need GitHub repo access or Google Drive permissions:

```php
// Ask for extra GitHub scopes
return Socialite::driver('github')
    ->scopes(['repo', 'read:user'])
    ->redirect();

// Force Google to always show account picker (great for multi-account users)
return Socialite::driver('google')
    ->with(['prompt' => 'select_account'])
    ->redirect();
```

A pattern that saved us in a real project: we needed to create GitHub issues on behalf of users in a developer tool we built. The `scopes()` method made requesting that access trivial — five minutes of work instead of rebuilding the OAuth dance.

## Handling the "User Denied Permission" Case 😬

Users are unpredictable. They'll click "Authorize" on the Google consent screen and then immediately hit the back button. Handle it:

```php
public function callback(string $provider, Request $request)
{
    if ($request->has('error')) {
        return redirect('/login')->with(
            'error',
            'You denied access. Login with email/password instead!'
        );
    }

    $socialUser = Socialite::driver($provider)->user();
    // ... rest of your callback
}
```

Without this, users who decline OAuth get a cryptic error page. With it, they get a graceful fallback. The difference between "this app is broken" and "this app handles edge cases like a pro."

## Supported Providers Out of the Box 🌐

Socialite ships with first-party support for:

- Google
- GitHub
- Facebook
- Twitter/X
- LinkedIn
- GitLab
- Bitbucket

And the community `socialiteproviders/socialite` package adds over **100 more** (Slack, Discord, Apple, Spotify... the list is wild). There's basically no OAuth provider you'd need that isn't already covered.

## Stateless Mode for APIs 🔌

Building an API instead of a traditional web app? Use stateless mode to skip session-based state storage:

```php
$socialUser = Socialite::driver('github')->stateless()->user();
```

Pair this with Sanctum tokens and you've got mobile-friendly social auth without touching sessions. Clean architecture, no hacks.

## Bonus Tips Section 🎁

**Store the provider token if you need it later:**
```php
'provider_token' => $socialUser->token,
```
Useful if you want to make API calls to GitHub/Google on the user's behalf after login.

**Avatar caching:** Don't serve Google's CDN avatar URLs directly in your UI — they expire. Download and store them in your own S3 bucket on first login.

**Testing Socialite:** Use `Socialite::shouldReceive('driver')` to mock the driver in feature tests. Testing social auth flows is completely possible and you have no excuse to skip it.

## The Before/After That Tells the Story 📊

**Before Socialite:**
- 2 weeks of implementation
- 300+ lines of OAuth plumbing code
- State management bugs discovered 3 months in production
- "Please don't touch the auth code" becomes a team rule

**After Socialite:**
- 1 afternoon, including reading the docs
- ~40 lines of actual business logic
- Battle-tested OAuth implementation used by thousands of apps
- Junior devs can understand and maintain it

As a Technical Lead, the second option isn't just easier — it's the *correct* architectural choice. You don't get extra credit for implementing OAuth from scratch. You get credit for shipping features that matter.

## TL;DR ✅

- `composer require laravel/socialite` and you're 80% done
- Use `updateOrCreate` on email to handle account merging gracefully
- Always validate the `{provider}` parameter to prevent abuse
- Handle the "user denied" error case or prepare for angry support emails
- Store provider tokens if you need to make API calls later
- Use stateless mode for API-based auth flows

OAuth is a solved problem. Laravel Socialite is the solution. Stop solving it again.

---

**Hit a snag with Socialite?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've debugged more OAuth redirect_uri mismatches than I care to admit. 😅

**Want more Laravel content?** Star the blog repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io). New post every day (yes, really).

*Go add Google login to that project that's been sitting at "just needs social auth" for three months. You've got no more excuses.* 🚀
