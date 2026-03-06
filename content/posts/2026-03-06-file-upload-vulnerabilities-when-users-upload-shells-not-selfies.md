---
title: "File Upload Vulnerabilities: When Users Upload Shells, Not Selfies 📁💀"
date: "2026-03-06"
excerpt: "You built a cute profile picture uploader. A hacker uploaded a PHP shell and now owns your server. Let's make sure that never happens to you."
tags: ["cybersecurity", "web-security", "security", "file-upload", "owasp"]
featured: false
---

# File Upload Vulnerabilities: When Users Upload Shells, Not Selfies 📁💀

Every web app has a file upload feature. Profile pictures, resumes, invoices, cat memes — users upload stuff all the time. And every single one of those upload endpoints is a potential door into your server.

I learned this the hard way. Early in my career, I did a quick security audit on a client's Laravel app and found their profile picture upload accepting... literally anything. `.php`, `.exe`, `.sh` — no validation whatsoever. The files landed directly in the public folder, accessible via URL. That's not a vulnerability, that's an open invitation.

In security communities, we often discuss how file upload flaws consistently appear in bug bounty reports. They're everywhere because devs think "I'll just check the extension" and call it a day. Spoiler: that's not enough.

## What's Actually at Stake? 🎯

The worst case isn't a user uploading a rude image. The worst case is:

1. Attacker uploads `shell.php` disguised as `profile.jpg`
2. File lands in your `/public/uploads/` directory
3. Attacker visits `https://yoursite.com/uploads/shell.php`
4. Your server executes their code
5. They have full Remote Code Execution (RCE) — game over

We're talking full server takeover. Database dumps. Lateral movement to other services. AWS credentials from your environment variables. Everything.

## The "Extension Check" Trap 🪤

This is the mistake I see most often:

```php
// ❌ The false sense of security
$extension = $request->file('avatar')->getClientOriginalExtension();

if (!in_array($extension, ['jpg', 'png', 'gif'])) {
    return response()->json(['error' => 'Invalid file type'], 422);
}
```

Looks reasonable, right? Here's why it fails:

- The extension comes from the **filename the user provides** — completely attacker-controlled
- `shell.php` renamed to `shell.php.jpg` bypasses naive checks
- `shell.pHp` bypasses case-sensitive checks
- Double extensions like `evil.jpg.php` fool many systems
- Some servers treat `.phtml`, `.php5`, `.phar` as executable PHP

In my experience building production systems, I've seen all of these in the wild. Attackers are creative with filenames.

## The MIME Type Trap 🎭

"I'll check the MIME type!" — also not enough on its own.

```php
// ❌ Still not safe — MIME type comes from the request header
$mimeType = $request->file('avatar')->getMimeType();
// Attacker can spoof this with Burp Suite in 10 seconds
```

The MIME type in the HTTP request is sent by the client. The client is the attacker. They'll set it to `image/jpeg` while uploading a PHP file. Every time.

## The Real Fix: Validate the File Content 🔬

Read the actual bytes of the file. Images have magic bytes — specific byte sequences at the start that identify the format. A PHP file pretending to be a JPEG won't have them.

```php
// ✅ Check magic bytes for real file type detection
$file = $request->file('avatar');
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$realMimeType = finfo_file($finfo, $file->getRealPath());
finfo_close($finfo);

$allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

if (!in_array($realMimeType, $allowedMimes)) {
    return response()->json(['error' => 'Invalid file type'], 422);
}
```

This reads the actual file content, not what the client claims. Much harder to fake.

**Pro Tip:** For even stronger validation on images specifically, try to process the file. If it's not a real image, `getimagesize()` or an image library will fail:

```php
// ✅ Try to load as image — fakes will throw exceptions
try {
    $image = imagecreatefromstring(file_get_contents($file->getRealPath()));
    if ($image === false) {
        throw new \Exception('Not a valid image');
    }
    imagedestroy($image);
} catch (\Exception $e) {
    return response()->json(['error' => 'Invalid image file'], 422);
}
```

## The Polyglot File Problem 🔄

Here's a nasty trick I came across while exploring security research: **polyglot files**. These are files that are simultaneously valid in two formats.

A file can be a valid JPEG *and* a valid PHP file at the same time. The JPEG magic bytes are at the start, so image validators pass. But the PHP code is embedded in the EXIF metadata or image data. If it gets executed, your server runs the embedded code.

This is why the next defense layer is critical.

## Never Serve Uploaded Files as Executable 🚫

Even if a PHP file sneaks through your validation, it can only cause damage if your server *executes* it. Keep uploads outside the web root:

