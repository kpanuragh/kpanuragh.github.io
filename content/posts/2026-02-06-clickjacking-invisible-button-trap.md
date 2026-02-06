---
title: "Clickjacking: When That 'Free iPad' Button Deletes Your Account 🎯🪤"
date: "2026-02-06"
excerpt: "You think you're clicking a harmless button. Plot twist: you just deleted your account, transferred money, or enabled your webcam. Welcome to clickjacking - the magic trick of web attacks!"
tags: ["cybersecurity", "web-security", "owasp", "clickjacking"]
featured: true
---

# Clickjacking: When That 'Free iPad' Button Deletes Your Account 🎯🪤

So there I was, reviewing a client's web app in my early security research days, when I found something wild: their entire admin panel could be overlaid on a fake "Win a Free iPhone!" page. One click from an admin = instant account takeover. And they had NO idea it was even possible.

Let me blow your mind with one of the sneakiest attacks in web security! 🎭

## What Even IS Clickjacking? 🤔

Imagine this: You see a button that says "Click for Free Stuff!" You click it. But underneath that button, **invisible to you**, is your bank's "Transfer All Money" button.

Congratulations - you just got clickjacked! 💸

**The technical name:** UI Redress Attack (because "clickjacking" sounded too cool for academics)

**The street name:** The invisible button trap

**What actually happens:**
1. Attacker puts YOUR website in an invisible iframe
2. Overlays it with something enticing on THEIR website
3. You click the fake button
4. You actually clicked YOUR site's real button underneath
5. Chaos ensues 🔥

## The Attack in Action 🎬

Here's how easy it is (this is the **BAD** way - for educational purposes only!):

```html
<!-- Evil attacker's website -->
<style>
  iframe {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0.0001;  /* Nearly invisible! */
    width: 100%;
    height: 100%;
    z-index: 2;  /* Sits on top */
  }

  .fake-button {
    position: absolute;
    top: 200px;
    left: 300px;
    z-index: 1;  /* Sits below the iframe */
  }
</style>

<!-- Your actual website, loaded invisibly -->
<iframe src="https://yourbank.com/transfer-money"></iframe>

<!-- Fake button they see -->
<button class="fake-button">
  🎁 CLAIM YOUR FREE iPAD! 🎁
</button>
```

**What the user sees:** A shiny button promising free stuff

**What the user clicks:** Your actual "Transfer $1000" button hidden in the iframe

**Result:** Money goes bye-bye 👋💰

## Real-World Disasters I've Seen 😱

### Story #1: The Social Media Disaster

In security communities, we often discuss how one client had their entire "Delete Account" flow clickjackable. Someone made a prank page: "Click to see cute puppies!"

Hundreds of users accidentally deleted their accounts. They thought they were clicking puppy pictures. 🐕💀

### Story #2: The OAuth Nightmare

Another classic: Attackers overlaid a site's OAuth approval page. Users thought they were playing a game. They actually authorized a malicious app to access their data.

**The attacker's button said:** "Press SPACE to jump!"

**What they actually pressed:** "Grant All Permissions" on an invisible OAuth dialog

Big yikes. 😬

### Story #3: The Webcam Permission Trick

This one still haunts me. Attacker overlaid browser's "Allow Webcam Access" permission. Made a fake "you're the 1,000,000th visitor!" page.

People clicking the celebration confetti button were **actually enabling webcam access** for the attacker's site.

In my experience building production systems, this is why we take UI security seriously!

## How to STOP Clickjacking 🛡️

The fix is actually super simple. Like, embarrassingly simple.

### Fix #1: X-Frame-Options Header (The Old Reliable)

```php
// In your Laravel middleware or headers
header('X-Frame-Options: DENY');
```

**What it does:** Tells browsers "DO NOT put my site in an iframe. EVER."

