---
title: "Laravel Precognition: See Validation Errors Before Users Even Click Submit 🔮"
date: "2026-03-15"
excerpt: "Your users are rage-quitting your forms because they only find out about errors AFTER submitting. Laravel Precognition fixes that — and it's embarrassingly easy to add."
tags: ["laravel", "php", "web-dev", "ux", "forms"]
---

# Laravel Precognition: See Validation Errors Before Users Even Click Submit 🔮

You know that experience where you fill out a long form, hit submit, and the page explodes with 12 validation errors? Congratulations, you've just convinced your user to close the tab forever.

I've been there. In production systems I've built for e-commerce clients, cart abandonment on checkout forms was brutally high. Turns out, surprise validation errors on submit are basically a "please leave" button for your users.

Enter **Laravel Precognition** — a feature introduced in Laravel 9.21 that lets you validate inputs *live*, as the user types, without writing a single extra backend endpoint. It's like giving your form psychic powers. Hence the name. 🧠

## What Actually Is Precognition? 🤔

Normally, validation only happens when the form is submitted. Precognition lets your frontend send a "sneak peek" request to the same backend endpoint, get validation results back, and show errors *in real time* — without actually processing the full request.

Your backend does zero extra work. Your controller stays exactly the same. Precognition just adds a special header (`Precognition: true`) to the request and Laravel goes "oh, I'll just run validation and stop before doing anything real."

It's validation on a test drive before the real purchase.

## The Problem in Plain English 😤

```php
// Your controller — user hits submit, sees ALL errors at once
public function store(StoreOrderRequest $request)
{
    // StoreOrderRequest has 15 validation rules
    // User filled form wrong in 8 places
    // User sees 8 errors simultaneously
    // User cries, closes tab, orders from competitor
    Order::create($request->validated());
}
```

The fix isn't rewriting your backend. The fix is Precognition.

## Setting It Up (No, Really, It's This Simple) ⚡

**Step 1: Install the frontend package**

```bash
npm install laravel-precognition-vue
# or for React
npm install laravel-precognition-react
# or vanilla JS
npm install laravel-precognition-axios
```

**Step 2: Your backend controller stays EXACTLY the same.** Seriously. Don't change it.

**Step 3: Update your frontend form** (Vue example):

```javascript
import { useForm } from 'laravel-precognition-vue';

const form = useForm('post', '/orders', {
    name: '',
    email: '',
    card_number: '',
});
```

```html
<input
    v-model="form.email"
    @change="form.validate('email')"
/>
<span v-if="form.invalid('email')">
    {{ form.errors.email }}
</span>
```

That's it. When the user types in the email field and tabs out, Precognition fires a request, your `StoreOrderRequest` runs validation *only for that field*, and errors appear inline. No submit. No page reload. No rage quit.

## Real Talk: Where This Saved Us 🛠️

As a Technical Lead, I've learned that checkout UX is where money lives or dies. We had a client with a custom billing form — address, card details, tax ID for B2B customers — the works. Before Precognition, users would submit, hit 3-4 errors at once, and bail.

After adding Precognition (two hours of work, I kid you not), abandonment on that step dropped noticeably. Users fixed errors as they went. The form *felt* like a conversation instead of a quiz you could only grade at the end.

A pattern that saved us in a real project: we had complex conditional validation — tax ID only required for B2B accounts. With Precognition, the conditional rules worked automatically because we were calling the same `FormRequest` class. No duplication, no drift between frontend and backend rules.

## Pro Tip: Validate Only What's Changed 🎯

Don't fire validation on every keystroke (your server will hate you). Use `@change` or `@blur` instead of `@input`:

```html
<!-- Good: validates when user leaves the field -->
<input @change="form.validate('email')" />

<!-- Bad: validates on every single keystroke -->
<input @input="form.validate('email')" />
```

You can also debounce it for fields where you want "as you type" feedback without hammering the server:

```javascript
// Built into the package — just set a timeout
form.setValidationTimeout(500); // 500ms debounce
```

## The Bonus: Password Confirmation Just Works ✅

One thing that always annoyed me — password confirmation validation. Normally you can't validate `password_confirmation` until submit because the rule depends on another field value.

With Precognition, you just include both fields in the touch set:

```javascript
form.validate(['password', 'password_confirmation']);
```

It sends both values together for validation. Your `confirmed` rule works perfectly. Users know immediately if passwords match. No submit required.

## What Precognition Is NOT 🚫

**It's not a replacement for server-side validation.** Your `FormRequest` still runs fully on actual submit. Precognition is UX sugar on top of security, not instead of it. Never drop your backend validation because "the frontend already checked it" — that's how you get exploited.

**It's not real-time collaboration.** It's not broadcasting or sockets. It's just a smarter way to run your existing validation rules earlier.

## Bonus Tips 🎁

**Check if a field is validating** (show a spinner!):
```javascript
form.validating // boolean — true while request is in-flight
```

**Reset errors when user starts editing again:**
```javascript
// Automatically handled by the package, but you can force it:
form.forgetError('email');
```

**Works with Inertia.js too** — there's `laravel-precognition-vue-inertia` and `laravel-precognition-react-inertia` packages specifically for Inertia apps.

## TL;DR 💡

- Users hate surprise validation errors on submit
- Laravel Precognition lets you validate fields *live* using your existing `FormRequest` classes
- Zero changes to your backend controller
- Install a JS package, add `@change="form.validate('field')"`, done
- Validate on `@change` or `@blur`, not `@input` — respect your server
- Still keep your server-side validation. Always.

Your users will think you're a UX genius. You'll know you just added one package and two attributes. This is the Laravel way. 😎

---

**Tried Precognition in production?** I'd love to hear how it affected your form completion rates. Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**More Laravel deep dives?** Check out the blog and star it on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) if it's been useful!

*Now go make your forms psychic.* 🔮
