---
title: "🔌 WebSockets in Node.js: Stop Polling Like It's 2010"
date: "2026-03-03"
excerpt: "Still hammering your server with HTTP requests every second to fake real-time? Let's fix that. Here's how WebSockets work in Node.js and why your users will thank you."
tags: ["\\\"nodejs\\\"", "\\\"express\\\"", "\\\"websockets\\\"", "\\\"backend\\\"", "\\\"real-time\\\""]
featured: "true"
---

Imagine you're waiting for a package. You could call the courier every 5 seconds asking "is it here yet?"... or you could just ask them to ring your doorbell when it arrives. One approach is annoying and wasteful. The other is exactly how WebSockets work.

If you've ever built a chat app, live dashboard, or multiplayer game by firing off `setInterval(() => fetch('/updates'), 1000)` — this post is your intervention.

## The Problem with Polling

HTTP is a request-response protocol. You ask, the server answers, and the connection closes. That's great for loading a web page. It's terrible for anything that needs to be *live*.

Polling is the duct tape solution: the client keeps asking the server for new data on a timer. It works, sort of. But you're making hundreds of unnecessary requests, burning through server resources, and introducing artificial latency. Your users see "updated 2 seconds ago" when they should see "now."

The alternatives got better fast: **Long polling** (hacky), **Server-Sent Events** (one-directional, fine for some cases), and then **WebSockets** — a persistent, full-duplex connection where both sides can talk whenever they want.

## WebSockets in Plain English

When a WebSocket connection opens, both the client and server hold an open pipe. Either side can send data *at any time* without the other having to ask first. The server can push a message to the client. The client can send a message to the server. No handshake required for each message. No connection overhead every time.

The initial setup is an HTTP handshake that upgrades to the WebSocket protocol. After that, you're in a persistent TCP connection with very low overhead per message.

## Building a Real-Time Chat with Node.js and `ws`

Let's skip the toy example and build something real. We'll use the `ws` package — lightweight, no magic, just WebSockets.

```bash
npm install ws express
```

```js
// server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Keep track of connected clients
const clients = new Set();

wss.on('connection', (socket) => {
  clients.add(socket);
  console.log(`Client connected. Total: ${clients.size}`);

  socket.on('message', (raw) => {
    const message = JSON.parse(raw);

    // Broadcast to everyone except the sender
    for (const client of clients) {
      if (client !== socket && client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'message',
          text: message.text,
          timestamp: Date.now(),
        }));
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });

  // Send a welcome message immediately on connect
  socket.send(JSON.stringify({ type: 'connected', text: 'Welcome to the chat!' }));
});

server.listen(3000, () => console.log('Server running on :3000'));
```

This is a broadcast chat server in ~35 lines. Every connected client gets a message the instant someone sends one. No polling. No delay. No wasted requests.

Notice the `readyState === 1` check — that's `OPEN`. Always check this before sending. A socket that's closing or closed will throw if you try to write to it. Learned that one the hard way at 2am.

## Handling Heartbeats: The Part Everyone Forgets

WebSocket connections can silently die. A mobile client loses signal, a proxy timeout kicks in, a router reboots — the server might not know the connection dropped for a long time. You'll be "broadcasting" to ghosts.

The fix is a heartbeat mechanism. You ping clients periodically and kill any that don't pong back:

```js
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

wss.on('connection', (socket) => {
  socket.isAlive = true;

  socket.on('pong', () => {
    socket.isAlive = true; // They're still there!
  });

  clients.add(socket);
});

// Ping all clients every 30 seconds
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate(); // They missed their pong, they're gone
      return;
    }
    socket.isAlive = false;
    socket.ping(); // Standard WebSocket ping frame
  }
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeat));
```

The `ws` library handles ping/pong frames at the protocol level. You don't have to roll your own keep-alive logic in your message handler. Set `isAlive = false` before each ping, and only flip it back to `true` when a pong arrives. If the next ping cycle hits and `isAlive` is still `false` — terminate.

This is the difference between a production WebSocket server and one that slowly accumulates zombie connections until memory runs out.

## When to Use WebSockets (and When Not To)

WebSockets are fantastic for:

- **Chat and messaging** — obvious, but for good reason
- **Live dashboards** — stock prices, server metrics, analytics
- **Collaborative editing** — think Google Docs-style real-time sync
- **Multiplayer games** — low latency, bidirectional updates
- **Notifications** — push alerts the moment something happens

They're overkill for:

- **Simple notifications** — Server-Sent Events (SSE) are easier and one-directional
- **Infrequent updates** — if your "live" data changes once a minute, just poll
- **File uploads** — stick with HTTP; it handles this better with streaming

And one gotcha: WebSocket connections are stateful and sticky. If you're running multiple Node.js instances behind a load balancer, a client connected to server A can't receive messages pushed from server B. You'll need a message broker (Redis Pub/Sub is the classic choice) to broadcast across instances. That's a whole other post — but know it's coming if you scale.

## The Client Side

Quick look at how clean the browser side is:

```js
const ws = new WebSocket('ws://localhost:3000');

ws.addEventListener('open', () => {
  console.log('Connected!');
});

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('New message:', data.text);
});

// Send a message
ws.send(JSON.stringify({ text: 'Hello from the browser!' }));
```

The browser WebSocket API is built-in — no library needed on the client. It's event-driven, mirrors the server-side API, and just works.

## What About Socket.io?

You'll hear Socket.io mentioned constantly in this space. It adds rooms, namespaces, automatic reconnection, and fallbacks to polling when WebSockets aren't available. It's great for rapid prototyping and apps that need those abstractions.

The tradeoff: it's heavier, has its own protocol on top of WebSockets, and ties your client to using the Socket.io client library. For most apps where you control both sides, raw `ws` gives you full control with minimal overhead. For complex apps with rooms and presence, Socket.io earns its weight.

## Real-Time Is a Feature, Not a Luxury

Users have been conditioned by Slack, Figma, and Discord. They expect things to update *now*. Polling was the compromise we made when we didn't have better tools. We have better tools.

The next time you reach for `setInterval(() => fetch('/updates'), ...)`, ask yourself: could this be a WebSocket? Probably yes. Your server, your users, and your electricity bill will all benefit.

---

**Got a real-time feature you're building?** Drop a comment or reach out — I'd love to hear what you're working on. And if you're already using WebSockets in production, share your war stories about the zombie connection incident that made you add heartbeats.
