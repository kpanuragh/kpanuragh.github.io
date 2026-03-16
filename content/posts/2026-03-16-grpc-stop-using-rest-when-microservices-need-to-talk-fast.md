---
title: "gRPC: Stop Using REST When Your Microservices Need to Talk Fast ⚡🚀"
date: "2026-03-16"
excerpt: "Our inventory service was calling the pricing service 200 times per second over REST/JSON. Response times averaged 45ms. We switched to gRPC. Response times dropped to 4ms. Same network. Same servers. Just better protocol choices. Here's what I learned designing inter-service communication for a high-traffic e-commerce backend."
tags: ["architecture", "scalability", "system-design", "grpc", "microservices"]
featured: true
---

# gRPC: Stop Using REST When Your Microservices Need to Talk Fast ⚡🚀

**Nobody tells you this when you design your first microservices architecture:**

REST/JSON is amazing for talking to clients. It's a disaster for services talking to each other.

I found this out the hard way. Our e-commerce backend had an inventory service calling a pricing service on every product page load. JSON payloads. HTTP/1.1. Gzip compression that was *technically on* but doing very little for sub-1KB payloads.

At 50 requests/second: fine. At 200 requests/second: our p99 latency hit 180ms and the product team started filing tickets with titles like "Why Is The Site Slow???"

The fix wasn't more servers. It was switching to **gRPC** for internal service communication. That one change dropped inter-service latency by 10x.

Let me show you what gRPC is, when to use it, and when to absolutely avoid it.

## What's Wrong With REST for Internal Services? 🤔

Nothing, if you're running 10 requests/second. Everything, at scale.

```
REST/JSON inter-service call:
─────────────────────────────
1. Establish TCP connection (or reuse from pool)
2. HTTP headers (~400 bytes per request)
3. JSON body: {"productId": 123, "warehouseId": "in-bom-1", ...}
   → Serialized as text
   → Gzip compressed (or not, if payload is tiny)
   → Deserialized back to object on the other side
4. Parse HTTP response headers
5. Deserialize JSON response body

Total for a simple pricing lookup: ~45ms, ~800 bytes over the wire
```

Compare that to gRPC:

```
gRPC inter-service call:
────────────────────────
1. Reuse existing HTTP/2 multiplexed connection
2. Protobuf binary payload: 47 bytes (vs 180 bytes JSON)
3. No repeated headers (HTTP/2 header compression)
4. Deserialized directly from binary (no text parsing)

Total for same pricing lookup: ~4ms, ~150 bytes over the wire
```

Same logic. Same data. One is a horse. The other is a sports car. 🏎️

## What Is gRPC? 🏗️

gRPC is a Remote Procedure Call framework built by Google. It uses:
- **Protocol Buffers (Protobuf)** — binary serialization format
- **HTTP/2** — multiplexed connections, streaming, header compression
- **Code generation** — you define your API in `.proto` files, it generates typed clients and servers in any language

The key idea: instead of designing REST endpoints and JSON shapes by hand, you define a **contract** in a `.proto` file and both sides use generated code.

```
Without gRPC:
  Service A guesses at JSON shape ──► Service B guesses at JSON shape
  "Was it productId or product_id?"
  "Is price a number or a string?"
  "Why does this field sometimes not exist???"

With gRPC:
  .proto file defines contract ──► Code generator ──► Type-safe client + server
  Both sides have identical, generated, typed code.
  Wrong field names are compile errors, not runtime surprises.
```

As a Technical Lead, I've learned: runtime JSON parsing bugs in internal services are some of the most expensive bugs to track down. Protobuf makes them impossible.

## Setting Up gRPC Between Two Node.js Services 🔧

### Step 1: Define the Contract (pricing.proto)

