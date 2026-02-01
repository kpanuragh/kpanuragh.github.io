---
title: "Path Traversal: The '../../../' Attack You've Never Heard Of 📁"
date: "2026-02-01"
excerpt: "Think your file uploads are safe? Let me show you how hackers use '../' to read your passwords, SSH keys, and database configs. It's scarier than it sounds!"
tags: ["cybersecurity", "web-security", "security", "file-security"]
featured: true
---

# Path Traversal: The '../../../' Attack You've Never Heard Of 📁

Ever wondered how hackers read files they shouldn't have access to? No SQL injection, no XSS, just... dots and slashes? 🤔

Welcome to **Path Traversal** (aka Directory Traversal), the attack that makes your server hand over `/etc/passwd` like it's no big deal!

## What Even Is Path Traversal? 🎯

**Simple version:** Hackers use `../` to escape out of folders and read files anywhere on your server.

Think of it like this: You're in your room, but by saying "go up, go up, go up, now go to Dad's office," you can access files you shouldn't see. That's path traversal!

**The scary part?** Most developers don't even think to protect against this.

## How It Works (The Scary Demo) 😱

You built a nice file viewer for user profiles:

```php
// This looks innocent enough, right? WRONG!
$file = $_GET['file'];
$content = file_get_contents('/var/www/uploads/' . $file);
echo $content;
```

**Normal user:** `?file=profile.jpg` → Shows their cute cat picture ✅

**Hacker:** `?file=../../../etc/passwd` → Shows your entire user list 💀

**Even scarier:** `?file=../../../var/www/.env` → YOUR DATABASE PASSWORD!

### What Just Happened?

The hacker typed:
```
?file=../../../etc/passwd
```

Which became:
```php
'/var/www/uploads/' . '../../../etc/passwd'
// = '/var/www/uploads/../../../etc/passwd'
// = '/var/www/../../../etc/passwd'
// = '/var/../../../etc/passwd'
// = '/../../../etc/passwd'
// = '/etc/passwd'
```

Each `../` says "go up one folder." Do it enough times, and you're at the root! 🚨

## Real-World Targets (What Hackers Actually Want) 💎

When hackers find path traversal, they go hunting for:

**The Crown Jewels:**
- `/etc/passwd` - List of all users (reconnaissance gold)
- `~/.ssh/id_rsa` - SSH private keys (full server access!)
- `.env` files - Database passwords, API keys, everything
- `web.config` or `config.php` - Application secrets
- `/var/log/apache2/access.log` - See what everyone's doing
- `../../src/config/database.yml` - Database credentials

**Pro Tip:** If your `.env` file is readable via path traversal, game over. The hacker owns your database, your AWS account, your email service... everything.

## The Laravel "But I'm Safe!" Trap 🪤

**You might think:** "I use Laravel, it handles file paths!"

**Plot twist:** Only if you use it correctly!

**Vulnerable Code (Yes, even in Laravel):**

```php
// Route: /download?file=invoice.pdf
public function download(Request $request)
{
    $filename = $request->input('file');

    // Looks safe, right? NOPE!
    return response()->download(storage_path('invoices/' . $filename));
}
```

**Hacker payload:** `?file=../../../.env`

**Result:** They download your `.env` file. Oops! 😬

## How to Actually Fix This 🛡️

### Fix #1: Whitelist, Don't Build Paths

```php
// DON'T: Let users control paths
$file = $request->input('file');
$path = storage_path('uploads/' . $file);

// DO: Use IDs and look up the real path
$fileId = $request->input('id');
$file = UserFile::findOrFail($fileId);
$path = $file->path;  // You control this!
```

**Why it works:** Users never touch the actual file path. They can't inject `../` if they only control the ID!

### Fix #2: Validate and Sanitize

```php
// Validate: only allow safe characters
$request->validate([
    'file' => 'required|alpha_dash|max:255',  // No slashes, no dots!
]);

// Sanitize: remove dangerous characters
$filename = basename($request->input('file'));  // Removes path info
$filename = str_replace(['..', '/', '\\'], '', $filename);

$path = storage_path('uploads/' . $filename);
```

**Translation:** `basename()` strips all path separators. `../../../etc/passwd` becomes just `passwd`.

### Fix #3: Use Real Paths (My Favorite)

```php
// The bulletproof way
$filename = $request->input('file');
$basePath = storage_path('uploads');
$fullPath = realpath($basePath . '/' . $filename);

// Check if the real path is still inside our uploads folder
if (!$fullPath || !str_starts_with($fullPath, $basePath)) {
    abort(403, 'Nice try, hacker!');
}

return response()->download($fullPath);
```

**The magic:** `realpath()` resolves `../` and gives you the ACTUAL path. Then you verify it's still in your uploads folder. If someone tries `../../../etc/passwd`, the check fails! 🎉

### Fix #4: Framework Helpers (Laravel Magic)

```php
// Store files the Laravel way
$path = $request->file('upload')->store('uploads');

// Retrieve files the Laravel way
return Storage::download($path);
```

**Why it's safe:** Laravel's Storage facade doesn't let you escape the storage root. It's built-in protection!

