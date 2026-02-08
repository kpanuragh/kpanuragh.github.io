---
title: "IDOR: The Sneaky Bug That Let Me See Everyone's Orders 🔓"
date: "2026-02-08"
excerpt: "Insecure Direct Object References are everywhere, and they're embarrassingly easy to exploit. Here's how I found one in production and what I learned about access control."
tags: ["cybersecurity", "web-security", "owasp", "api-security"]
featured: true
---

# IDOR: The Sneaky Bug That Let Me See Everyone's Orders 🔓

Ever change a number in a URL and suddenly see someone else's data? Congrats, you found an IDOR! 🎉 (Please don't exploit it though.)

## The "Oh Crap" Moment 😱

So there I was, testing a new feature on our e-commerce platform. Changed `/orders/1234` to `/orders/1235` in the URL just out of curiosity.

**Result:** I could see someone else's order. Their name, address, items, everything.

Then I tried `/orders/1236`. Another person's order.

**My reaction:** "Surely we validate this... right? RIGHT?!"

Narrator: *They did not validate it.*

In my experience building production systems, IDOR (Insecure Direct Object Reference) is one of the most common vulnerabilities I see. It's not flashy like SQL injection, but it's EVERYWHERE.

## WTF is IDOR? 🤔

**The fancy definition:** When your app uses user-supplied input to access objects without proper authorization checks.

**The real definition:** Your app goes "Oh, you want order #1234? Here you go!" without asking "But are YOU the owner of order #1234?"

It's like a hotel giving you a room key just because you know the room number. No ID check, no reservation verification, nothing. 🏨

## The Embarrassingly Simple Exploit 💀

**The vulnerable code I found:**

```javascript
// Express.js - DON'T DO THIS
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);

  // Just... sends it. No questions asked.
  res.json(order);
});
```

**What a "hacker" does:**
1. Log in with their own account
2. See their order: `/api/orders/1234`
3. Try `/api/orders/1233`, `/api/orders/1232`, etc.
4. Profit! They can now see everyone's orders. 💸

**Damage potential:**
- Personal information exposed
- Business data leaked
- Privacy laws violated (hello GDPR fines! 👋)
- Customer trust destroyed

As someone passionate about security, finding this in our own code was both terrifying and educational.

## Real-World Examples That Made Headlines 📰

**Bug bounty story from security communities:**

A researcher found an IDOR in a major social media platform. By changing user IDs in API calls, they could:
- Read private messages
- Delete anyone's posts
- Access private profile data

**Payout:** $15,000 bounty. 💰

**Another one:** E-commerce site where changing `/invoice/123` to `/invoice/124` exposed other customers' invoices with full credit card details (last 4 digits, but still!).

These aren't sophisticated nation-state attacks. These are "change a number in a URL" level bugs.

## How to Fix IDOR (The Right Way) ✅

### 1. Always Check Ownership 🔐

**The secure version:**

```javascript
// Express.js - MUCH BETTER
app.get('/api/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // THE CRITICAL LINE 👇
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(order);
});
```

**Translation:** "I found the order, BUT is it YOUR order? No? Get outta here!" 🚫

### 2. Laravel Makes This Easy 🎯

```php
// Laravel - Built-in authorization
Route::get('/orders/{order}', function (Order $order) {
    $this->authorize('view', $order);

    return response()->json($order);
});

// In OrderPolicy.php
public function view(User $user, Order $order)
{
    return $user->id === $order->user_id;
}
```

**Why I love this:**
- Authorization is explicit
- Reusable across routes
- Throws 403 automatically if unauthorized
- One place to manage all access rules

In my 7+ years building APIs, Laravel's policy system has saved me countless times.

### 3. Use UUIDs Instead of Sequential IDs 🎲

**The problem with sequential IDs:**
```
/orders/1234
/orders/1235  ← Easy to guess!
/orders/1236
```

**Better with UUIDs:**
```
/orders/a3f8d7e2-4b9c-11ed-bdc3-0242ac120002
/orders/b7e9f3d4-4b9c-11ed-bdc3-0242ac120002  ← Good luck guessing!
```

**Important:** UUIDs are NOT security! They're obscurity. You STILL need authorization checks!

Think of it like this:
- Sequential IDs = numbered houses on a street
- UUIDs = random GPS coordinates in a forest

Both need locks on the doors, but one is harder to find.

## Real Talk: Common IDOR Hiding Spots 🕵️

As someone from security communities, here's where we find IDOR most often:

### 1. API Endpoints (The Obvious One)
```
GET /api/users/123
PUT /api/profiles/456
DELETE /api/documents/789
```

### 2. File Downloads 📥
```
/download?file_id=1234
/reports/invoice_5678.pdf
```

I've seen systems where changing the file ID let you download OTHER PEOPLE'S FILES. Yikes!

### 3. Admin Panels (Double Yikes!) 🔥
```
/admin/users/edit/123
/admin/delete/order/456
```

Even "admin" routes need to check if THAT admin can modify THAT resource.

### 4. Hidden in POST Bodies 🙈
```json
POST /api/update-email
{
  "user_id": 123,  ← Attacker changes this!
  "new_email": "hacker@evil.com"
}
```

**The fix:** Use `req.user.id` from the session, NOT from the request body!

## The Testing Checklist 📋

When I review code or do security testing, here's what I check:

**For every endpoint that accesses a resource:**

- [ ] Does it verify the user owns/can access this resource?
- [ ] What happens if I change the ID to someone else's?
- [ ] Does it check permissions BEFORE fetching data?
- [ ] Are authorization rules centralized (policies)?
- [ ] Do we log unauthorized access attempts?