```protobuf
syntax = "proto3";

package ecommerce;

// Define the service
service PricingService {
  rpc GetPrice (PriceRequest) returns (PriceResponse);
  rpc GetPricesBatch (BatchPriceRequest) returns (BatchPriceResponse);

  // Server streaming: push price updates in real-time
  rpc WatchPrice (PriceRequest) returns (stream PriceUpdate);
}

// Define messages (like TypeScript interfaces, but binary)
message PriceRequest {
  int64 product_id = 1;
  string currency = 2;
  string customer_segment = 3; // "vip", "standard", "wholesale"
}

message PriceResponse {
  int64 product_id = 1;
  double base_price = 2;
  double discounted_price = 3;
  bool is_on_sale = 4;
  int64 sale_ends_at = 5; // Unix timestamp
}

message BatchPriceRequest {
  repeated PriceRequest requests = 1;
}

message BatchPriceResponse {
  repeated PriceResponse prices = 1;
}

message PriceUpdate {
  int64 product_id = 1;
  double new_price = 2;
  string reason = 3;
}
```

This single file is your API contract. Check it into git. Both services import it. Changes require updating the `.proto` — no accidental breaking changes via JSON field renames.

### Step 2: The gRPC Server (Pricing Service)

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the proto file
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../protos/pricing.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const pricingProto = grpc.loadPackageDefinition(packageDefinition).ecommerce;

// Implement the service
const pricingService = {
  // Simple unary call: one request → one response
  async GetPrice(call, callback) {
    const { product_id, currency, customer_segment } = call.request;

    try {
      const price = await getPriceFromDatabase(product_id, currency);
      const discounted = applySegmentDiscount(price, customer_segment);

      callback(null, {
        product_id,
        base_price: price.amount,
        discounted_price: discounted.amount,
        is_on_sale: discounted.isSale,
        sale_ends_at: discounted.saleEndsAt || 0,
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error.message,
      });
    }
  },

  // Batch pricing: one request → one response (but multiple prices)
  async GetPricesBatch(call, callback) {
    const { requests } = call.request;

    try {
      // Fetch all prices in parallel
      const prices = await Promise.all(
        requests.map(req => getPriceFromDatabase(req.product_id, req.currency))
      );

      callback(null, {
        prices: prices.map((price, i) => ({
          product_id: requests[i].product_id,
          base_price: price.amount,
          discounted_price: applySegmentDiscount(price, requests[i].customer_segment).amount,
          is_on_sale: false,
          sale_ends_at: 0,
        })),
      });
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error.message,
      });
    }
  },

  // Server streaming: one request → many responses over time
  WatchPrice(call) {
    const { product_id } = call.request;

    const interval = setInterval(async () => {
      try {
        const price = await getPriceFromDatabase(product_id, 'INR');
        call.write({
          product_id,
          new_price: price.amount,
          reason: 'periodic_update',
        });
      } catch (error) {
        call.destroy(error);
      }
    }, 5000); // Send price updates every 5 seconds

    call.on('cancelled', () => {
      clearInterval(interval);
    });

    call.on('end', () => {
      clearInterval(interval);
      call.end();
    });
  },
};

// Start the server
const server = new grpc.Server();
server.addService(pricingProto.PricingService.service, pricingService);

server.bindAsync(
  '0.0.0.0:50051',
  grpc.ServerCredentials.createInsecure(), // Use TLS in production!
  (error, port) => {
    if (error) throw error;
    console.log(`Pricing gRPC server running on port ${port}`);
    server.start();
  }
);
```

### Step 3: The gRPC Client (Inventory Service)

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../protos/pricing.proto'),
  { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);

const pricingProto = grpc.loadPackageDefinition(packageDefinition).ecommerce;

// Create client — reuses HTTP/2 connection automatically
const pricingClient = new pricingProto.PricingService(
  'pricing-service:50051',           // Internal DNS name
  grpc.credentials.createInsecure()  // Or createSsl() with certs
);

// Promisify the callback-based API
const { promisify } = require('util');
const getPrice = promisify(pricingClient.GetPrice.bind(pricingClient));
const getPricesBatch = promisify(pricingClient.GetPricesBatch.bind(pricingClient));

// Usage in inventory service
async function getProductWithPrice(productId, userId) {
  const [product, priceData] = await Promise.all([
    getProductFromDB(productId),
    getPrice({
      product_id: productId,
      currency: 'INR',
      customer_segment: await getUserSegment(userId),
    }),
  ]);

  return {
    ...product,
    price: priceData.discounted_price,
    originalPrice: priceData.base_price,
    onSale: priceData.is_on_sale,
  };
}

// Batch call for product listing pages
async function getProductListWithPrices(productIds, userId) {
  const segment = await getUserSegment(userId);

  // One gRPC call for all prices instead of N REST calls!
  const { prices } = await getPricesBatch({
    requests: productIds.map(id => ({
      product_id: id,
      currency: 'INR',
      customer_segment: segment,
    })),
  });

  return prices; // Already in the right shape, type-safe!
}

// Server streaming: real-time price updates for flash sales
function watchProductPrice(productId, onPriceUpdate) {
  const stream = pricingClient.WatchPrice({ product_id: productId });

  stream.on('data', (update) => {
    console.log(`Price update for product ${productId}: ${update.new_price}`);
    onPriceUpdate(update);
  });

  stream.on('error', (error) => {
    console.error('Price stream error:', error);
  });

  stream.on('end', () => {
    console.log('Price stream ended');
  });

  // Return cancel function
  return () => stream.cancel();
}
```

