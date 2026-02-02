---
title: "API Gateway Pattern: The Traffic Cop Your Microservices Actually Need 🚦"
date: "2026-02-02"
excerpt: "Your microservices are talking to each other like chaos in a parking lot. Let's add an API Gateway to bring order - because nothing says 'I understand architecture' like a single entry point!"
tags: ["architecture", "microservices", "api-design", "scalability", "system-design"]
featured: true
---

# API Gateway Pattern: The Traffic Cop Your Microservices Actually Need 🚦

**Real talk:** The first time I split our monolith into microservices, I felt like an architecture genius. "Look at me, I'm doing microservices!" Then clients started making 15 different API calls just to load one page. Response times tripled. My boss asked if we broke something. 😅

Welcome to the world where you need an API Gateway - the pattern that makes microservices actually usable!

## What's an API Gateway Anyway? 🤔

Think of an API Gateway like the receptionist at a big office building:

**Without API Gateway (Chaos):**
```
Mobile App → Auth Service (http://auth.company.com)
           → User Service (http://users.company.com)
           → Product Service (http://products.company.com)
           → Order Service (http://orders.company.com)
           → Payment Service (http://payments.company.com)

// Client needs to know 5 different URLs, handle 5 different auth methods,
// make 5 separate HTTP calls, and pray nothing breaks!
```

**With API Gateway (Organized):**
```
Mobile App → API Gateway (https://api.company.com)
             ├── /auth/*     → Auth Service
             ├── /users/*    → User Service
             ├── /products/* → Product Service
             ├── /orders/*   → Order Service
             └── /payments/* → Payment Service

// Client talks to ONE endpoint. Gateway handles the routing! 🎯
```

**Translation:** API Gateway = Single entry point that routes requests to the right microservice!

## The Wake-Up Call That Taught Me API Gateways 📞

When designing our e-commerce backend, we split it into microservices. Here's what went wrong:

**Before API Gateway:**

```javascript
// Mobile app code - PAINFUL!
async function loadDashboard(userId) {
    try {
        // 1. Authenticate (different domain!)
        const authResponse = await fetch('https://auth.myapp.com/login', {
            method: 'POST',
            body: JSON.stringify({ token: userToken })
        });
        const { accessToken } = await authResponse.json();

        // 2. Get user profile (another domain!)
        const userResponse = await fetch(`https://users.myapp.com/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = await userResponse.json();

        // 3. Get orders (yet another domain!)
        const ordersResponse = await fetch(`https://orders.myapp.com/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const orders = await ordersResponse.json();

        // 4. Get recommendations (you guessed it, another domain!)
        const recsResponse = await fetch(`https://recommendations.myapp.com/for/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const recommendations = await recsResponse.json();

        return { user, orders, recommendations };
        // 4 network calls, 4 round trips, ~800ms total! 😱
    } catch (error) {
        // Which service failed? Good luck debugging!
        console.error('Something broke:', error);
    }
}
```

**What happened:**
- Mobile app needed to know 4 different service URLs
- 4 separate HTTP requests (network latency × 4)
- CORS nightmares across domains
- Auth token shared across services (security risk!)
- When one service URL changed, we had to update the mobile app
- My mobile developer threatened to quit

**After adding API Gateway:**

```javascript
// Clean, simple, beautiful!
async function loadDashboard(userId) {
    try {
        // ONE call to rule them all!
        const response = await fetch(`https://api.myapp.com/dashboard/${userId}`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });

        const { user, orders, recommendations } = await response.json();
        return { user, orders, recommendations };
        // 1 network call, ~200ms total! ✨
    } catch (error) {
        console.error('Dashboard load failed:', error);
    }
}
```

**Gateway code (Node.js with Express):**

```javascript
const express = require('express');
const router = express.Router();

