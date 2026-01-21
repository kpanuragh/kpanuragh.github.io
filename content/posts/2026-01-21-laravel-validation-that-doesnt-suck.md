---
title: "Laravel Validation That Doesn't Suck 🎯"
date: "2026-01-21"
excerpt: "Stop terrorizing your users with cryptic error messages! Here's how to write Laravel validation that's actually... helpful."
tags: ["laravel", "php", "validation", "web-dev"]
---

# Laravel Validation That Doesn't Suck 🎯

Ever filled out a form, hit submit, and got slapped with "The field is required" for a field you DEFINITELY filled out? Yeah, me too. Let's not be those developers!

Laravel's validation is powerful, but most of us use about 10% of it. Here's the good stuff that'll make your forms actually pleasant to use.

## 1. Custom Error Messages (Because "The field is required" is useless) 💬

**The Problem:** Generic error messages that tell users NOTHING helpful.

**Bad way:**
```php
$request->validate([
    'email' => 'required|email',
    'promo_code' => 'required|exists:promotions,code'
]);
```

When this fails, Laravel says: "The promo code field is required." Thanks, Captain Obvious!

**Good way:**
```php
$request->validate([
    'email' => 'required|email',
    'promo_code' => 'required|exists:promotions,code'
], [
    'promo_code.required' => 'Come on, where\'s that sweet promo code?',
    'promo_code.exists' => 'Hmm, this promo code doesn\'t exist. Did you copy it correctly?'
]);
```

Now users actually know what's wrong! It's like the difference between your GPS saying "error" vs "turn left in 500 feet."

## 2. Conditional Validation (Because Context Matters) 🔀

Sometimes you need a field... sometimes you don't. Like how you need coffee on Monday but maybe not on Sunday.

```php
$request->validate([
    'payment_method' => 'required|in:card,paypal,bank',
    'card_number' => 'required_if:payment_method,card|digits:16',
    'paypal_email' => 'required_if:payment_method,paypal|email',
    'bank_account' => 'required_if:payment_method,bank|numeric'
]);
```

**The magic:** `required_if` only requires the field when a condition is met. No more asking for credit cards when someone chose PayPal!

**Pro tip:** There's also `required_unless`, `required_with`, and `required_without`. Laravel's got options for days!

## 3. Form Requests (Keep Your Controllers Clean) 🧹

**The scenario:** Your controller looks like a validation explosion.

**The fix:** Form Request classes!

```bash
php artisan make:request StorePostRequest
```

Then put all your validation logic there:

```php
class StorePostRequest extends FormRequest
{
    public function rules()
    {
        return [
            'title' => 'required|max:255|unique:posts,title',
            'content' => 'required|min:100',
            'tags' => 'required|array|min:1|max:5',
            'tags.*' => 'exists:tags,id'
        ];
    }

    public function messages()
    {
        return [
            'content.min' => 'Your post needs at least 100 characters. Currently: ' . strlen($this->content),
            'tags.max' => 'Whoa there! Maximum 5 tags. Less is more! 🏷️'
        ];
    }
}
```

Your controller becomes beautiful:

```php
public function store(StorePostRequest $request)
{
    // All validation already passed!
    Post::create($request->validated());
}
```

**Real Talk:** This is how pros do it. Controller stays skinny, validation logic is reusable, and your future self will thank you!

## 4. Custom Validation Rules (When Built-in Isn't Enough) ⚙️

Need to check if a username contains profanity? Or validate against an external API? Make your own rule!

```bash
php artisan make:rule ValidUsername
```

```php
class ValidUsername implements Rule
{
    public function passes($attribute, $value)
    {
        // Check if username is appropriate
        $profanity = ['badword1', 'badword2']; // Keep your list somewhere else!

        foreach ($profanity as $word) {
            if (stripos($value, $word) !== false) {
                return false;
            }
        }

        return true;
    }

    public function message()
    {
        return 'Please choose a more appropriate username! 😊';
    }
}
```

Use it like any other rule:

```php
$request->validate([
    'username' => ['required', 'unique:users', new ValidUsername]
]);
```

**Translation:** You're no longer limited to Laravel's built-in rules. The world is your oyster! 🦪

## 5. Bail Out Early (Save Time, Save Sanity) 🚨

**The Problem:** Running expensive validation checks when basic stuff already failed.

```php
// Without bail: Checks ALL rules even if 'required' fails
$request->validate([
    'email' => 'required|email|unique:users,email'
]);
```

This hits the database to check `unique` even if the email field is empty! Wasteful!

**The fix:**

```php
// With bail: Stops at first failure
$request->validate([
    'email' => 'bail|required|email|unique:users,email'
]);
```

Now if `required` fails, it won't bother checking `email` or `unique`. Like not checking if someone's qualified for a job when they didn't even submit a resume!

## 6. Array Validation (Because Sometimes Life Is Complicated) 📋

**Scenario:** Users can add multiple phone numbers, addresses, or whatever.

```php
$request->validate([
    'phones' => 'required|array|min:1',
    'phones.*.number' => 'required|regex:/^[0-9]{10}$/',
    'phones.*.type' => 'required|in:mobile,home,work',

    'addresses' => 'nullable|array|max:3',
    'addresses.*.street' => 'required|string|max:255',
    'addresses.*.city' => 'required|string',
    'addresses.*.zip' => 'required|regex:/^[0-9]{5}$/'
]);
```

**The magic:** That `.*` validates EACH item in the array. Mind. Blown. 🤯

## Bonus Round: The Power Moves 💪

**Validate sometimes:**
```php
// Only validate if field is present
Validator::make($data, [
    'email' => 'sometimes|required|email'
]);
```

**Custom error bag names:**
```php
// Useful when you have multiple forms on one page
$request->validate($rules, $messages, [], 'login');
// Errors will be in 'login' bag instead of default
```

**Validate specific scenario:**
```php
public function rules()
{
    return [
        'email' => $this->isUpdating()
            ? 'required|email|unique:users,email,' . $this->user->id
            : 'required|email|unique:users,email'
    ];
}
```

## The Validation Checklist ✅

Make your forms user-friendly:

- [ ] Custom error messages (be helpful, not robotic)
- [ ] Use Form Requests (keep controllers clean)
- [ ] Conditional validation (required_if, required_unless)
- [ ] Bail on expensive checks (save that database query)
- [ ] Array validation for dynamic fields
- [ ] Custom rules for unique business logic

## Real Talk 💬

**Q: "Should I validate in JavaScript too?"**

A: YES! Client-side for user experience, server-side for security. Never trust the client!

**Q: "Where do I put validation logic - controller or model?"**

A: Form Requests! That's literally what they're for. Keep models for business logic, controllers for traffic directing.

**Q: "Can I make validation async?"**

A: Not directly, but you can use AJAX to validate fields on blur. Check out Livewire or Vue.js for reactive validation!

## The Bottom Line

Good validation is like a helpful friend who catches your mistakes:
1. Clear error messages (tell users what's actually wrong)
2. Validate at the right time (conditional rules)
3. Keep it organized (Form Requests)
4. Be efficient (bail early)
5. Handle complexity (arrays, custom rules)

Your users shouldn't need a PhD to figure out why their form isn't submitting. Be the developer who writes forms that don't make people want to throw their laptop out the window!

---

**Got validation war stories?** Share them on [LinkedIn](https://www.linkedin.com/in/anuraghkp). I bet they're hilarious! 😄

**Want more Laravel goodness?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) - I've got more tips coming!

*Now go validate like a pro!* 🎯✨