**Quick test:**
1. Log in as User A
2. Get a resource ID for User A
3. Log in as User B
4. Try to access User A's resource

If it works? You have IDOR! 🚨

## Pro Tips from the Trenches 💡

### 1. Fail Closed, Not Open
```javascript
// BAD: Defaults to allowing access
if (user.hasPermission()) {
  // allow
}
// If permission check fails, what happens? Access granted!

// GOOD: Defaults to denying access
if (!user.hasPermission()) {
  return res.status(403).json({ error: 'Forbidden' });
}
// If permission check fails, access denied!
```

### 2. Don't Leak Information in Error Messages
```javascript
// BAD: Tells attacker the resource exists
if (order.userId !== req.user.id) {
  return res.status(403).json({ error: 'This is not your order' });
}

// GOOD: Same response whether it exists or not
if (!order || order.userId !== req.user.id) {
  return res.status(404).json({ error: 'Order not found' });
}
```

If the attacker gets 403, they know the order exists. 404 keeps them guessing! 🎭

### 3. Use Middleware for Common Checks

```javascript
// Create reusable ownership middleware
const checkOwnership = (Model) => async (req, res, next) => {
  const resource = await Model.findById(req.params.id);

  if (!resource || resource.userId !== req.user.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  req.resource = resource; // Attach for route handler
  next();
};

// Use it everywhere
app.get('/orders/:id', checkOwnership(Order), (req, res) => {
  res.json(req.resource); // Already validated!
});
```

## The Automated Testing Approach 🤖

In security communities, we often discuss automated IDOR testing:

```javascript
// Jest/Mocha test
it('should not allow users to access other users orders', async () => {
  const userA = await createUser();
  const userB = await createUser();
  const orderA = await createOrder(userA.id);

  // Login as User B
  const tokenB = await loginAs(userB);

  // Try to access User A's order
  const response = await request(app)
    .get(`/api/orders/${orderA.id}`)
    .set('Authorization', `Bearer ${tokenB}`);

  expect(response.status).toBe(404); // Should be denied!
});
```

Run these tests in CI/CD. If they fail, someone broke authorization! 🚨

## AWS Serverless? You're Not Safe Either! ☁️

Working with Lambda functions, I've seen this pattern:

```javascript
// Lambda function - VULNERABLE
exports.handler = async (event) => {
  const orderId = event.pathParameters.id;

  // Gets order without checking ownership
  const order = await dynamoDB.get({
    TableName: 'orders',
    Key: { id: orderId }
  }).promise();

  return { statusCode: 200, body: JSON.stringify(order) };
};
```

**The fix:** Lambda authorizers + proper checks:

```javascript
exports.handler = async (event) => {
  const orderId = event.pathParameters.id;
  const userId = event.requestContext.authorizer.userId; // From JWT

  const order = await dynamoDB.get({
    TableName: 'orders',
    Key: { id: orderId }
  }).promise();

  // Check ownership!
  if (!order || order.userId !== userId) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' })
    };
  }

  return { statusCode: 200, body: JSON.stringify(order) };
};
```

## Tools to Find IDOR (Before Hackers Do) 🔧

From my experience in security research:

1. **Burp Suite** - Intercept requests, change IDs, see what happens
2. **OWASP ZAP** - Free automated scanner, finds low-hanging fruit
3. **Postman** - Test your APIs with different user tokens
4. **Custom Scripts** - Write scripts to test all your endpoints

**Simple bash script to test:**
```bash
#!/bin/bash
# Test orders endpoint with different IDs
TOKEN="your-jwt-token"

for id in {1000..1100}; do
  curl -H "Authorization: Bearer $TOKEN" \
       "https://api.yoursite.com/orders/$id" \
       -w "\nStatus: %{http_code}\n"
done
```

If you see 200 responses for IDs you shouldn't access? IDOR! 🎯

## The Bottom Line 📌

**IDOR is everywhere because:**
1. It's easy to forget authorization checks
2. It's not caught by traditional security tools
3. Developers focus on authentication, not authorization
4. It requires testing from different user perspectives

**Three rules to live by:**
1. **Never trust user input** - Not even IDs in URLs
2. **Always verify ownership** - Every. Single. Endpoint.
3. **Test with different users** - What User A shouldn't see?

Think of it like this: Authentication is checking if you have a driver's license. Authorization is checking if you're allowed to drive THIS car. 🚗

You wouldn't let anyone with a license drive your car, right? Don't let anyone with a login access any data!

## Quick Win Action Items 🏃‍♂️

**Do this RIGHT NOW:**

1. Pick your most sensitive endpoint (orders, messages, payments)
2. Try accessing it with a different user's ID
3. If it works, you have IDOR - FIX IT!
4. Add authorization checks to all resource endpoints
5. Write tests to prevent regression

**Code review checklist:**
```
For each endpoint:
- [ ] Fetches a resource by ID?
- [ ] Checks if current user owns/can access it?
- [ ] Returns 404 (not 403) for unauthorized access?
- [ ] Has tests for unauthorized access attempts?
```

---

**Found an IDOR in the wild?** Report it responsibly! Most companies have bug bounty programs. As someone passionate about security, I've seen researchers earn thousands for finding these bugs.

**Want to learn more about API security?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). In security communities, we love sharing war stories! 🛡️

**Check out my code on [GitHub](https://github.com/kpanuragh)** - All my projects have proper authorization (learned the hard way! 😅)

*Now go check your APIs for IDOR. I'll wait...* ⏰🔒