// API Gateway aggregates data from multiple services
router.get('/dashboard/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Call multiple services in parallel!
        const [user, orders, recommendations] = await Promise.all([
            fetch(`http://users-service:3001/profile/${userId}`),
            fetch(`http://orders-service:3002/user/${userId}`),
            fetch(`http://recommendations-service:3003/for/${userId}`)
        ]);

        // Aggregate and return
        res.json({
            user: await user.json(),
            orders: await orders.json(),
            recommendations: await recommendations.json()
        });
    } catch (error) {
        console.error('Gateway error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});
```

**Results:**
- Mobile app: 4 calls → 1 call (75% reduction!)
- Response time: 800ms → 200ms (Gateway parallelized requests!)
- Client code: Clean AF
- Mobile developer: Happy again! 😊

## Core API Gateway Responsibilities 🛠️

### Responsibility #1: Request Routing

**The Gateway as Traffic Director:**

```javascript
// API Gateway with Express
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Route to different services based on path
app.use('/auth', createProxyMiddleware({
    target: 'http://auth-service:3001',
    changeOrigin: true
}));

app.use('/users', createProxyMiddleware({
    target: 'http://user-service:3002',
    changeOrigin: true
}));

app.use('/products', createProxyMiddleware({
    target: 'http://product-service:3003',
    changeOrigin: true
}));

app.use('/orders', createProxyMiddleware({
    target: 'http://order-service:3004',
    changeOrigin: true
}));

app.listen(8080, () => {
    console.log('API Gateway running on port 8080');
});
```

**Client perspective:**
```
GET https://api.myapp.com/users/123    → User Service
GET https://api.myapp.com/products/456 → Product Service
GET https://api.myapp.com/orders/789   → Order Service
```

**One domain. Multiple services. Beautiful!** ✨

### Responsibility #2: Authentication & Authorization

**Gateway as Security Bouncer:**

```javascript
const jwt = require('jsonwebtoken');

// Centralized auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    });
}

// Apply auth to all routes except login
app.use((req, res, next) => {
    if (req.path === '/auth/login' || req.path === '/auth/register') {
        return next();
    }
    authenticateToken(req, res, next);
});

// Now backend services don't need to handle auth!
app.use('/users', createProxyMiddleware({
    target: 'http://user-service:3002',
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        // Add user info to internal request
        proxyReq.setHeader('X-User-Id', req.user.id);
        proxyReq.setHeader('X-User-Role', req.user.role);
    }
}));
```

**Why this rocks:**
- ✅ Auth logic in ONE place (not duplicated across 10 services!)
- ✅ Backend services trust the Gateway (no JWT verification needed)
- ✅ Easy to swap auth methods (OAuth, JWT, API keys, etc.)
- ✅ Security updates in one place

**When I architected this**, authentication went from "every service does it differently" to "Gateway handles it, services trust it!" Game changer! 🔐

### Responsibility #3: Rate Limiting

**Gateway as Speed Enforcer:**

```javascript
const rateLimit = require('express-rate-limit');

// Create rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply to all requests
app.use('/api/', apiLimiter);

// Stricter limit for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Only 5 login attempts per 15 minutes
    skipSuccessfulRequests: true
});

app.use('/auth/login', authLimiter);
```

**Benefits:**
- Protect backend services from abuse
- Prevent brute-force attacks
- Control costs (API usage limits)
- Different limits per endpoint

**In production, I've learned:** Rate limit at the Gateway, not at individual services! Centralized = easier to manage! 🎯

### Responsibility #4: Request/Response Transformation

**Gateway as Data Translator:**

```javascript
// Transform legacy API responses to modern format
app.use('/api/v2/users', async (req, res) => {
    try {
        // Call legacy v1 user service
        const response = await fetch('http://user-service-v1:3001/users');
        const legacyUsers = await response.json();

        // Transform to new format
        const modernUsers = legacyUsers.map(user => ({
            id: user.user_id,           // Rename field
            name: user.full_name,       // Rename field
            email: user.email_address,  // Rename field
            createdAt: new Date(user.created * 1000).toISOString(), // Unix timestamp → ISO
            // Remove sensitive fields
            // Old API returned: password_hash, ssn, credit_card
        }));

        res.json(modernUsers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
```

**Use cases:**
- Legacy API migration (support old + new formats)
- Hide internal service details from clients
- Aggregate data from multiple services
- Remove sensitive fields before sending to client

### Responsibility #5: Caching

**Gateway as Memory Bank:**

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 min default TTL

app.get('/products/:id', async (req, res) => {
    const { id } = req.params;
    const cacheKey = `product:${id}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log('Cache HIT!');
        return res.json(cached);
    }

    // Cache miss - fetch from service
    console.log('Cache MISS - fetching from service');
    const response = await fetch(`http://product-service:3003/products/${id}`);
    const product = await response.json();

    // Store in cache
    cache.set(cacheKey, product);

    res.json(product);
});
```

**Why cache at the Gateway?**
- ✅ Reduce load on backend services
- ✅ Faster responses for frequently accessed data
- ✅ Single cache layer for all services
- ✅ Easy to invalidate when data changes

**Real impact:** Reduced product service load by 80% during peak traffic! 🚀

### Responsibility #6: Logging & Monitoring

**Gateway as Security Camera:**

```javascript
const morgan = require('morgan');

// Custom logging format
morgan.token('user-id', (req) => req.user?.id || 'anonymous');

app.use(morgan(':method :url :status :response-time ms - :user-id'));

// Detailed request logging
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        // Log to monitoring service (Datadog, New Relic, etc.)
        console.log({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            userAgent: req.get('user-agent'),
            ip: req.ip
        });

        // Alert on slow requests
        if (duration > 1000) {
            console.warn(`SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms`);
        }

        // Alert on errors
        if (res.statusCode >= 500) {
            console.error(`ERROR: ${req.method} ${req.path} returned ${res.statusCode}`);
        }
    });

    next();
});
```

**Benefits:**
- Centralized logging (see ALL requests in one place!)
- Performance monitoring
- Error tracking
- Usage analytics
- Security auditing

**As a Technical Lead, I've learned:** If you can't see it, you can't fix it. Gateway logging = visibility into everything! 👀

## API Gateway Technologies (What Should You Use?) 🛠️

### Option #1: Kong (My Go-To for Production)

**Why I love Kong:**
- ✅ Open-source and battle-tested
- ✅ Plugin ecosystem (auth, rate limiting, logging, etc.)
- ✅ High performance (built on Nginx)
- ✅ Great admin UI

**Docker Compose setup:**

```yaml
version: '3.8'

