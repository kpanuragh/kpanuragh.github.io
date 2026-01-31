---
title: "SSRF: When Your Server Attacks Itself 🤦‍♂️"
date: "2026-01-31"
excerpt: "Ever accidentally turned your server into a weapon against yourself? That's SSRF! Let's talk about this sneaky vulnerability that makes your server do a hacker's dirty work."
tags: ["cybersecurity", "web-security", "owasp", "ssrf"]
featured: true
---

# SSRF: When Your Server Attacks Itself 🤦‍♂️

Picture this: You build a feature that fetches URLs. Simple, right? **WRONG.** You just gave hackers the keys to your internal network! 🔑

Welcome to Server-Side Request Forgery (SSRF) - the vulnerability where you accidentally turn your server into a hacker's personal proxy server. It's like giving a stranger your phone and letting them make international calls!

## What Even Is SSRF? 🤔

**The simple version:** Your server makes HTTP requests on behalf of users. Hackers trick it into requesting things it shouldn't.

**The scary version:** They can access your internal services, read cloud metadata, scan your network, and basically do whatever your server can do. Yikes! 😱

**Real-world example:** That time Capital One got breached because of SSRF? Yeah, **$80 million fine**. Not a typo!

## The Attack in Action 💣

Let's say you built a cool feature that generates website previews:

```php
// This code is a disaster waiting to happen!
$url = $_GET['url'];
$preview = file_get_contents($url);  // OH NO
```

**What you expected:** Users enter `https://cool-website.com`

**What hackers enter:**
- `http://localhost:6379/` (Your Redis instance!)
- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS credentials!)
- `http://internal-admin.local/delete-everything` (Your internal admin panel!)

**Result:** Your server happily makes those requests and hands back the data. Congratulations, you just exposed your entire infrastructure! 🎊

## Why This Is So Dangerous 🚨

**1. Internal Network Access**

Your server can reach things that external attackers can't:
- Database servers
- Admin panels
- Internal APIs
- Redis/Memcached instances
- Kubernetes API servers

It's like breaking into someone's house by convincing their butler to open the door from the inside!

**2. Cloud Metadata Endpoints**

Cloud providers expose metadata at special URLs:

```bash
# AWS metadata endpoint (treasure trove for hackers!)
http://169.254.169.254/latest/meta-data/

# This can give them:
# - IAM credentials
# - API keys
# - Secret environment variables
# - Network configuration
```

**3. Port Scanning**

Hackers can use your server to scan your entire network:

```php
// They can discover what services you're running
foreach ($ports as $port) {
    $url = "http://internal-server:$port";
    // Your server tells them which ports are open!
}
```

**Pro tip:** Never give attackers free recon on your infrastructure!

## The Vulnerable Code (Don't Do This!) ❌

```php
// Avatar upload from URL feature
public function uploadAvatar(Request $request)
{
    $url = $request->input('avatar_url');

    // NOPE! So many ways this can go wrong
    $avatarData = file_get_contents($url);

    Storage::put('avatars/user.jpg', $avatarData);
}
```

**What can go wrong?**
- User enters `http://localhost/admin` → Your admin panel exposed!
- User enters `file:///etc/passwd` → File system access!
- User enters AWS metadata URL → Cloud credentials leaked!

## The Safe Way (Do This Instead!) ✅

```php
public function uploadAvatar(Request $request)
{
    $url = $request->input('avatar_url');

    // Step 1: Validate the URL format
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        abort(400, 'Invalid URL');
    }

    // Step 2: Parse and check the URL
    $parsedUrl = parse_url($url);

    // Step 3: Whitelist allowed protocols
    if (!in_array($parsedUrl['scheme'], ['http', 'https'])) {
        abort(400, 'Only HTTP/HTTPS allowed');
    }

    // Step 4: Block private IP ranges and localhost
    $host = $parsedUrl['host'];

    if ($this->isPrivateIP($host) || $this->isLocalhost($host)) {
        abort(403, 'Access to internal resources forbidden');
    }

    // Step 5: Use a proper HTTP client with restrictions
    $response = Http::timeout(5)
        ->maxRedirects(3)
        ->get($url);

    // Step 6: Validate the response is actually an image
    if (!str_starts_with($response->header('Content-Type'), 'image/')) {
        abort(400, 'URL must return an image');
    }

    // Step 7: Limit file size
    if (strlen($response->body()) > 5 * 1024 * 1024) {  // 5MB max
        abort(400, 'Image too large');
    }

    Storage::put('avatars/user.jpg', $response->body());
}

private function isPrivateIP($host)
{
    // Resolve hostname to IP
    $ip = gethostbyname($host);

    // Check if it's a private IP
    return !filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
}

private function isLocalhost($host)
{
    return in_array($host, [
        'localhost',
        '127.0.0.1',
        '::1',
        '0.0.0.0',
    ]);
}
```

**What we did right:**
- Validated URL format
- Whitelisted protocols (no `file://`, `gopher://`, etc.)
- Blocked private IPs and localhost
- Limited redirects (prevent redirect chains to private IPs)
- Set timeouts (prevent slowloris attacks)
- Validated content type
- Limited file size

## The IP Address Gotchas 🕳️

Hackers are sneaky! Here are common bypass attempts:

```php
// Different ways to represent localhost
http://127.0.0.1       // Classic
http://localhost       // Obvious
http://0.0.0.0         // Surprise!
http://[::1]           // IPv6 localhost
http://2130706433      // Decimal IP (converts to 127.0.0.1)
http://0x7f.0x0.0x0.0x1  // Hex IP
http://127.1           // Short form

// Private IP ranges to block
10.0.0.0/8             // Your internal network
172.16.0.0/12          // Docker default range
192.168.0.0/16         // Your home network
169.254.0.0/16         // Cloud metadata (AWS, Azure, GCP)
```

