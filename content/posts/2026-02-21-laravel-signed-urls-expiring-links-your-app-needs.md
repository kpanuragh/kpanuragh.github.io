---
title: "Laravel Signed URLs: Stop Sending Naked Links 🔐"
date: "2026-02-21"
excerpt: "You're generating download links anyone can share, bookmark, and abuse forever. Signed URLs fix that — and they're embarrassingly easy to implement."
tags: ["laravel", "php", "web-dev", "security", "api"]
---

# Laravel Signed URLs: Stop Sending Naked Links 🔐

You spent three days building a "secure" file download feature. You slapped an auth middleware on the route, felt proud of yourself, and shipped it.

Then a user copies the download link, pastes it in Slack, and suddenly the whole company can download private invoices — logged out, no account needed, forever.

Welcome to the world of "naked links." They're exposed, they don't expire, and they're silently leaking your data right now.

## What Even Is a Signed URL? 🤔

A signed URL is a regular URL with a cryptographic signature appended to it. Laravel generates the signature using your `APP_KEY`, so nobody can tamper with it without you knowing.

It can also have an expiry time baked in. After that, it's dead. Gone. Useless. Like my motivation after a 3-hour meeting.

**Without signed URLs:**
```
https://app.com/invoices/download/42
```
Anyone who gets this link can download invoice #42. Forever. No questions asked.

**With a signed URL:**
```
https://app.com/invoices/download/42?expires=1708531200&signature=abc123...
```
This link expires in 24 hours. Tamper with it? Laravel rejects it. Share it? It dies on schedule.

## The Basics: Two Lines of Code 🎯

```php
// Permanent signed URL (tamper-proof, never expires)
$url = URL::signedRoute('invoice.download', ['invoice' => 42]);

// Temporary signed URL (tamper-proof AND expires)
$url = URL::temporarySignedRoute(
    'invoice.download',
    now()->addHours(24),
    ['invoice' => 42]
);
```

And on the route side, protecting it is just as simple:

```php
Route::get('/invoices/download/{invoice}', [InvoiceController::class, 'download'])
    ->name('invoice.download')
    ->middleware('signed');
```

That `signed` middleware does all the validation. Invalid signature? 403. Expired? 403. Tampered URL? 403. It's beautiful.

## Real Talk: Where I Actually Use This 💼

In production systems I've built at Cubet, signed URLs show up in three places constantly.

**1. File downloads that shouldn't live forever**

When a customer purchases something and needs a one-time download link:

```php
public function sendDownloadLink(Order $order): void
{
    $url = URL::temporarySignedRoute(
        'order.download',
        now()->addHours(48),
        ['order' => $order->id]
    );

    $order->user->notify(new OrderReadyNotification($url));
}
```

The customer gets 48 hours. After that, they come back to their dashboard to generate a fresh link. Clean. Auditable. No "forever links" floating around.

**2. Email verification and one-time actions**

Laravel already uses this under the hood for email verification — but you can hook into the same pattern for any "click once, do the thing" flow:

```php
// In a controller or service
$url = URL::temporarySignedRoute(
    'subscription.cancel',
    now()->addHours(2),
    ['user' => $user->id]
);

Mail::to($user)->send(new CancellationConfirmationMail($url));
```

Now even if someone intercepts the email, the window is 2 hours. Beats a plain `/cancel?user=42` link that works forever.

**3. Sharing resources with external parties**

Contractors, auditors, third-party integrations — sometimes you need to give someone temporary access without creating them an account. Signed URLs are perfect here.

```php
$reportUrl = URL::temporarySignedRoute(
    'report.view',
    now()->addDays(7),
    ['report' => $report->id, 'client' => $client->id]
);
```

Seven days, then it expires automatically. No cleanup job needed, no "oops I forgot to revoke access."

## Pro Tip: Validate in the Controller Too 🛡️

The `signed` middleware handles the heavy lifting, but sometimes you want extra context — like logging who accessed what:

```php
public function download(Request $request, Invoice $invoice): Response
{
    if (! $request->hasValidSignature()) {
        abort(403, 'This link has expired or is invalid.');
    }

    // Log the access for auditing
    activity()
        ->performedOn($invoice)
        ->log('downloaded via signed URL');

    return Storage::download($invoice->file_path);
}
```

As a Technical Lead, I've learned that audit trails for sensitive downloads aren't optional — they're "why didn't we have this when the lawyer called" territory.

## The Expiry Gotcha Nobody Tells You About ⚠️

Here's something that burned us early on: signed URL expiry is checked against **server time**, not client time. If your servers have clock drift (even a few seconds), valid URLs can appear expired.

Fix: make sure your servers are syncing with NTP. In AWS, this is automatic on EC2. On other setups, double-check:

```bash
timedatectl status
# Should show NTP synchronized: yes
```

Also, give your expiry times a little breathing room. A "1-hour" link that actually needs to survive email delivery and user response time should probably be 2-4 hours in practice.

## Revocation: The One Thing Signed URLs Can't Do 🚫

Here's the honest limitation nobody likes to admit: **you can't revoke a signed URL before it expires**.

The signature is cryptographically valid until the expiry time. If a URL leaks with a 7-day window, those 7 days are happening.

**The pattern I use in production:**

```php
// Add a "generation ID" to the signed URL
$url = URL::temporarySignedRoute(
    'document.download',
    now()->addDays(7),
    ['document' => $doc->id, 'gen' => $doc->link_generation]
);

// In the controller, validate the generation ID
public function download(Document $document, int $gen): Response
{
    if ($document->link_generation !== $gen) {
        abort(403, 'This link has been revoked.');
    }
    // ...
}
```

To "revoke" all existing links, just increment `link_generation` on the document. All old URLs now fail the generation check. Problem solved.

A pattern that saved us in a real project: a customer accidentally sent a signed document link to the wrong email thread. We incremented the generation ID, sent a fresh link to the right recipient, and the leaked link died immediately — without waiting for expiry.

## Bonus Tips 🎁

**Test that your URLs actually expire:**
```php
// In your feature tests
$url = URL::temporarySignedRoute('route', now()->subHour(), ['id' => 1]);

$this->get($url)->assertStatus(403); // Should be dead
```

**Use `hasValidSignatureWhileIgnoring()` for extra query params:**

Sometimes you add UTM parameters or tracking data to URLs. Don't let that break your signature validation:

```php
if ($request->hasValidSignatureWhileIgnoring(['utm_source', 'utm_campaign'])) {
    // UTM params are ignored during signature check
}
```

**Custom error pages:** The default 403 from the signed middleware is a bit cold. Customize it in your exception handler to give users a "this link has expired, here's how to get a new one" message. Users appreciate not being abandoned at a dead link.

## TL;DR — The 30-Second Version ⚡

- `URL::signedRoute()` — tamper-proof, permanent link
- `URL::temporarySignedRoute()` — tamper-proof + expires
- Add `->middleware('signed')` to protect the route
- For revocation, use a generation ID column
- Give expiry times breathing room for real-world usage

Stop sending links that live forever. Your users' data deserves better than a plain URL with no expiry. Signed URLs take 10 minutes to implement and they prevent the kind of "oops, that link was in a forwarded email" conversation you really don't want to have.

---

**Learned something?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I occasionally post about Laravel patterns that have saved (or nearly destroyed) real production systems. 😄

**More Laravel deep dives** on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) — the whole blog is open source, feel free to steal ideas!

*Now go audit every download route in your app. I'll wait.* 🔍
