---
title: "JWT Security: Stop Shooting Yourself in the Foot 🔫🦶"
date: "2026-01-21"
excerpt: "Think JWTs are secure by default? Think again! Here's how to use JSON Web Tokens without accidentally handing hackers the keys to your kingdom."
tags: ["cybersecurity", "web-security", "security", "jwt", "api-security"]
featured: true
---

# JWT Security: Stop Shooting Yourself in the Foot 🔫🦶

**Hot take:** Most developers using JWTs have no idea they're one misconfiguration away from a security disaster. 🎭

Look, I get it. You Googled "how to authenticate API," found JWT, copied some code from Stack Overflow, and called it a day. We've all been there!

But here's the thing: **JWTs are like chainsaws** - super useful when used correctly, but you can absolutely lose a limb if you're careless.

Let's fix that before someone hacks your app!

## What's a JWT Anyway? 🎫

Think of JWT (JSON Web Token) as a fancy movie ticket that says "this person is allowed in."

**The structure:**
```
header.payload.signature
```

**Translation:**
- **Header:** "I'm a JWT, use this algorithm to verify me"
- **Payload:** "Here's who this person is and what they can do"
- **Signature:** "Here's proof I wasn't tampered with"

**The catch:** Anyone can READ a JWT. It's not encrypted, just encoded! It's like a postcard, not a sealed envelope.

## Mistake #1: Storing Secrets in JWTs 🤦‍♂️

**What people do:**
```javascript
// NOOOO! Stop it! Get some help!
const token = jwt.sign({
  userId: 123,
  email: 'user@example.com',
  password: 'hunter2',           // 😱
  creditCard: '4532-1234-5678',  // 💀
  apiKey: 'secret_key_123'       // ☠️
}, process.env.JWT_SECRET);
```

**Why it's terrible:** JWTs are base64 encoded, not encrypted. Anyone can decode them in literally 2 seconds on jwt.io!

**The right way:**
```javascript
// Much better! Only non-sensitive info
const token = jwt.sign({
  userId: 123,
  email: 'user@example.com',
  role: 'admin'
}, process.env.JWT_SECRET, {
  expiresIn: '1h'  // Always set expiration!
});
```

**Golden Rule:** If you wouldn't write it on a billboard, don't put it in a JWT!

## Mistake #2: Using the 'none' Algorithm 🚨

**The horror story:**

Some JWT libraries accept `"alg": "none"` as a valid algorithm. Guess what that means? **NO SIGNATURE VERIFICATION!**

```javascript
// Hacker creates this token (no signature needed!)
{
  "alg": "none",
  "typ": "JWT"
}
{
  "userId": 1,
  "role": "admin"
}
```

**The fix:**
```javascript
// Explicitly specify allowed algorithms
jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ['HS256']  // Only allow what you actually use
});
```

**Pro tip:** NEVER allow the `none` algorithm. Ever. Not even for testing. Especially not for testing!

## Mistake #3: Weak Secrets 🔑

**What I see too often:**
```env
JWT_SECRET=secret
JWT_SECRET=123456
JWT_SECRET=myapp
```

**Brute force time:** About 0.3 seconds. Congrats, you've been hacked before your coffee got cold! ☕

**The right way:**
```env
# Generate a strong secret (minimum 256 bits for HS256)
JWT_SECRET=09f26e402586e2faa8da4c98a35f1b20d6b033c60

# Or use this command:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Even better:** Use environment-specific secrets and rotate them regularly!

## Mistake #4: No Expiration = Eternal Access 👴

**The bad:**
```javascript
// This token lives FOREVER
const token = jwt.sign({ userId: 123 }, secret);
```

**Why it sucks:** User quits company in 2026. Token still works in 2046. Security nightmare!

**The good:**
```javascript
// Short-lived access token
const accessToken = jwt.sign(
  { userId: 123 },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }  // 15 minutes
);