services:
  kong:
    image: kong:3.0
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: kong-database
      KONG_PG_PASSWORD: kong
    ports:
      - "8000:8000"  # Gateway
      - "8001:8001"  # Admin API
    depends_on:
      - kong-database

  kong-database:
    image: postgres:14
    environment:
      POSTGRES_USER: kong
      POSTGRES_PASSWORD: kong
      POSTGRES_DB: kong
    volumes:
      - kong-data:/var/lib/postgresql/data

volumes:
  kong-data:
```

**Add a route via Kong Admin API:**

```bash
# Add a service
curl -i -X POST http://localhost:8001/services \
  --data name=user-service \
  --data url=http://user-service:3002

# Add a route
curl -i -X POST http://localhost:8001/services/user-service/routes \
  --data paths=/users
```

**Now `http://localhost:8000/users` routes to user-service!** 🎉

### Option #2: AWS API Gateway (Serverless)

**When to use:**
- ✅ Already on AWS
- ✅ Serverless architecture (Lambda)
- ✅ Don't want to manage infrastructure

**Simple Serverless Framework config:**

```yaml
# serverless.yml
service: my-api-gateway

provider:
  name: aws
  runtime: nodejs18.x

functions:
  getUser:
    handler: handlers/users.get
    events:
      - http:
          path: /users/{id}
          method: get

  createOrder:
    handler: handlers/orders.create
    events:
      - http:
          path: /orders
          method: post
```

**Pros:** Zero infrastructure management, auto-scaling, pay-per-request
**Cons:** AWS vendor lock-in, cold starts, limited customization

### Option #3: Custom Gateway (Express/Fastify)

**When I build custom:**
- ✅ Simple use case
- ✅ Need full control
- ✅ Small team, not much traffic (yet)

**Minimal Express gateway:**

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Routes
const routes = {
    '/auth': 'http://auth-service:3001',
    '/users': 'http://user-service:3002',
    '/products': 'http://product-service:3003',
    '/orders': 'http://order-service:3004',
};

// Auto-create proxies
Object.entries(routes).forEach(([path, target]) => {
    app.use(path, createProxyMiddleware({ target, changeOrigin: true }));
});