## The Architecture That Made Our Product Team Happy 📐

When designing our e-commerce backend, this is the pattern we landed on:

```
External Clients (Mobile, Web)
          │
          │  REST/JSON (HTTP/1.1 or HTTP/2)
          ▼
    API Gateway (Express)
          │
          │  gRPC (HTTP/2, Protobuf, persistent connections)
          ├──────────────────┬─────────────────────────────┐
          ▼                  ▼                             ▼
  Inventory Service    Pricing Service              User Service
  (port 50051)         (port 50052)                 (port 50053)
          │                  │
          └──────────────────┘
          gRPC for internal calls
```

**The rule:** REST is for talking to the outside world. gRPC is for services talking to each other.

Why? Clients need human-readable JSON for debugging. They have varied tech stacks. REST is the lingua franca. But for internal services that we control, we can choose the optimal protocol.

**A scalability lesson that changed everything:** Switching our product listing page from 47 individual REST price lookups to one batched gRPC call dropped page load time by 220ms. The product team bought me coffee. It was a good day.

## gRPC's Four Communication Patterns 🗺️

```
Pattern 1: Unary (classic request-response)
  Client ──► one request ──► Server
  Client ◄── one response ◄── Server

Pattern 2: Server Streaming (push updates)
  Client ──► one request ──► Server
  Client ◄── response 1 ◄── Server
  Client ◄── response 2 ◄── Server
  Client ◄── response 3 ◄── Server  (stream ends when server says so)

Pattern 3: Client Streaming (bulk uploads)
  Client ──► request 1 ──► Server
  Client ──► request 2 ──► Server
  Client ──► request 3 ──► Server
  Client ◄── one response ◄── Server

Pattern 4: Bidirectional Streaming (real-time everything)
  Client ◄──► continuous stream in both directions ◄──► Server
```

REST has exactly one pattern: Pattern 1 (plus polling as a sad workaround for the others).

For our flash sale feature, we used server streaming to push real-time price changes from the pricing service to the API gateway without polling. Zero polling overhead. Pure elegance.

## When to Use gRPC vs REST 🤝

| Scenario | Use REST | Use gRPC |
|---|---|---|
| Public API for third-party devs | ✅ | ❌ |
| Mobile/browser clients | ✅ | ⚠️ (grpc-web) |
| Internal service-to-service | ❌ | ✅ |
| High-frequency calls (>100/sec) | ❌ | ✅ |
| Real-time streaming | ❌ | ✅ |
| Multi-language teams | ✅ | ✅ (code gen) |
| Simple CRUD microservice | ✅ | ✅ (either works) |

The most common mistake I've seen: teams use REST internally because "it's simpler." It is simpler — until you're debugging why your services are adding 200ms of latency to every request chain and the answer is "JSON serialization overhead at 500 requests/second."

## Common gRPC Mistakes I've Made 🪤

### Mistake #1: No Deadline / Timeout