```php
// ✅ Store uploads outside public directory
$path = $request->file('avatar')->store('avatars', 'private');
// Files go to storage/app/private/avatars/ — not web-accessible
```

Then serve them through a controller:

```php
// ✅ Stream files through your app, not directly from disk
Route::get('/avatars/{filename}', function ($filename) {
    $path = storage_path('app/private/avatars/' . $filename);

    if (!Storage::disk('private')->exists('avatars/' . $filename)) {
        abort(404);
    }

    return response()->file($path);
})->middleware('auth');
```

The web server never executes these files — it just reads and streams them. A PHP shell uploaded here does nothing.

## Rename the File 🎲

Don't trust the original filename. At all. Ever.

```php
// ❌ Using original filename — asks for trouble
$filename = $request->file('avatar')->getClientOriginalName();
$file->move(public_path('uploads'), $filename);

// ✅ Generate a random name, keep only the validated extension
$extension = 'jpg'; // From your MIME validation, not from user input
$filename = Str::uuid() . '.' . $extension;
$file->storeAs('avatars', $filename, 'private');
```

Now even if someone uploads `shell.php`, it gets saved as `3f2a9c1b-...uuid....jpg` in a non-executable location. No path traversal, no guessable URLs, no execution.

**Real Talk:** I've seen developers store files with user-controlled names like `../../../config/database.php`. Path traversal through filenames is real. Always strip directory separators from filenames.

## Size Limits and Resource Exhaustion 💾

Don't forget the boring-but-important stuff:

```php
// In your Laravel validation
$request->validate([
    'avatar' => [
        'required',
        'file',
        'mimes:jpg,jpeg,png,webp',  // Extension allowlist
        'max:2048',                   // Max 2MB
        'dimensions:min_width=50,min_height=50,max_width=4000,max_height=4000',
    ],
]);
```

Without size limits, an attacker uploads 10GB files until your disk is full. That's a denial-of-service that costs you money, especially on cloud storage.

## The S3 Upload Pitfall ☁️

As someone who has architected serverless backends on AWS, this one hits close to home. If you're using S3 presigned URLs for direct client uploads (a common and efficient pattern), make sure you:

```javascript
// ✅ Validate AFTER upload, not just before
// Use S3 Lambda triggers to scan uploaded files
// Never trust that the client uploaded what you intended
```

Generate the presigned URL with strict content-type enforcement, then trigger a Lambda to validate the actual file after it lands in S3. Move it to the "safe" bucket only after validation passes. If it fails, delete it immediately.

## Quick Security Checklist 📋

Before your file upload goes to production:

- [ ] Validate real MIME type from file content (not HTTP header)
- [ ] Allowlist specific types — deny everything else by default
- [ ] Rename files to random UUIDs on save
- [ ] Store uploads **outside** the web root
- [ ] Serve files through your app, not directly
- [ ] Set file size limits
- [ ] Strip path separators from filenames
- [ ] For images: re-encode through an image library to strip metadata
- [ ] Add virus scanning for document uploads (ClamAV or cloud services)
- [ ] Log all upload attempts with user ID and IP

## The Nuclear Option: Re-encode Images 💣

For maximum safety with image uploads, don't just validate — **re-encode** through your image library. This strips all embedded metadata, EXIF data, and any sneaky polyglot code:

```php
// ✅ Re-encode the image — destroys any embedded payload
$image = imagecreatefromjpeg($file->getRealPath());
$outputPath = storage_path('app/private/avatars/' . Str::uuid() . '.jpg');
imagejpeg($image, $outputPath, 85); // Save as fresh JPEG, quality 85
imagedestroy($image);
```

The output is a brand-new JPEG created by your server. Whatever the attacker embedded is gone.

## TL;DR 🏁

File uploads are dangerous because developers trust user-provided metadata. Don't.

The golden rules:
1. **Validate file content**, not filename or HTTP MIME header
2. **Store outside web root** so files can't be executed
3. **Rename everything** to a random UUID
4. **Re-encode images** to strip embedded payloads
5. **Set size limits** or enjoy your $10,000 cloud storage bill

As someone passionate about security, I can't stress this enough: file upload vulnerabilities are trivially exploitable and consistently underestimated. A 30-minute investment in proper validation can be the difference between a normal day and a full incident response nightmare at 3am.

Been thinking about file upload security in your stack, or found a spicy upload bug in the wild? Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out more security deep-dives on [GitHub](https://github.com/kpanuragh).

*Now go audit your upload endpoints. I'll wait.* 🔐
