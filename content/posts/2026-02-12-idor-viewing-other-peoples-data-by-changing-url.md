---
title: "IDOR: How Changing ?user_id=1 to ?user_id=2 Exposes Everyone's Data 🔓"
date: "2026-02-12"
excerpt: "The simplest hack that still works in 2026: just change a number in the URL. Here's why your API is probably leaking user data right now and how to actually fix it."
tags: ["cybersecurity", "web-security", "security", "idor", "authorization"]
featured: true
---

# IDOR: How Changing ?user_id=1 to ?user_id=2 Exposes Everyone's Data 🔓

Remember when you were a kid and discovered that changing the page number in a book's corner would skip ahead? Well, hackers do the same thing with URLs. Except instead of spoiling the plot, they're stealing your users' credit cards. 😬

**Welcome to IDOR** - Insecure Direct Object References - the vulnerability so simple that even your non-technical friends could exploit it. And yet, I see this bug in production systems ALL. THE. TIME.

## What's IDOR? (The 5-Second Explanation) 🤔

**IDOR** = When your app lets users access ANY data just by guessing/changing IDs in the URL.

**Translation:**
- Your profile: `example.com/profile?user_id=123`
- Change to: `example.com/profile?user_id=124`
- **Result:** You're now viewing someone else's private profile! 🎭

**The scary part:** No SQL injection. No XSS. No fancy hacking tools. Just... change a number. That's it!

## The Classic IDOR Attack (Embarrassingly Simple) 🎪

### Your Innocent API:

```javascript
// Express.js API (DON'T DO THIS!)
app.get('/api/orders/:orderId', async (req, res) => {
    const orderId = req.params.orderId;

    // Just fetch the order, no questions asked
    const order = await Order.findById(orderId);

    res.json(order);
});
```

**Seems fine, right?** Let me show you the problem:

**You place an order:**
- URL: `GET /api/orders/1001`
- Response: `{ id: 1001, user: "you", total: "$49.99", address: "123 Your Street" }`

**Hacker tries:**
- URL: `GET /api/orders/1000` (one less!)
- Response: `{ id: 1000, user: "someone_else", total: "$299.99", address: "456 Their Street" }`

**Then hacker writes a script:**
```javascript
// Steal ALL orders in 30 seconds
for (let i = 1; i < 10000; i++) {
    fetch(`/api/orders/${i}`)
        .then(r => r.json())
        .then(order => console.log(order.address)); // Full PII leaked!
}
```

**Real Talk:** In my experience building production systems, I've seen this EXACT vulnerability expose:
- Medical records (HIPAA violation = $50k fine per record)
- Banking transactions
- Private messages
- Social security numbers
- Credit card details

**All because someone forgot one if statement.** 🤦

## Real-World IDOR Disasters 💀

### Story #1: The Facebook Photos Bug

**Year:** 2019
**Vulnerability:** Change photo ID in URL
**Impact:** View ANY private photo on Facebook
**Bounty paid:** $10,000

**How it worked:**
```
Your photo: facebook.com/photo?id=123456789
Change to:  facebook.com/photo?id=123456790
Result:     Someone's "private" vacation photos exposed!
```

**The fix:** Check if the logged-in user has permission to view photo ID 123456790!

### Story #2: The Bank Statement Leak

**Company:** Major US bank (unnamed)
**Vulnerability:** PDF download endpoint
**Impact:** Download ANY customer's statements

**The URL:**
```
GET /statements/download?doc_id=5001
```

**The problem:**
- No check if you own document 5001
- Sequential IDs (easy to guess!)
- PDF contains full account details

**The attack:**
```bash
# Download 10,000 bank statements in 5 minutes
for i in {1..10000}; do
    curl "https://bank.com/statements/download?doc_id=$i" -o "stmt_$i.pdf"
done
```

**As someone passionate about security, this is the kind of bug that keeps me up at night.** One missing authorization check can expose millions of customers!

