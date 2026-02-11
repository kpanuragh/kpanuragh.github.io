---
title: "Laravel File Uploads: Stop Storing PDFs in Your Database! 📁"
date: "2026-02-11"
excerpt: "Your database isn't a file cabinet! Learn how to handle file uploads like a pro, from local storage to S3, without blowing up your server."
tags: ["laravel", "php", "file-uploads", "aws", "s3"]
---

# Laravel File Uploads: Stop Storing PDFs in Your Database! 📁

Real talk: The first time I had to handle file uploads in Laravel, I almost stored the entire file content as a BLOB in the database. Thank god for code reviews! 😅

As a Technical Lead who's built e-commerce backends handling thousands of product images and user documents, I've learned that file uploads are where theory meets painful reality. Let's talk about doing it right!

## The Database Isn't a Filing Cabinet 🗄️

**Worst thing you can do:**
```php
// PLEASE DON'T DO THIS
public function store(Request $request)
{
    $fileContent = file_get_contents($request->file('document'));

    Document::create([
        'user_id' => auth()->id(),
        'content' => $fileContent,  // 10MB PDF in your database 💀
        'filename' => $request->file('document')->getClientOriginalName()
    ]);
}
```

**What happens next:** Your database grows to 50GB, backups take hours, queries crawl to a halt, and your DBA is hunting you down with a rolled-up ERD diagram.

**Pro tip:** Store the FILE PATH in the database, not the file itself!

## The Right Way: Laravel's Storage Facade 🎯

In production systems I've built at Cubet Techno Labs, we handle product images, user documents, invoices - the works. Here's the pattern that's saved us countless headaches:

```php
use Illuminate\Support\Facades\Storage;

public function store(Request $request)
{
    $request->validate([
        'document' => 'required|file|mimes:pdf,doc,docx|max:10240' // 10MB max
    ]);

    // Store file and get path
    $path = $request->file('document')->store('documents', 'public');

    // Only save the path to database
    Document::create([
        'user_id' => auth()->id(),
        'file_path' => $path,
        'original_name' => $request->file('document')->getClientOriginalName(),
        'mime_type' => $request->file('document')->getMimeType(),
        'size' => $request->file('document')->getSize()
    ]);

    return back()->with('success', 'Document uploaded!');
}
```

**What just happened?**
- File goes to `storage/app/public/documents/randomhash.pdf`
- Database only stores the path (like 50 bytes instead of 10MB)
- You can still track who uploaded what and when
- Your database stays lean and mean 💪

## Custom Filenames (Because random hashes are ugly) 🏷️

Sometimes you want control over the filename:

```php
$filename = auth()->id() . '_' . time() . '.' . $request->file('avatar')->extension();

$path = $request->file('avatar')->storeAs('avatars', $filename, 'public');
```

**Real project example:** For an e-commerce platform, we needed SKU-based product images:
```php
$filename = $product->sku . '_main.' . $file->extension();
$path = $file->storeAs("products/{$product->id}", $filename, 'public');
// Result: storage/app/public/products/123/PROD-001_main.jpg
```

Makes debugging SO much easier when you can recognize files by name!

## S3 Integration (Scale Without Crying) ☁️

Here's where things get fun! When you're dealing with thousands of files, local storage becomes a nightmare. Enter AWS S3!

**Step 1: Install the AWS SDK**
```bash
composer require league/flysystem-aws-s3-v3 "^3.0"
```

**Step 2: Configure `config/filesystems.php`**
```php
's3' => [
    'driver' => 's3',
    'key' => env('AWS_ACCESS_KEY_ID'),
    'secret' => env('AWS_SECRET_ACCESS_KEY'),
    'region' => env('AWS_DEFAULT_REGION'),
    'bucket' => env('AWS_BUCKET'),
    'url' => env('AWS_URL'),
    'visibility' => 'public',
],
```

**Step 3: Upload to S3 (literally the same code!)**
```php
// Just change 'public' to 's3' - that's IT!
$path = $request->file('document')->store('documents', 's3');
```

**Mind = Blown 🤯**

Laravel's filesystem abstraction means you can switch from local to S3 without changing your upload logic. I've switched entire production systems from local to S3 in under an hour!

## Security Considerations (Don't Get Hacked) 🔒

A pattern that saved us in a real project - NEVER trust user filenames:

```php
$request->validate([
    'avatar' => 'required|image|mimes:jpeg,png,jpg,gif|max:2048'
]);

// Sanitize original filename
$originalName = Str::slug(pathinfo(
    $request->file('avatar')->getClientOriginalName(),
    PATHINFO_FILENAME
));

// Add unique suffix to prevent collisions
$filename = $originalName . '_' . uniqid() . '.' . $request->file('avatar')->extension();

$path = $request->file('avatar')->storeAs('avatars', $filename, 's3');
```