**Real Talk:** Attackers WILL try all of these. Your validation needs to catch them ALL!

## DNS Rebinding: The Evil Twin Attack 👯

Here's a nasty trick:

1. Hacker controls `evil.com`
2. First DNS lookup returns `1.2.3.4` (passes your validation!)
3. You approve the request
4. Second DNS lookup returns `127.0.0.1` (evil!)
5. Your server makes request to localhost

**The fix:**
```php
// Resolve ONCE and validate the IP, not the hostname
$ip = gethostbyname($parsedUrl['host']);

// Then validate the IP
if ($this->isBlockedIP($ip)) {
    abort(403, 'Forbidden');
}

// Make request directly to the IP
$response = Http::get("http://{$ip}{$parsedUrl['path']}");
```

## AWS/Cloud Specific Protection 🛡️

If you're on AWS, Azure, or GCP:

```php
// Block the metadata endpoints explicitly
$blockedHosts = [
    '169.254.169.254',  // AWS/Azure metadata
    '169.254.170.2',    // AWS ECS metadata
    'metadata.google.internal',  // GCP metadata
];

if (in_array($parsedUrl['host'], $blockedHosts)) {
    abort(403, 'Nice try!');
}
```

**On AWS?** Use IMDSv2 (requires a token to access metadata):

```bash
# In your EC2 user data or launch template
aws ec2 modify-instance-metadata-options \
    --instance-id i-1234567890abcdef0 \
    --http-tokens required \
    --http-put-response-hop-limit 1
```

## Defense in Depth: Network-Level Protection 🏰

Code validation is great, but add these too:

**1. Network Segmentation**

```bash
# Your web servers shouldn't talk to your database directly
# Use separate VPCs/subnets and security groups
```

**2. Egress Filtering**

```bash
# Only allow your servers to make requests to specific IPs/domains
# Block everything else by default
```

**3. AWS VPC Endpoints**

```bash
# Access AWS services without going through public internet
# Metadata endpoint becomes unreachable from your app
```

## Real-World SSRF Wins (For Hackers) 😬

**Capital One Breach (2019)**
- Hacker used SSRF to access AWS metadata
- Stole 100 million customer records
- $80 million fine

**Shopify (2020)**
- Bug bounty: $25,000
- SSRF allowed reading internal services

**GitLab (2021)**
- SSRF in webhook validation
- Could access internal GitLab services

**The pattern:** They all involved accessing internal/cloud resources that should've been unreachable!

## Your SSRF Prevention Checklist ✅

Before you deploy:

- [ ] Whitelist allowed URL schemes (http/https only)
- [ ] Block private IP ranges (10.x, 172.16.x, 192.168.x)
- [ ] Block localhost (127.x, ::1, 0.0.0.0)
- [ ] Block cloud metadata (169.254.169.254)
- [ ] Validate URLs before AND after redirects
- [ ] Resolve hostnames to IPs and validate IPs
- [ ] Set reasonable timeouts (5-10 seconds)
- [ ] Limit response size
- [ ] Validate response content type
- [ ] Use network segmentation
- [ ] Enable IMDSv2 on AWS
- [ ] Log all external requests (for monitoring)

## When You Actually Need This Feature 🤷

**Safe use cases:**
- Website preview generation
- Image/avatar uploads from URL
- Webhook delivery
- RSS feed fetchers
- URL shorteners

**Make it safer:**
1. Use a dedicated service/microservice with NO access to internal network
2. Run it in a separate VPC with strict egress rules
3. Use a proxy service (some cloud providers offer this)
4. Consider alternatives (upload files directly instead of URLs)

## Testing Your SSRF Protection 🧪

```bash
# Try these URLs in your own app (with permission!)
http://127.0.0.1
http://localhost
http://169.254.169.254/latest/meta-data/
http://[::1]
http://0.0.0.0
http://10.0.0.1
http://192.168.1.1

# If ANY of these work, you have a problem!
```

**Pro tip:** Use a tool like Burp Suite or OWASP ZAP to automate testing!

## The Bottom Line 🎯

SSRF turns your server into a weapon against yourself. It's like leaving your car running with the keys in it - sure, it's convenient, but also incredibly stupid!

**The golden rules:**
1. **Never trust user-provided URLs** - Validate EVERYTHING
2. **Block private IPs** - Your internal network is not public
3. **Limit what your server can reach** - Network segmentation saves lives
4. **Use cloud metadata protections** - IMDSv2 is your friend
5. **Monitor outbound requests** - Weird patterns = potential attack

Think of SSRF protection like airport security - annoying but necessary, and way better than the alternative!

---

**Questions? Found an SSRF bug?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). As someone from **YAS** and **InitCrew**, I love talking about security vulnerabilities (and how to crush them)! 🛡️

**Want more security content?** Follow my blog for deep dives into web security! Check out my previous posts on [SQL Injection](/posts/2026-01-25-sql-injection-hack-yourself-before-they-do), [XSS](/posts/2026-01-27-xss-the-javascript-injection-nightmare), and [API Security](/posts/2026-01-30-api-security-dont-let-hackers-crash-your-party)!

**More resources:**
- [PortSwigger SSRF Guide](https://portswigger.net/web-security/ssrf)
- [OWASP SSRF Prevention](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)
- [My GitHub](https://github.com/kpanuragh) for security code examples

*Now go check your code for SSRF vulnerabilities before someone else does!* 🔍✨