## Real Talk: Common Mistakes 💬

**Mistake #1: "I'll just block `../`"**

```php
// Hacker: "Hold my beer..."
if (str_contains($filename, '../')) {
    abort(403);
}
```

**Bypasses:**
- `..%2F` (URL encoded)
- `....//` (double slashes)
- `..%5C` (Windows backslash)
- `%2e%2e%2f` (fully encoded)

**Lesson:** Blacklists suck. Use whitelists!

**Mistake #2: "Only checking the file extension"**

```php
if (!str_ends_with($filename, '.pdf')) {
    abort(403);
}
```

**Hacker:** `../../../.env.pdf` (they just added .pdf at the end!)

**Lesson:** Validate the ENTIRE path, not just the end.

**Mistake #3: "Trusting `is_file()` alone"**

```php
if (is_file($path)) {
    return file_get_contents($path);
}
```

**Problem:** `is_file()` checks if a file exists, not if you SHOULD access it!

`/etc/passwd` is a file. It passes the check! 😅

## The Security Checklist 📋

Before you push that file handling code:

- [ ] Never concatenate user input directly into file paths
- [ ] Use database IDs instead of filenames when possible
- [ ] Always validate with `realpath()` and check the base path
- [ ] Use Laravel's Storage facade for file operations
- [ ] Whitelist allowed characters (no slashes, no dots in most cases)
- [ ] Store uploads outside the web root if possible
- [ ] Log suspicious access attempts (multiple `../` is a red flag)
- [ ] Set proper file permissions (750 for directories, 640 for files)

## Quick Wins (5-Minute Fixes) 🏃‍♂️

**Win #1: Add path verification**
```php
// Add this helper to your app
function safeFilePath($basePath, $userInput)
{
    $path = realpath($basePath . '/' . basename($userInput));

    if (!$path || !str_starts_with($path, realpath($basePath))) {
        throw new \Exception('Invalid file path');
    }

    return $path;
}
```

**Win #2: Use Storage facade everywhere**
```php
// Replace this pattern
file_get_contents(storage_path('files/' . $name))

// With this
Storage::get('files/' . $name)
```

**Win #3: Move .env outside web root**

Your web root: `/var/www/html/public`

Your .env: `/var/www/html/.env` ✅ (already one level up!)

Even if hacked, they can't reach it via web requests!

## Testing Your App (Hack Yourself First!) 🔨

Try these payloads on your own app:

```
?file=../../../etc/passwd
?file=....//....//....//etc/passwd
?file=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd
?file=..%5C..%5C..%5Cetc%5Cpasswd
?file=../../../../var/www/.env
```

**If ANY of these work:** Houston, we have a problem! 🚨

## The "But It's an Internal App" Myth 🎭

**Wrong mindset:** "Only employees use this, so it's fine."

**Reality check:**
- Disgruntled employees exist
- Phishing emails land in employee inboxes
- That "internal" app might be internet-facing
- One compromised account = full access

**Better mindset:** Code like everyone's a potential attacker. Because they might be!

## Pro Security Tips 🔐

**Tip #1: Least Privilege**

Your PHP process shouldn't run as root. Use `www-data` or similar with minimal permissions.

```bash
# Set restrictive permissions
sudo chown -R www-data:www-data /var/www/storage
sudo chmod -R 750 /var/www/storage
```

**Tip #2: Disable Directory Listing**

```apache
# In your .htaccess or Apache config
Options -Indexes
```

Even if hackers find a path, they can't "browse" your folders!

**Tip #3: Use a WAF (Web Application Firewall)**

Services like Cloudflare or ModSecurity can catch path traversal attempts automatically.

**Tip #4: Monitor Your Logs**

```bash
# Set up alerts for suspicious patterns
grep -r '\.\.' /var/log/apache2/access.log
```

If you see tons of `../` in your logs, someone's probing you!

## Resources That Don't Suck 📚

- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal) - The official guide
- [PortSwigger Web Security](https://portswigger.net/web-security/file-path-traversal) - Great examples
- [Laravel Storage Docs](https://laravel.com/docs/filesystem) - Use the framework!

## The Bottom Line

Path traversal is like leaving your filing cabinet unlocked. Sure, the files are "inside" folders, but anyone can just... open the drawers.

**The fix is simple:**
1. Never trust user input for file paths
2. Use IDs instead of filenames
3. Validate with `realpath()` and base path checks
4. Let Laravel's Storage facade do the heavy lifting

Think of it like this: Would you let a stranger tell you which drawer to open? No? Then don't let user input control your file paths! 🔒

---

**Got hacked by path traversal?** Or found a vulnerability? Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). As someone from **YAS** and **InitCrew**, I've helped patch these bugs in production systems!

**Want more security deep-dives?** Check out my other posts on [XSS](https://kpanuragh.github.io/posts/xss-the-javascript-injection-nightmare), [SQL Injection](https://kpanuragh.github.io/posts/sql-injection-hack-yourself-before-they-do), and [SSRF](https://kpanuragh.github.io/posts/ssrf-when-your-server-attacks-itself)! 🛡️

*Now go audit your file handling code. Your future self will thank you!* 🎯✨