app.listen(8080, () => console.log('Gateway running on port 8080'));
```

**30 lines of code. Production-ready? Maybe not. Good enough to start? Absolutely!** 🚀

### Option #4: Nginx (The OG Gateway)

**When architecting on AWS, I learned:** Sometimes the simplest solution is the best!

```nginx
# nginx.conf
http {
    upstream auth_service {
        server auth-service:3001;
    }

    upstream user_service {
        server user-service:3002;
    }

    server {
        listen 80;

        location /auth/ {
            proxy_pass http://auth_service/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /users/ {
            proxy_pass http://user_service/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

**Pros:** Blazing fast, rock-solid, everyone knows it
**Cons:** Configuration can get complex, less "API Gateway" features out of the box

## Common API Gateway Mistakes (I Made All of These) 🪤

### Mistake #1: Gateway Becomes a Monolith

```javascript
// BAD: Gateway has business logic!
app.post('/orders', authenticateToken, async (req, res) => {
    try {
        // Gateway should NOT do this!
        const user = await db.users.findById(req.user.id);
        const product = await db.products.findById(req.body.productId);

        if (product.stock < req.body.quantity) {
            return res.status(400).json({ error: 'Out of stock' });
        }

        const order = await db.orders.create({
            userId: user.id,
            productId: product.id,
            quantity: req.body.quantity,
            total: product.price * req.body.quantity
        });

        res.json(order);
        // Gateway is now tightly coupled to database schema! 😱
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GOOD: Gateway just routes!
app.post('/orders', authenticateToken, async (req, res) => {
    try {
        const response = await fetch('http://order-service:3004/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': req.user.id
            },
            body: JSON.stringify(req.body)
        });

        const order = await response.json();
        res.status(response.status).json(order);
        // Gateway is dumb pipe. Services have the logic! ✅
    } catch (error) {
        res.status(500).json({ error: 'Order service unavailable' });
    }
});
```

**Golden Rule:** Gateway = Router + Security + Caching. NOT business logic!

### Mistake #2: Not Handling Service Failures

```javascript
// BAD: No error handling
app.get('/dashboard/:userId', async (req, res) => {
    const [user, orders, recommendations] = await Promise.all([
        fetch('http://user-service:3002/profile'),
        fetch('http://order-service:3004/orders'),
        fetch('http://recommendations-service:3005/recommendations')
    ]);
    // If ANY service fails, entire endpoint fails! 💥
    res.json({ user, orders, recommendations });
});

// GOOD: Graceful degradation
app.get('/dashboard/:userId', async (req, res) => {
    try {
        const results = await Promise.allSettled([
            fetch('http://user-service:3002/profile').then(r => r.json()),
            fetch('http://order-service:3004/orders').then(r => r.json()),
            fetch('http://recommendations-service:3005/recommendations').then(r => r.json())
        ]);

        res.json({
            user: results[0].status === 'fulfilled' ? results[0].value : null,
            orders: results[1].status === 'fulfilled' ? results[1].value : [],
            recommendations: results[2].status === 'fulfilled' ? results[2].value : []
        });
        // Partial success is better than total failure! ✅
    } catch (error) {
        res.status(500).json({ error: 'Dashboard unavailable' });
    }
});
```

**A scalability lesson that cost us:** Recommendations service crashed on Black Friday. Without graceful degradation, the entire dashboard went down. After this fix, recommendations failed but users could still checkout! 🎯

### Mistake #3: No Circuit Breaker

**The problem:** When a service is down, Gateway keeps hammering it!

```javascript
const CircuitBreaker = require('opossum');

// Define circuit breaker options
const options = {
    timeout: 3000, // Fail after 3s
    errorThresholdPercentage: 50, // Open circuit if 50% requests fail
    resetTimeout: 30000 // Try again after 30s
};

// Wrap service call in circuit breaker
const breaker = new CircuitBreaker(async (userId) => {
    const response = await fetch(`http://order-service:3004/orders/${userId}`);
    return await response.json();
}, options);

// Use it
app.get('/orders/:userId', async (req, res) => {
    try {
        const orders = await breaker.fire(req.params.userId);
        res.json(orders);
    } catch (error) {
        if (error.message === 'Breaker is open') {
            // Circuit is open - don't even try calling the service
            return res.status(503).json({
                error: 'Order service is temporarily unavailable'
            });
        }
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Monitor circuit state
breaker.on('open', () => console.warn('Circuit opened!'));
breaker.on('halfOpen', () => console.log('Circuit half-open, testing...'));
breaker.on('close', () => console.log('Circuit closed, service recovered!'));
```

**Why circuit breakers are crucial:**
- Prevent cascading failures
- Fail fast instead of waiting for timeouts
- Automatically recover when service is healthy
- Reduce load on struggling services

**In production, I've learned:** Circuit breakers are mandatory for microservices! They've saved us countless times! 🔌

### Mistake #4: Not Versioning APIs

```javascript
// BAD: Breaking changes affect everyone
app.get('/users/:id', async (req, res) => {
    // Changed response format - mobile app breaks! 💥
});

// GOOD: Version your APIs
app.get('/v1/users/:id', async (req, res) => {
    // Old format for existing clients
    const user = await fetchUser(req.params.id);
    res.json({
        user_id: user.id,
        full_name: user.name
    });
});

app.get('/v2/users/:id', async (req, res) => {
    // New format for new clients
    const user = await fetchUser(req.params.id);
    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
    });
});
```

**API versioning strategies:**
1. **URL path** (`/v1/users`, `/v2/users`) - My favorite! Clear and explicit!
2. **Header** (`X-API-Version: 2`) - Cleaner URLs but less discoverable
3. **Query param** (`/users?version=2`) - Easy to implement but messy

## The Decision Tree: Do You Need an API Gateway? 🌳

**Use API Gateway when:**
- ✅ You have microservices (more than 2-3 services)
- ✅ Multiple clients (web, mobile, IoT) use your APIs
- ✅ You need centralized auth/logging/rate limiting
- ✅ Services are written in different languages/frameworks
- ✅ You want to hide internal service complexity from clients

**Skip API Gateway when:**
- ❌ You have a simple monolith
- ❌ Only internal services call each other (no external clients)
- ❌ One service, one client
- ❌ Adding complexity for no benefit

**My production setup:**
- E-commerce backend: Kong Gateway + 8 microservices
- Internal admin tools: Direct service calls (no gateway needed)
- Public API: AWS API Gateway + Lambda (serverless!)

**Mix and match!** Not every architecture needs the same solution! 🛠️

## Quick Start: Your API Gateway Checklist ✅

Ready to build an API Gateway? Start here:

1. **Choose your stack:**
   ```bash
   # Option 1: Express (custom)
   npm install express http-proxy-middleware

   # Option 2: Kong (production-ready)
   docker-compose up kong

   # Option 3: AWS API Gateway (serverless)
   npm install -g serverless
   ```

2. **Define your routes:**
   ```javascript
   const routes = {
       '/auth': 'http://auth-service:3001',
       '/users': 'http://user-service:3002',
       '/products': 'http://product-service:3003'
   };
   ```

3. **Add authentication:**
   ```javascript
   app.use(authenticateToken); // Centralized auth!
   ```

4. **Add rate limiting:**
   ```javascript
   const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
   app.use('/api/', limiter);
   ```

5. **Add logging:**
   ```javascript
   app.use(morgan('combined'));
   ```

6. **Deploy and monitor!** 📊

## The Bottom Line 💡

API Gateway isn't just "another layer" - it's the pattern that makes microservices actually USABLE!

**The essentials:**
1. **Single entry point** for all clients
2. **Centralized cross-cutting concerns** (auth, logging, rate limiting)
3. **Request routing** to appropriate services
4. **Response aggregation** (combine multiple service calls)
5. **Error handling and circuit breaking** (fail gracefully!)

**The truth about API Gateways:**

They're not "microservices magic" - they're organized chaos management! You're trading distributed complexity for a single point that needs to be ROCK SOLID!

**When designing our e-commerce backend**, I learned this: The Gateway is your contract with clients. Keep it stable. Version it. Monitor it. And for the love of all that is holy, don't put business logic in it! 🚦

You don't need a perfect Gateway from day one - you need a working Gateway that evolves with your architecture! 🚀

## Your Action Plan 🎯

**This week:**
1. Identify all client-facing services
2. Map out current API endpoints
3. Choose a Gateway technology (start simple!)
4. Set up basic routing for top 3 services

**This month:**
1. Add centralized authentication
2. Implement rate limiting
3. Add request logging and monitoring
4. Deploy to production (with circuit breakers!)

**This quarter:**
1. Add response caching for hot paths
2. Implement API versioning strategy
3. Set up alerts for Gateway health
4. Become the microservices guru on your team! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [Kong](https://konghq.com/) - Production-grade API Gateway
- [Express Gateway](https://www.express-gateway.io/) - Built on Express.js
- [Opossum](https://github.com/nodeshift/opossum) - Circuit breaker for Node.js

**Reading list:**
- [API Gateway Pattern by Microsoft](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway)
- [Kong Documentation](https://docs.konghq.com/)

**Real talk:** The best Gateway is the one that fits YOUR architecture. Start simple, measure, iterate!

---

**Struggling with microservices chaos?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your architecture war stories!

**Want to see my Gateway implementations?** Check out my [GitHub](https://github.com/kpanuragh) - I've got examples from simple to production-scale!

*Now go forth and route responsibly!* 🚦✨

---

**P.S.** If your clients are calling 10+ microservices directly, you don't have microservices - you have a distributed monolith with extra steps! Add a Gateway! 🎯

**P.P.S.** I once forgot to add rate limiting to our Gateway. Someone hit our API 10,000 times in 2 minutes. Our AWS bill was $400 that day. Learn from my pain - ALWAYS add rate limiting! 💸