**Why?** Users can upload files named `../../../etc/passwd` or `<script>alert('xss')</script>.jpg`. Always sanitize!

## Image Processing (Thumbnails & Optimization) 🖼️

For product images, we needed thumbnails. Enter Intervention Image:

```bash
composer require intervention/image
```

```php
use Intervention\Image\Facades\Image;

public function uploadProductImage(Request $request, Product $product)
{
    $image = $request->file('image');

    // Generate unique filename
    $filename = 'product_' . $product->id . '_' . time() . '.jpg';

    // Create thumbnail
    $thumbnail = Image::make($image)
        ->fit(300, 300)
        ->encode('jpg', 80);

    // Store original
    $originalPath = $image->storeAs('products/originals', $filename, 's3');

    // Store thumbnail
    Storage::disk('s3')->put(
        "products/thumbnails/{$filename}",
        $thumbnail->stream()
    );

    $product->update([
        'image_path' => $originalPath,
        'thumbnail_path' => "products/thumbnails/{$filename}"
    ]);
}
```

**Result:** Fast-loading thumbnails on product listings, full-res images on detail pages. User experience goes 📈!

## Retrieving Files (Getting URLs Right) 🔗

**Local storage:**
```php
// Make sure you ran: php artisan storage:link

$url = Storage::url($document->file_path);
// Returns: /storage/documents/randomhash.pdf
```

**S3 storage:**
```php
$url = Storage::disk('s3')->url($document->file_path);
// Returns: https://bucket.s3.amazonaws.com/documents/randomhash.pdf
```

**Temporary URLs (private files):**
```php
// S3 signed URL - expires in 30 minutes
$url = Storage::disk('s3')->temporaryUrl(
    $document->file_path,
    now()->addMinutes(30)
);
```

Perfect for sensitive documents like invoices or contracts!

## Download & Delete Operations 📥

**Download:**
```php
public function download(Document $document)
{
    // Authorization check first!
    $this->authorize('view', $document);

    return Storage::disk('s3')->download(
        $document->file_path,
        $document->original_name  // Downloaded filename
    );
}
```

**Delete (clean up after yourself!):**
```php
public function destroy(Document $document)
{
    $this->authorize('delete', $document);

    // Delete from storage
    Storage::disk('s3')->delete($document->file_path);

    // Delete database record
    $document->delete();

    return back()->with('success', 'Document deleted!');
}
```

**Pro tip:** Use model events to auto-delete files:
```php
// In your Document model
protected static function booted()
{
    static::deleting(function ($document) {
        Storage::disk('s3')->delete($document->file_path);
    });
}
```

Now files get cleaned up automatically when records are deleted. No orphaned files! 🎉

## Bonus: Chunked Uploads for Large Files 🚀

For files over 100MB, chunked uploads prevent timeout issues:

```php
// In your Blade template
<input type="file" id="large-file" />

<script>
// Use libraries like resumable.js or uppy.io
// Send file in chunks to a dedicated endpoint
// Laravel handles chunk assembly
</script>
```

This is advanced territory, but essential for video uploads or large datasets!

## The Upload Checklist ✅

For every file upload feature:

- [ ] Validate file type, size, and mime type
- [ ] Sanitize filenames (never trust user input)
- [ ] Store path in database, not content
- [ ] Use S3 for production (local for development)
- [ ] Generate thumbnails for images
- [ ] Implement proper authorization
- [ ] Auto-delete files when records are deleted
- [ ] Use temporary URLs for private files
- [ ] Set up proper CORS headers for S3

## Real Talk 💬

**Q: "Should I use Spatie Media Library?"**

A: For complex scenarios (multiple image variants, media collections, conversions), YES! It's battle-tested and saves tons of time. For simple uploads, vanilla Laravel is enough.

**Q: "Local or S3 for development?"**

A: Local for development, S3 for staging/production. Use environment-based disk configuration:
```php
'default' => env('FILESYSTEM_DISK', 'local'),
```

**Q: "How do I handle CDN?"**

A: CloudFront + S3 = 🔥. Configure CloudFront distribution, point it to your S3 bucket, update your S3 disk URL config. Boom - global CDN!

## The Bottom Line

File uploads in Laravel:
1. **Never** store files in the database
2. Use Storage facade for abstraction
3. S3 for scalability (Flysystem makes it painless)
4. Always validate and sanitize
5. Generate thumbnails for images
6. Clean up orphaned files
7. Use temporary URLs for private content

Your database will thank you, your server will thank you, and your users will get fast, reliable file handling!

---

**Built something cool with Laravel Storage?** Let me know on [LinkedIn](https://www.linkedin.com/in/anuraghkp)! Always love hearing about production use cases!

**Want more Laravel deep dives?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) - I share patterns from 7+ years of building production Laravel apps!

*Now go upload files like a pro!* 📁✨