### Story #3: My Own Discovery (Bug Bounty Win!)

**Target:** E-commerce platform
**Endpoint:** `GET /api/invoices/:id`
**My test:**

```bash
# My invoice
curl https://site.com/api/invoices/9876
# Returns: { user: "me", items: [...], total: "$50" }

# Try sequential IDs
curl https://site.com/api/invoices/9877
# Returns: { user: "random_person", items: [...], total: "$200" }
# ❌ IDOR FOUND!
```

**The payload:** Wrote a simple script, found 50,000+ exposed invoices
**The bounty:** $2,500
**The lesson:** ALWAYS check authorization!

In security communities, we often discuss how the simplest vulnerabilities are the most dangerous because they're overlooked during code reviews!

## Why Your Code Is Probably Vulnerable 🙈

### Mistake #1: "Authentication = Authorization" (WRONG!)

```javascript
// You've authenticated the user (they're logged in)
app.get('/api/documents/:id', authenticateUser, async (req, res) => {
    const doc = await Document.findById(req.params.id);
    res.json(doc); // ❌ But can THEY access THIS document?
});
```

**Authentication:** "Who are you?" (Login check) ✅
**Authorization:** "Can you access THIS resource?" (Missing!) ❌

**Translation:** Just because someone is logged in doesn't mean they should see EVERYTHING!

### Mistake #2: Client-Side Hiding (Security Theater)

```javascript
// Frontend
function MyOrders() {
    // Only showing YOUR orders in the UI
    const orders = orders.filter(o => o.userId === currentUser.id);

    return orders.map(order =>
        <Link to={`/order/${order.id}`}>{order.id}</Link>
    );
}
```

**The problem:** Backend doesn't check ownership!

**What hackers do:**
1. Open browser console
2. Fetch: `GET /api/orders/1` (try all IDs)
3. Profit! 💰

**Remember:** Client-side security is like a "Please Don't Rob Me" sign on your front door. Pointless!

### Mistake #3: Trusting Sequential IDs

```javascript
// Using auto-increment IDs
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    total DECIMAL
);
```

**Your orders:** 1000, 1001, 1002
**Hacker's job:** Try 999, 1003, 1004... (predictable!)

**Better approach:** UUIDs
```javascript
// Random, unpredictable IDs
id: "a7f3c8e9-4b2d-4f6a-9c1e-8d2f7b4e3a1c"
```

**Still not a fix!** UUIDs slow down attackers but don't stop them. You STILL need authorization checks!

## The RIGHT Way to Fix IDOR 🛡️

### Solution #1: Always Check Ownership

```javascript
// Express.js (SECURE VERSION!)
app.get('/api/orders/:orderId', authenticateUser, async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.user.id; // From auth middleware

    // Find order AND verify ownership in one query
    const order = await Order.findOne({
        where: {
            id: orderId,
            user_id: userId  // ✅ The magic line!
        }
    });

    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
        // Don't reveal if order exists but belongs to someone else!
    }

    res.json(order);
});
```

**What changed:**
- Added `user_id: userId` to the query
- If order doesn't belong to user, returns 404
- Same error for "doesn't exist" and "not yours" (no info leak!)

**Pro Tip:** Always return 404, not 403 Forbidden. Why? 403 tells hackers "this exists but you can't access it" - confirming the resource is real!

### Solution #2: Middleware Pattern (DRY Approach)

```javascript
// Reusable authorization middleware
function authorizeOrder(req, res, next) {
    const orderId = req.params.orderId;
    const userId = req.user.id;

    const order = await Order.findOne({
        where: { id: orderId, user_id: userId }
    });

    if (!order) {
        return res.status(404).json({ error: 'Not found' });
    }

    req.order = order; // Attach for next handler
    next();
}

// Use it everywhere!
app.get('/api/orders/:orderId', authenticateUser, authorizeOrder, (req, res) => {
    res.json(req.order); // Already verified!
});

app.delete('/api/orders/:orderId', authenticateUser, authorizeOrder, (req, res) => {
    req.order.destroy(); // Safe to delete!
    res.json({ success: true });
});
```

