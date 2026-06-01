---
title: "🗂️ Path Traversal in 2026: The Attack That Refuses to Die"
date: "2026-06-01"
excerpt: "You're serving files. You're sanitizing inputs. You think you're safe. Then someone types ../../../../etc/passwd and your confidence evaporates. Path traversal is ancient, boring, and still quietly wrecking modern apps."
tags: ["security", "web-security", "path-traversal", "nodejs", "appsec"]
featured: true
---

Some vulnerabilities feel like history. SQL injection, buffer overflows, the ghosts of Y2K — surely we've moved past all that. Then a penetration tester on one of our projects at Cubet walks in with a single curl command, requests `../../../../etc/shadow`, and suddenly everyone in the room is very, very quiet.

Path traversal. It's been in the OWASP Top 10 since the list existed. It's been the root cause of breaches at companies that absolutely should have known better. And in 2026, it is still showing up in code reviews like an uninvited guest who doesn't understand hints.

Let's fix that.

## What Even Is Path Traversal?

Your app has an endpoint that serves a file based on user input:

```
GET /download?file=invoice-1042.pdf
```

Internally, you're doing something like:

```javascript
const filePath = path.join('/var/app/uploads', req.query.file);
fs.readFile(filePath, (err, data) => res.send(data));
```

Seems fine. Now an attacker requests:

```
GET /download?file=../../../../etc/passwd
```

`path.join` dutifully resolves that to `/etc/passwd`. No auth check in the world helps you here — you've handed the attacker a file browser.

That `../../../../` sequence is the classic traversal payload. It walks up directory levels using `..` (dot-dot) until it exits your intended root, then descends into any path the server process has read access to.

## Why Is This Still Happening in 2026?

Fair question. We have better frameworks, better static analysis tools, and more experienced engineers than we did a decade ago. And yet.

The honest answer: **context switching kills vigilance.** A developer who would never concatenate user input into a SQL query without parameterisation will, without thinking, do the equivalent with a file path. The mental model for "dangerous user input" doesn't always extend to filenames.

There's also the rise of cloud storage proxies. Instead of serving files off the local filesystem, apps proxy requests to S3, GCS, or Azure Blob — and developers sometimes assume "it's cloud storage, the SDK handles safety." It doesn't. If you're constructing an object key from user input, you're still vulnerable. The traversal just looks different:

```
GET /files?key=reports/../../../billing/master-export.csv
```

And zip files. Oh, the zip files. ZIP Slip is a variant where a malicious archive contains entries with `../` in their names. When your app extracts the zip to a temp directory, those entries write files *outside* the temp directory. Exploiting it only requires that someone uploads a zip and your app extracts it — a workflow that exists in roughly every document-processing app ever written.

## The Fix Is Not Optional Prefix Checking

The instinctive fix is a blocklist: reject any input containing `../`. Reasonable, but insufficient. Attackers have been URL-encoding their way around naive filters since 2003:

- `%2e%2e%2f` → `../`
- `%2e%2e/` → `../`
- `..%2f` → `../`
- `%2e%2e%5c` → `..\` (Windows paths)
- Double-encoded: `%252e%252e%252f`

Some frameworks decode once, some decode twice, some decode inconsistently depending on where you read the value. Don't play that game.

The correct fix is to **resolve the path fully, then verify it's still inside your allowed root:**

```javascript
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.resolve('/var/app/uploads');

function safeReadFile(userInput, res) {
  // Resolve to an absolute path — no more ../
  const requested = path.resolve(UPLOAD_ROOT, userInput);

  // Critical: verify it's still inside the allowed root
  if (!requested.startsWith(UPLOAD_ROOT + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  fs.readFile(requested, (err, data) => {
    if (err) return res.status(404).send('Not found');
    res.send(data);
  });
}
```

`path.resolve` handles all the `..` collapsing for you. Whatever encoding tricks the attacker uses, they have to survive URL decoding before they reach your code — and `path.resolve` then canonicalises the result. The prefix check after that is the safety net.

Note the trailing `path.sep` in the `startsWith` check. Without it, a root of `/var/app/uploads` would also pass `/var/app/uploads-evil/secret.txt`. Small detail, real bypass.

## For ZIP Extraction

The ZIP Slip defence follows the same pattern — resolve each entry's destination and reject anything that escapes your target directory:

```javascript
const AdmZip = require('adm-zip');

function safeExtract(zipBuffer, targetDir) {
  const zip = new AdmZip(zipBuffer);
  const resolved = path.resolve(targetDir);

  zip.getEntries().forEach(entry => {
    const entryPath = path.resolve(resolved, entry.entryName);
    if (!entryPath.startsWith(resolved + path.sep)) {
      throw new Error(`Zip slip attempt: ${entry.entryName}`);
    }
  });

  zip.extractAllTo(resolved, true);
}
```

Throw *before* extracting. Don't extract and then clean up — by the time you clean up, the file is already on disk.

## One More Thing: Static File Middleware

If you're using Express's `express.static` or similar, you're generally fine — well-maintained middleware handles traversal internally. But if you've ever written a custom file-serving route, or wrapped static serving in business logic that touches the path first, double-check it. "We use express.static" is only safe if *nothing touches the path between the request and the middleware.*

We caught exactly this at Cubet last year: a feature that prepended a tenant ID to the path for multi-tenancy purposes was doing string concatenation instead of a proper `path.join`, and the traversal check in the middleware ran on the *already-modified* path. The tenant prefix looked like part of the allowed root. It wasn't.

## The Boring Summary

Path traversal doesn't require a clever zero-day. It requires a developer who didn't think "file path" when they thought "user input." Resolve fully, check the prefix strictly, and never trust that your framework is doing it for you unless you've read the code.

Ancient vulnerability. Modern consequences. Fix it once, fix it right.

---

*Found a traversal in the wild? Slide into my DMs on [Twitter/X](https://twitter.com/kpanuragh) or drop me a message on [LinkedIn](https://linkedin.com/in/kpanuragh). War stories appreciated.*