```javascript
// ❌ BAD: No timeout — hangs forever if pricing service dies
const price = await getPrice({ product_id: 123 });

// ✅ GOOD: Always set a deadline
const deadline = new Date();
deadline.setSeconds(deadline.getSeconds() + 2); // 2 second timeout

const price = await new Promise((resolve, reject) => {
  pricingClient.GetPrice(
    { product_id: 123, currency: 'INR', customer_segment: 'standard' },
    { deadline }, // ← This is critical
    (error, response) => {
      if (error) reject(error);
      else resolve(response);
    }
  );
});
```

### Mistake #2: Using Insecure Credentials in Production

```javascript
// ❌ BAD: plaintext in production (fine for local dev)
grpc.credentials.createInsecure()

// ✅ GOOD: Mutual TLS between services
const credentials = grpc.credentials.createSsl(
  fs.readFileSync('/certs/ca.crt'),
  fs.readFileSync('/certs/client.key'),
  fs.readFileSync('/certs/client.crt'),
);
```

In production, either use mTLS directly, or run a service mesh like Istio/Linkerd that handles it transparently. Don't skip this step just because it's internal traffic.

### Mistake #3: Blocking on Individual Calls Instead of Batching

```javascript
// ❌ BAD: 50 sequential gRPC calls (even fast calls compound!)
for (const productId of productIds) {
  const price = await getPrice({ product_id: productId }); // Sequential!
  results.push(price);
}
// 50 × 4ms = 200ms total

// ✅ GOOD: Batch request OR concurrent calls
const prices = await getPricesBatch({ requests: productIds.map(id => ({ product_id: id })) });
// 1 call × 8ms = 8ms total (25x faster!)
```

### Mistake #4: Forgetting gRPC-Web for Browsers

```javascript
// ❌ BAD assumption: "I'll call gRPC directly from the browser"
// Browsers don't support HTTP/2 trailers — gRPC won't work directly.

// ✅ GOOD: Use gRPC-Web with Envoy proxy, or just REST for external clients
// Keep gRPC internal. REST for browsers/mobile.
```

## Real Numbers From Production 📊

After migrating our inventory ↔ pricing communication from REST to gRPC:

```
Before (REST/JSON):
  Average latency:     45ms
  p99 latency:        180ms
  Payload size:       ~850 bytes (JSON)
  Connections:        New connection per request (connection pool, but still)

After (gRPC/Protobuf):
  Average latency:      4ms  (11x faster)
  p99 latency:         18ms  (10x faster)
  Payload size:       ~85 bytes (90% smaller)
  Connections:        1 persistent HTTP/2 connection, multiplexed
```

Same data. Same logic. Same servers. Just a better protocol.

The 850 → 85 byte reduction was surprising. Protobuf is not just "a bit more compact than JSON" — it's radically more efficient for structured data because it uses field indices instead of field names in the binary encoding.

## TL;DR — When to Make the Switch ✅

**Switch your internal service communication to gRPC if:**
- [ ] You have high-frequency calls between services (>50/second)
- [ ] JSON parsing is showing up in your profiler
- [ ] You need real-time streaming without polling
- [ ] Multiple languages need to call the same service (code gen handles compatibility)
- [ ] You want typed contracts enforced at compile time, not runtime

**Keep REST if:**
- [ ] You're building a public API for external developers
- [ ] Browser/mobile clients are calling the service directly
- [ ] The team isn't ready for `.proto` files yet (crawl before run)
- [ ] You have very low call frequency (REST is fine at <10/second)

**As a Technical Lead, I've learned:** You don't need to rip out all your REST APIs. Start with your hottest internal service call — the one that appears in every request trace, the one where latency compounds. Migrate that one to gRPC. Measure the results. Let the numbers make the argument for you.

REST is your public face. gRPC is your internal nervous system. Design them accordingly.

---

**Ever had a latency problem that turned out to be a protocol choice?** Share your war story on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**Want to see a production gRPC setup with mTLS and health checks?** Hit me up on [GitHub](https://github.com/kpanuragh) — I've got a repo for that.

*Pick the right protocol. Ship faster. Sleep better.* ⚡
