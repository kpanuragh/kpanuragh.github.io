---
title: "🔀 Open Redirect: The Bug Everyone Underestimates (And Attackers Love)"
date: "2026-06-15"
excerpt: "Open redirect gets dismissed as 'low severity' in every bug triage meeting. Attackers know better — it's a perfect phishing springboard, OAuth token hijack primitive, and SSRF stepping stone. Let's fix that perception."
tags:
  - security
  - web-security
  - owasp
  - vulnerabilities
  - phishing
featured: true
---

Picture this: a security researcher files a bug report. "Open redirect on your login page." Your team's reaction is probably a shrug, a "low priority" label, and a mental note to fix it sometime after the Q3 roadmap, the infra migration, and that one ticket that's been open since 2022.

Here's the thing — attackers don't share your triage priorities. Open redirect is the sleeper agent of web vulnerabilities. It looks boring. It *is* boring, mechanically. And that's exactly what makes it dangerous.

## What Is an Open Redirect, Anyway?

An open redirect happens when your application takes a URL from user input and bounces the browser to it without validation.

The canonical example is a login flow. After authentication, you want to send users back to where they were trying to go:

```
https://yourapp.com/login?next=/dashboard
```

Your server does something like:

```python
# Flask — the naive version
@app.route("/login", methods=["POST"])
def login():
    # ... validate credentials ...
    next_url = request.args.get("next", "/")
    return redirect(next_url)
```

Works great. Until someone crafts:

```
https://yourapp.com/login?next=https://evil.com/steal-your-session
```

Now your trusted domain (`yourapp.com`) is the one delivering users to a phishing page. The address bar shows `yourapp.com` right up until the moment the redirect fires. By then, the victim is already on `evil.com`, and your reputation is catching fire.

## "But It's Just a Redirect"

I've sat in enough security triage calls to have heard every variation of this dismissal:

- *"Users would have to click a weird link"* — they will, because phishing emails from legitimate-looking domains get clicked constantly
- *"The attacker can just link directly to their site"* — sure, but a redirect from your domain has your implicit trust, survives corporate link-scanners, and bypasses phishing filters that blocklist known-bad domains
- *"It's a P3 at most"* — tell that to the OAuth token that just got exfiltrated

That last one deserves its own section.

## Open Redirect + OAuth = Account Takeover

OAuth 2.0's authorization code flow redirects the browser to a `redirect_uri` after the user grants access. Most providers validate this URI against a registered allowlist. But what if your registered URI is itself an open redirect?

```
GET /oauth/authorize
  ?client_id=myapp
  &redirect_uri=https://yourapp.com/login%3Fnext%3Dhttps://evil.com/capture
  &response_type=code
  &scope=openid profile
```

The OAuth provider sees `yourapp.com` — which is on the allowlist. It appends the authorization code and redirects. Your `/login` endpoint then chases the `next` parameter and sends the user (with the code in the URL) to `evil.com`. The attacker exchanges the code for tokens. Game over.

This exact attack chain has shown up in real-world CVEs against major OAuth providers. It's not theoretical.

## The SSRF Angle

On the server side, if your application makes outbound requests to URLs derived from user input and uses an open redirect as an intermediate hop, it can be leveraged to bypass SSRF filters. Some validators only check the initial URL, not the final destination after redirects. Bonus: if the redirect is on an internal service, you've just created a tunnel into your private network.

At Cubet, we do internal security reviews before shipping anything that touches external HTTP calls, specifically because this redirect-chain pattern has bitten teams that thought they'd blocked SSRF at the entry point.

## Fix It Properly

The naive fix is a blocklist (reject URLs containing `://`). Attackers circumvent this in an afternoon with tricks like:

```
//evil.com          # protocol-relative
/\evil.com          # backslash bypass (IE-era, some parsers still)
https:evil.com      # missing double-slash, some browsers accept
%68%74%74%70%73://evil.com  # URL encoding
```

The *correct* fix is an allowlist — redirect only to paths you control:

```python
from urllib.parse import urlparse, urljoin

ALLOWED_HOST = "yourapp.com"

def safe_redirect(next_url: str, fallback: str = "/") -> str:
    parsed = urlparse(next_url)
    # Allow only relative paths or same-host URLs
    if parsed.netloc and parsed.netloc != ALLOWED_HOST:
        return fallback
    # Resolve against base to catch tricks like //evil.com
    safe = urljoin(f"https://{ALLOWED_HOST}", next_url)
    if urlparse(safe).netloc != ALLOWED_HOST:
        return fallback
    return safe

@app.route("/login", methods=["POST"])
def login():
    next_url = request.args.get("next", "/")
    return redirect(safe_redirect(next_url))
```

For most applications, the right answer is even simpler: **don't accept redirect destinations from user input at all**. Store the intended destination in the session at the point the user was intercepted, then read it out post-login. The URL never touches the request parameter.

```python
@app.before_request
def capture_intended():
    if requires_auth() and not current_user.is_authenticated:
        session["next"] = request.url  # save it server-side
        return redirect("/login")

@app.route("/login", methods=["POST"])
def login():
    # ... validate credentials ...
    next_url = session.pop("next", "/dashboard")
    return redirect(next_url)  # no user input involved
```

Clean, simple, and the parameter-tampering attack surface disappears entirely.

## Audit Checklist

If you want to hunt for this in your own codebase, grep for these patterns:

- `redirect(request.args.get(...))`
- `res.redirect(req.query.*)` (Node/Express)
- `header("Location: " . $_GET[...])` (PHP)
- Any `redirect_uri`, `next`, `return_to`, `url`, `goto`, `redir` query parameters

Then trace every one to verify the destination is validated before use. Pay special attention to OAuth callback handlers — they're the highest-value targets.

## The Takeaway

Open redirect is the bug that never makes it onto breach post-mortems because it's always a *component* of a larger attack, not the final step. The phishing campaign, the OAuth account takeover, the SSRF chain — they all get the headline. Open redirect was just the quiet enabler that let it happen on *your* domain.

Bump it up your triage queue. Fix it with an allowlist or session-based destination storage. And the next time someone calls it a "low severity informational," feel free to forward them this post.

---

*Find a redirect in your own code after reading this? Share the war story on [Twitter/X @anuragh27crony](https://twitter.com/anuragh27crony) — the community learns from real examples.*