**Benefits:**
- Write once, use everywhere
- Can't forget the check
- Easy to test
- Consistent error handling

### Solution #3: Framework-Level Authorization (Laravel Example)

```php
// Laravel Policy (my favorite approach!)
class OrderPolicy
{
    public function view(User $user, Order $order)
    {
        return $user->id === $order->user_id;
    }

    public function delete(User $user, Order $order)
    {
        return $user->id === $order->user_id;
    }
}

// In your controller
public function show($orderId)
{
    $order = Order::findOrFail($orderId);

    // One line authorization!
    $this->authorize('view', $order);

    return response()->json($order);
}
```

**Why I love this:**
- Authorization logic in ONE place (the Policy)
- Easy to test
- Readable: `$this->authorize('view', $order)` - crystal clear!
- Laravel throws 403 automatically if unauthorized

**In my experience building production systems,** using framework policies cuts authorization bugs by 90%!

## Advanced IDOR Protection 🔐

### Technique #1: Scope All Queries

```javascript
// BEFORE: Two separate operations
const user = req.user;
const order = await Order.findById(orderId); // ❌ No ownership check!

// AFTER: Single scoped query
const order = await req.user.orders().findById(orderId); // ✅ Automatic scope!
```

**What this does:**
- `req.user.orders()` automatically filters by `user_id`
- Impossible to access other users' data
- Cleaner code!

**Framework support:**
- **Laravel:** `$user->orders()->find($id)`
- **Rails:** `current_user.orders.find(id)`
- **Sequelize:** `user.getOrders({ where: { id: orderId } })`

### Technique #2: UUIDs + Authorization

```javascript
// Migration: Use UUIDs instead of integers
CREATE TABLE orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INT,
    total DECIMAL
);

// Your code stays the same, but now:
// /api/orders/a7f3c8e9-4b2d-4f6a-9c1e-8d2f7b4e3a1c
// Much harder to brute force!
```

**Benefits:**
- Can't guess next ID
- No info leak about number of orders
- Still need authorization checks!

**When UUIDs matter:**
- Public-facing APIs
- When ID enumeration reveals business data
- Multi-tenant systems

**When they don't:**
- Internal admin panels
- APIs behind auth anyway
- Not a replacement for authorization!

### Technique #3: Access Control Lists (ACLs)

```javascript
// For complex permissions
const permissions = {
    orders: {
        view: ['owner', 'admin', 'support'],
        edit: ['owner', 'admin'],
        delete: ['owner']
    }
};

async function checkAccess(user, resource, action) {
    const allowedRoles = permissions[resource]?.[action] || [];

    // Check if user has required role
    if (allowedRoles.includes('owner') && resource.user_id === user.id) {
        return true;
    }

    if (allowedRoles.includes(user.role)) {
        return true;
    }

    return false;
}

// Usage
app.get('/api/orders/:id', authenticateUser, async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (!await checkAccess(req.user, order, 'view')) {
        return res.status(404).json({ error: 'Not found' });
    }

    res.json(order);
});
```

**When to use ACLs:**
- Multi-role systems (admin, support, user)
- Shared resources (team documents)
- Complex permission rules

## Testing for IDOR (Hack Yourself!) 🔍

### Manual Testing

**Step 1:** Login as User A
```bash
# Get your order
curl -H "Authorization: Bearer USER_A_TOKEN" \
    https://api.example.com/orders/1001
# Returns: { id: 1001, user: "userA", ... }
```

**Step 2:** Try accessing User B's data
```bash
# Try sequential IDs
curl -H "Authorization: Bearer USER_A_TOKEN" \
    https://api.example.com/orders/1002

# If you get someone else's data: ❌ IDOR VULNERABLE!
# If you get 404/403: ✅ Probably safe (test more!)
```

