---
title: "📡 SSE vs WebSockets: Stop Using a Sledgehammer When You Need a Push"
date: "2026-05-25"
excerpt: "Real-time APIs don't always need WebSockets. Server-Sent Events are simpler, HTTP-native, and perfect for 80% of streaming use cases — here's how to pick the right tool."
tags: ["backend", "api-design", "sse", "websockets", "real-time", "node.js"]
featured: true
---

Every time someone needs to push data from server to client in real-time, the reflex is the same: "Let's use WebSockets." And I get it. WebSockets feel powerful, they feel modern, and there's something deeply satisfying about holding an open TCP connection like a wizard commanding the network.

But here's the thing: most of the time you don't need bidirectional real-time communication. You need the server to push updates to the client. One direction. And for that specific job, Server-Sent Events (SSE) will save you a dependency, a library, a load balancer headache, and probably a weekend of debugging reconnection logic.

Let me show you when each one actually belongs in your stack.

## The Mental Model

Think of WebSockets as a phone call — both parties can talk at any time, the connection stays open, and there's a full-duplex channel humming between you.

SSE is more like a radio station. The server broadcasts, clients tune in and listen. No talking back through the same channel (you'd make a regular HTTP request for that).

For a lot of "real-time" use cases — live dashboards, activity feeds, order tracking, AI token streaming — you *are* the radio station. Your client is just listening.

## What SSE Actually Is

Server-Sent Events are a W3C standard built on plain HTTP. The server keeps the response stream open and writes `text/event-stream` formatted chunks. No handshake protocol, no binary framing, no library. Just HTTP with a long-lived response.

```javascript
// Express SSE endpoint
app.get('/events/orders/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ status: 'processing', progress: 0 });

  const interval = setInterval(async () => {
    const update = await getOrderUpdate(req.params.id);
    sendEvent(update);
    if (update.status === 'delivered') {
      clearInterval(interval);
      res.end();
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});
```

On the client, the browser's native `EventSource` API handles reconnection automatically. You get retry logic for free — no extra code, no library.

```javascript
// Client — no library needed
const source = new EventSource('/events/orders/abc123');

source.onmessage = (event) => {
  const update = JSON.parse(event.data);
  updateOrderUI(update);
};

source.onerror = () => {
  // Browser auto-reconnects with exponential backoff
  // You don't have to write this part
};
```

That's the entire client. Works through proxies and load balancers out of the box because it's HTTP/1.1 with `Transfer-Encoding: chunked`. Your nginx config doesn't need an upgrade handler.

## What WebSockets Are Actually For

WebSockets earn their complexity when the client needs to send data *frequently* — and the overhead of individual HTTP requests per message would kill performance. Think:

- **Collaborative editing** — multiple cursors, simultaneous keystrokes, conflict resolution
- **Multiplayer games** — position updates firing every 16ms
- **Live chat** — messages going both ways with presence indicators
- **Trading terminals** — you're both subscribing to quotes *and* placing orders on the same session

At Cubet, we audited a customer support tool that used WebSockets for "live agent notifications." When we traced the actual traffic, the client was only ever *receiving* — agents never sent anything back through the socket. We switched to SSE, dropped the `socket.io` dependency entirely, and reconnection logic became a browser built-in. Simpler, more observable, zero library overhead. The engineers who'd built it had just reached for WebSockets because that's what "real-time" meant to them.

WebSockets for WebSockets' sake is one of the most common quiet over-engineering mistakes in backend work.

## The Scaling Story

WebSocket connections are stateful. Every connected client holds an open TCP socket, and your load balancer needs sticky sessions — or a pub/sub layer like Redis — to route messages to the right server instance.

SSE connections are still long-lived, but they compose better with standard HTTP infrastructure. The fan-out pattern with Redis is clean and doesn't require sticky sessions when you're broadcasting the same event to all subscribers:

```javascript
import { createClient } from 'redis';

app.get('/events/feed', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const subscriber = createClient();
  await subscriber.connect();

  await subscriber.subscribe('feed:updates', (message) => {
    res.write(`data: ${message}\n\n`);
  });

  req.on('close', async () => {
    await subscriber.unsubscribe('feed:updates');
    await subscriber.disconnect();
  });
});
```

One Redis subscriber per connected client, but no sticky session requirement. Horizontal scaling stays boring, which is exactly what you want.

## The Decision Matrix

| Use case | Pick |
|---|---|
| Live dashboard / analytics | SSE |
| Order / job status updates | SSE |
| AI response token streaming | SSE |
| Activity feeds / notifications | SSE |
| Chat / messaging | WebSockets |
| Collaborative editing | WebSockets |
| Multiplayer games | WebSockets |
| Trading (quotes + order entry) | WebSockets |

Quick heuristic: if you'd describe it as "the server tells the client what happened," use SSE. If it's "the client and server have a conversation," use WebSockets.

## SSE Gotchas Worth Knowing

**Browser connection limit.** HTTP/1.1 browsers cap SSE connections per domain at 6. With HTTP/2, that limit effectively disappears — streams are multiplexed over a single TCP connection. Worth checking your infra supports HTTP/2 before opening 20 SSE tabs in testing.

**Text only.** SSE is plain text. If you need binary payloads, Base64-encode them or accept that WebSockets are the better fit.

**Resume from disconnect.** Use the `id:` field in events so clients can resume where they left off. The browser automatically sends `Last-Event-ID` on reconnect:

```
id: 1748123
event: order-update
data: {"status":"shipped","trackingId":"TRK9876"}

```

Your server can then skip already-sent events. This is essentially cheap, HTTP-native event replay.

## The Point

Real-time doesn't automatically mean WebSockets. SSE is HTTP-native, trivially proxied, self-healing on disconnect, and dramatically simpler to implement and operate when data flows server-to-client.

WebSockets are the right tool for genuine bidirectional communication. Everything else is a radio station pretending to be a phone call.

Before you wire up another WebSocket server, ask one question: "Does the client actually send data through this connection?" If the honest answer is "rarely" or "never," you've found your SSE use case.

What are you streaming in production right now — and did you make the WebSocket/SSE choice deliberately or by default? I'm genuinely curious.