// Long-lived refresh token (store securely!)
const refreshToken = jwt.sign(
  { userId: 123, type: 'refresh' },
  process.env.REFRESH_SECRET,
  { expiresIn: '7d' }  // 7 days
);
```

**The pattern:**
1. Access token expires quickly (15-60 min)
2. Refresh token lives longer (7-30 days)
3. Use refresh token to get new access token
4. Store refresh token in database so you can revoke it

## Mistake #5: Storing JWTs Wrong 💾

**Bad places to store JWTs:**

❌ **localStorage** - Vulnerable to XSS attacks
```javascript
// Any JavaScript can steal this!
localStorage.setItem('token', jwt);
```

❌ **Regular cookies without flags**
```javascript
// Vulnerable to XSS AND CSRF
document.cookie = `token=${jwt}`;
```

**Good places:**

✅ **httpOnly cookies** (for web apps)
```javascript
// Backend sets this (JavaScript can't access it!)
res.cookie('token', jwt, {
  httpOnly: true,      // JavaScript can't read it
  secure: true,        // HTTPS only
  sameSite: 'strict',  // CSRF protection
  maxAge: 3600000      // 1 hour
});
```

✅ **In-memory storage** (for SPAs)
```javascript
// Store in React state/Redux
// Token lost on refresh, but that's a feature!
const [token, setToken] = useState(null);
```

## Real Talk: The Refresh Token Dance 💃

Here's how the pros do it:

**Step 1:** Login gives you both tokens
```javascript
POST /login
Response: {
  accessToken: "eyJ...",  // Short-lived, use for API calls
  refreshToken: "xyz..."  // Long-lived, stored in DB
}
```

**Step 2:** Use access token for requests
```javascript
GET /api/users
Headers: { Authorization: "Bearer eyJ..." }
```

**Step 3:** When access token expires
```javascript
POST /refresh
Body: { refreshToken: "xyz..." }
Response: { accessToken: "newEyJ..." }
```

**Step 4:** Logout = delete refresh token from DB
```javascript
POST /logout
// Server deletes refresh token from database
// Access token dies naturally when it expires
```

## The JWT vs Session Debate ⚔️

**Use JWTs when:**
- Building a stateless API
- Need to scale horizontally
- Microservices architecture
- Mobile app authentication

**Use sessions when:**
- Traditional web app
- Need instant revocation
- Want simpler security model
- Don't need to scale across servers

**Hot take:** For most small-to-medium apps, sessions are actually easier and more secure. JWT is not always the answer!

## Your JWT Security Checklist ✅

Before you ship:

- [ ] No sensitive data in JWT payload
- [ ] Strong secret (minimum 256 bits)
- [ ] Expiration time set (max 1 hour for access tokens)
- [ ] Algorithm explicitly specified in verification
- [ ] `none` algorithm explicitly rejected
- [ ] Tokens stored in httpOnly cookies or in-memory
- [ ] Refresh token system implemented
- [ ] Refresh tokens stored in database with user association
- [ ] Logout properly invalidates refresh tokens
- [ ] HTTPS only (JWT over HTTP = instant hack)

## Quick Wins (Do These Now!) 🏃‍♀️

1. **Check your JWT secret length**
   ```bash
   echo -n $JWT_SECRET | wc -c
   # Should be at least 32 characters
   ```

2. **Generate a proper secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Add expiration to existing tokens**
   ```javascript
   // Find all jwt.sign() calls and add expiresIn
   ```

4. **Test token validation**
   ```bash
   # Try sending a token with "alg": "none"
   # Your API should reject it!
   ```

## Common Questions 🤔

**Q: "Can I put user roles in the JWT?"**

A: Yes! Roles are fine. But re-fetch them from the DB for sensitive operations (like deleting accounts).

**Q: "Should I encrypt my JWT?"**

A: Usually no. If you need encryption, use JWE (JSON Web Encryption) or rethink your approach. Remember: JWTs aren't meant to hide data!

**Q: "How do I invalidate a JWT?"**

A: You can't (easily). That's why you use short expiration times + refresh tokens stored in a database.

**Q: "RSA or HMAC?"**

A: HMAC (HS256) for single server. RSA (RS256) when you need separate signing/verification keys (like microservices).

## The Bottom Line 🎯

JWTs are powerful but not magic. They won't solve all your auth problems, and they definitely won't secure themselves!

**Remember:**
1. JWTs are NOT encrypted (everyone can read them)
2. Use strong secrets (no really, STRONG)
3. Always set expiration times (short is good)
4. Store them securely (httpOnly cookies FTW)
5. Implement refresh token rotation
6. When in doubt, sessions might be simpler

Think of JWT security like cooking - the ingredients matter, but so does the recipe. One wrong step and you're serving food poisoning to your users! 👨‍🍳

---

**Got JWT nightmares to share?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I love hearing security war stories from the trenches!

**Want more security goodness?** Star my [GitHub](https://github.com/kpanuragh) and follow this blog!

*Now go rotate those JWT secrets!* 🔐✨