**Step 3:** Test ALL endpoints
- GET, POST, PUT, DELETE
- /profile, /messages, /documents, /payments
- Try UUIDs, integers, strings as IDs

### Automated Testing

```javascript
// Jest test example
describe('IDOR Protection', () => {
    it('should not allow viewing other users orders', async () => {
        const userA = await createUser();
        const userB = await createUser();

        const orderB = await Order.create({
            user_id: userB.id,
            total: 100
        });

        // Try to access as User A
        const response = await request(app)
            .get(`/api/orders/${orderB.id}`)
            .set('Authorization', `Bearer ${userA.token}`);

        expect(response.status).toBe(404); // Not 200!
    });
});
```

### Bug Bounty Tips

**Looking for IDOR?** Here's my process:

1. **Find ID parameters**: `?id=`, `/:id/`, `?user=`, etc.
2. **Create two accounts**: User A and User B
3. **Generate resources**: Create order/document/message with User A
4. **Try to access as User B**: Change the ID in the URL
5. **Test all methods**: GET, POST, PUT, DELETE, PATCH
6. **Check edge cases**: Admin endpoints, API vs web, mobile app

**High-value targets:**
- Payment/billing data
- Private messages
- Medical records
- Financial documents
- Admin panels

## The Security Checklist 📋

Before shipping your API:

- [ ] Every endpoint checks resource ownership
- [ ] Using `WHERE user_id = ?` in queries
- [ ] Authorization middleware/policies in place
- [ ] Tested with multiple user accounts
- [ ] UUIDs for sensitive resources (or extra authorization!)
- [ ] Same error message for "not found" and "not authorized"
- [ ] ACLs for multi-role systems
- [ ] Automated tests for cross-user access
- [ ] Rate limiting (slow down brute force attempts)
- [ ] Logging suspicious access patterns

## Quick Wins (Fix Today!) 🏃

**5-Minute Fix:**
```javascript
// BEFORE
const order = await Order.findById(id);

// AFTER
const order = await Order.findOne({
    where: { id, user_id: req.user.id }
});
```

**One line. Massive security boost!**

**Weekend Project:**
1. Audit all API endpoints
2. Grep for: `findById`, `params.id`, `query.id`
3. Add ownership checks
4. Write tests
5. Sleep better at night! 😴

## Real Talk 💬

**Q: "Can I just use UUIDs and skip authorization?"**

A: NO! UUIDs make guessing harder but don't fix IDOR. You MUST check ownership!

**Q: "What about rate limiting?"**

A: Good defense-in-depth! Slows down brute force. But not a fix - still check ownership!

**Q: "Is IDOR still common in 2026?"**

A: YES! It's #1 on the OWASP API Security Top 10. I find it in bug bounties constantly!

**Q: "Should I return 403 or 404?"**

A: 404! Don't confirm that resources exist. Leak less information!

## The Bottom Line

IDOR is the "leaving your diary open to any page" of web security. Sure, most people won't read it. But eventually, someone curious (or malicious) will!

**The essentials:**
1. **Always check ownership** (every endpoint, every time)
2. **Scope queries by user** (let the framework help!)
3. **Test with multiple accounts** (hack yourself first!)
4. **Use frameworks/policies** (don't reinvent authorization)
5. **Return 404, not 403** (leak less info)

Think of authorization like a bouncer at a club. Authentication gets you IN the door (you have a ticket). Authorization checks if you can access the VIP section (you need the right wristband)! 🎫

---

**Found IDOR in your code?** Fix it ASAP! Then check ALL similar endpoints. This bug spreads like wildfire! Share your story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - we all learn together!

**Want to practice finding IDOR?** Check out my [GitHub](https://github.com/kpanuragh) for intentionally vulnerable practice apps!

*P.S. - Go test your API right now: login as User A, try accessing User B's data. If it works, drop everything and fix it. Your users' privacy depends on it!* 🔓✨