**Options:**
- `DENY` - No iframes, period
- `SAMEORIGIN` - Only allow iframes from your own domain
- `ALLOW-FROM https://trusted-site.com` - Allow specific domains (deprecated, don't use)

### Fix #2: Content-Security-Policy (The Modern Way)

```php
// The fancy new approach
header("Content-Security-Policy: frame-ancestors 'none'");
```

**CSP frame-ancestors options:**
- `'none'` - No iframes allowed (like X-Frame-Options: DENY)
- `'self'` - Only your own site (like SAMEORIGIN)
- `https://trusted.com` - Whitelist specific domains

**Pro tip:** Use BOTH headers for maximum compatibility!

```php
// Belt AND suspenders approach
header('X-Frame-Options: DENY');
header("Content-Security-Policy: frame-ancestors 'none'");
```

### Fix #3: Laravel Middleware (The Easy Way)

As someone passionate about security, I love that Laravel makes this dead simple:

```php
// In your middleware
public function handle($request, Closure $next)
{
    $response = $next($request);

    $response->headers->set('X-Frame-Options', 'DENY');
    $response->headers->set(
        'Content-Security-Policy',
        "frame-ancestors 'none'"
    );

    return $response;
}
```

**Or even simpler** - add to your global middleware:

```php
// In App\Http\Kernel.php
protected $middleware = [
    \Illuminate\Http\Middleware\FrameGuard::class,  // Built-in!
];
```

Laravel's `FrameGuard` middleware sets `X-Frame-Options: SAMEORIGIN` by default. Nice! 👍

### Fix #4: When You NEED Iframes (The Careful Way)

Sometimes you actually want your site embedded (embeddable widgets, etc.). Then do this:

```php
// Only allow specific trusted domains
header("Content-Security-Policy: frame-ancestors 'self' https://trusted-partner.com");
```

**But add this too:**

```javascript
// Frame-busting JavaScript (backup defense)
if (top !== self) {
    top.location = self.location;
}
```

**What this does:** If your site detects it's in an iframe, it breaks out and loads in the top window. Ninja move! 🥷

## Advanced Defenses 🥋

### Defense #1: SameSite Cookies

```php
// Make cookies resistant to clickjacking
setcookie('session', $value, [
    'samesite' => 'Strict',  // Only send on same-site requests
    'secure' => true,        // HTTPS only
    'httponly' => true,      // No JavaScript access
]);
```

**Why this helps:** Even if clickjacked, the malicious site can't ride your cookies!

### Defense #2: User Interaction Verification

```php
// For sensitive actions, require additional confirmation
public function deleteAccount(Request $request)
{
    if (!$request->session()->get('confirmed_deletion')) {
        return redirect()->route('confirm.delete');
    }

    // Multi-step process makes clickjacking harder
    User::find($request->user()->id)->delete();
}
```

**The idea:** Make sensitive actions require multiple clicks/pages. Harder to clickjack!

### Defense #3: CAPTCHA for Sensitive Actions

```html
<!-- Before account deletion, money transfer, etc. -->
<form method="POST">
    @csrf
    {!! NoCaptcha::display() !!}
    <button type="submit">Confirm Deletion</button>
</form>
```

**Why:** CAPTCHA can't be clickjacked because it requires user interaction with the visible page!

## Testing Your Defense 🧪

**Quick test:** Try embedding your site in an iframe:

```html
<!-- test.html -->
<!DOCTYPE html>
<html>
<body>
    <h1>Can this be embedded?</h1>
    <iframe src="https://your-site.com" width="800" height="600"></iframe>
</body>
</html>
```

**Expected result:** Your site should NOT load in the iframe. You'll see a blank frame or error.

**If your site DOES load:** You're vulnerable! Go add those headers NOW! 🚨

## The Checklist ✅

Protect your site from clickjacking:

- [ ] Set `X-Frame-Options: DENY` header (or `SAMEORIGIN` if you need same-domain iframes)
- [ ] Set `Content-Security-Policy: frame-ancestors 'none'` header
- [ ] Enable Laravel's FrameGuard middleware
- [ ] Use SameSite cookies
- [ ] Add multi-step confirmation for sensitive actions
- [ ] Test with the iframe test above
- [ ] Consider frame-busting JavaScript as backup

## Common Mistakes I See 🤦‍♂️

**Mistake #1:** "I'll just check the Referer header!"

**Why it fails:** Referer can be spoofed or missing. Not reliable!

**Mistake #2:** "I'll use JavaScript frame-busting only!"

**Why it fails:** JavaScript can be disabled. Always use HTTP headers as primary defense!

**Mistake #3:** "My site isn't important enough to attack!"

**Why it fails:** Attackers use BOTS. They scan EVERYTHING. Size doesn't matter!

**Mistake #4:** Setting headers on SOME pages but not all

**Why it fails:** Attackers will find the unprotected page. Be consistent!

## Real Talk: When Iframes Are OK 💬

**Q: "I need to embed YouTube videos. Is that clickjacking?"**

A: No! That's YOU embedding THEIR site. Clickjacking is when someone embeds YOUR site on their page.

**Q: "What if I WANT my content embeddable (like widgets)?"**

A: Use `frame-ancestors 'self' https://trusted-domain.com'` to whitelist specific partners. Don't use `DENY`.

**Q: "Can clickjacking steal passwords?"**

A: Not directly - but it can trick users into clicking "Change Password" buttons, OAuth approvals, payment confirmations, etc.

**Q: "Is this still relevant in 2026?"**

A: YES! In security communities, we still see clickjacking vulnerabilities in bug bounty programs regularly. It's an easy-to-miss vulnerability.

## The Bottom Line 🎯

Clickjacking is like a magic trick - it uses misdirection to make you do something you didn't intend.

**The good news:** It's one of the EASIEST vulnerabilities to fix. Two HTTP headers and you're protected!

**The bad news:** SO many sites still don't implement it.

**Your action items:**
1. Add those headers (5 minutes of work)
2. Test with an iframe (2 minutes)
3. Sleep better knowing you're protected (priceless)

Think of it like locking your car. Takes 2 seconds. Prevents theft. No-brainer! 🔐

## Resources That Don't Suck 📚

- [OWASP Clickjacking Defense](https://owasp.org/www-community/attacks/Clickjacking) - The definitive guide
- [MDN: X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) - Technical docs
- [CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors) - Modern approach
- [Laravel FrameGuard](https://laravel.com/docs/10.x/responses#security-headers) - Built-in protection

---

**Got clickjacking stories? Security questions?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). As someone active in security communities, I love hearing about novel attack vectors!

**Building something secure?** Check out my [GitHub](https://github.com/kpanuragh) for more security-focused projects and contributions! 🛡️

*Now go forth and stop those invisible buttons!* 🎯✨

P.S. - After you add those headers, try the iframe test. There's something satisfying about seeing your site refuse to be embedded! 😌
