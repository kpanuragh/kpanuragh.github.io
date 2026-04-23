---
title: "🔄 Background Jobs with BullMQ: Because Some Things Shouldn't Block Your API"
date: 2026-04-23
excerpt: "Sending an email, resizing an image, generating a PDF — why make your user wait? Learn how to offload slow tasks to BullMQ background queues and keep your Express API snappy."
tags: ["nodejs", "express", "bullmq", "queues", "backend", "performance"]
featured: true
---

Picture this: a user clicks "Send Invoice" on your app. Your API dutifully fetches their data, generates a multi-page PDF, attaches it to an email, calls your SMTP server, waits for a response, and *then* — forty-five agonizing seconds later — responds with `200 OK`.

The user has already rage-clicked the button six more times.

This is the background-job problem, and every serious backend app eventually smacks into it. The solution? Stop making your users wait for work that doesn't need to happen *right now*. Hand it off to a queue, respond immediately, and let a worker chew through it in the background.

Enter **BullMQ** — the Redis-backed job queue for Node.js that makes this embarrassingly easy.

---

## Why Not Just `setTimeout`?

I can already hear it: "Can't I just do `setTimeout(() => sendEmail(), 0)` and move on?"

Technically yes. Practically no. When your server restarts (and it will), every job floating in memory evaporates. Your users' invoices vanish into the void. `setTimeout` is the napkin sketch of job queues — fine for a prototype, catastrophic for production.

BullMQ persists jobs in Redis. They survive restarts, can be retried on failure, and can be monitored, delayed, repeated, or prioritized. It's the difference between a sticky note on your monitor and an actual ticketing system.

---

## Setting Up BullMQ

First, you need Redis running. If you're local, `docker run -d -p 6379:6379 redis:alpine` gets you there in ten seconds. In production, a managed Redis instance (Upstash, Redis Cloud, AWS ElastiCache) works perfectly.

```bash
npm install bullmq ioredis
```

Now create your queue and a worker — two separate concerns that BullMQ treats as, well, two separate things:

```typescript
// queue.ts — the "inbox" where jobs are dropped
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis({ maxRetriesPerRequest: null });

export const emailQueue = new Queue("emails", { connection });

// Drop a job in the queue — returns immediately
export async function scheduleWelcomeEmail(userId: string) {
  await emailQueue.add(
    "welcome",
    { userId },
    {
      attempts: 3,           // retry up to 3 times on failure
      backoff: {
        type: "exponential",
        delay: 2000,         // wait 2s, 4s, 8s between retries
      },
    }
  );
}
```

```typescript
// worker.ts — the "processor" that actually does the work
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { sendEmail } from "./mailer";
import { db } from "./database";

const connection = new IORedis({ maxRetriesPerRequest: null });

const emailWorker = new Worker(
  "emails",
  async (job) => {
    if (job.name === "welcome") {
      const user = await db.users.findById(job.data.userId);
      await sendEmail({
        to: user.email,
        subject: "Welcome aboard! 🎉",
        html: `<h1>Hey ${user.name}, glad you're here!</h1>`,
      });
    }
  },
  { connection }
);

emailWorker.on("completed", (job) => {
  console.log(`✅ Email job ${job.id} done`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`❌ Email job ${job?.id} failed:`, err.message);
});
```

That's the core pattern. Your Express route calls `scheduleWelcomeEmail(userId)`, gets back a promise that resolves in milliseconds, and responds to the user. The worker picks up the job independently and does the actual emailing — on its own time, retrying if anything goes sideways.

---

## Wiring It Into Express

Here's how the route looks:

```typescript
// routes/auth.ts
import { Router } from "express";
import { scheduleWelcomeEmail } from "../queue";

const router = Router();

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Create the user synchronously — this is fast
  const user = await db.users.create({ name, email, password });

  // Enqueue the email — also fast (just writes to Redis)
  await scheduleWelcomeEmail(user.id);

  // Respond immediately — no waiting for SMTP
  res.status(201).json({ message: "Account created!", userId: user.id });
});

export default router;
```

Your API responds in ~20ms. The email goes out in ~2 seconds in the background. The user sees a success screen instantly. Everyone wins.

---

## The Patterns That Actually Matter

Once you have a queue, a few patterns unlock real power:

**Delayed jobs** — Schedule a "we miss you" email 7 days after signup:
```typescript
await emailQueue.add("reengagement", { userId }, { delay: 7 * 24 * 60 * 60 * 1000 });
```

**Repeatable jobs** — Send a daily digest at 8 AM UTC:
```typescript
await emailQueue.add("daily-digest", {}, { repeat: { cron: "0 8 * * *" } });
```

**Job priorities** — Password reset emails should jump the queue:
```typescript
await emailQueue.add("password-reset", { userId }, { priority: 1 }); // lower = higher priority
```

These three patterns cover 90% of real-world background job needs.

---

## Running Workers in Production

The worker is a separate Node.js process — which is actually a feature, not a limitation. You can scale them independently of your API. If email volume spikes, spin up more email workers without touching your web servers.

A minimal production setup looks like:

```
web:    node dist/server.js     # Express API
worker: node dist/worker.js     # BullMQ worker
```

In Docker Compose or Kubernetes, these are two separate containers sharing the same Redis instance. Your API stays thin and fast. Your workers do the heavy lifting.

For visibility, check out **Bull Board** (`@bull-board/express`) — it drops a UI onto your app that shows queued, active, completed, and failed jobs. It's the dashboard your ops team will actually look at.

---

## When Should You *Not* Use a Queue?

Queues add complexity: another Redis instance, another process to deploy, another thing to monitor. Don't reach for BullMQ for tasks that take under 200ms and can fail loudly. Synchronous is simpler, and simpler is usually better.

The rule of thumb: if the task takes more than a second, involves a third-party API call, or doesn't need to complete before you respond to the user — queue it.

Sending email? Queue it. Resizing an uploaded photo? Queue it. Generating a PDF report? Queue it. Logging a request to your database? Probably fine inline.

---

## Start Small, Queue Big

BullMQ makes the jump from "everything in the request cycle" to "async background processing" remarkably low-friction. One `npm install`, a Redis connection, and you're offloading work within the hour.

Your users will notice. Response times that used to tick away at 30+ seconds drop to under 100ms. Timeouts stop haunting your error logs. And you stop getting Slack messages at 2 AM because the invoice sender timed out again.

Pick one slow operation in your app today — the email, the PDF, the webhook dispatch — and move it to a queue. That's how it starts. The rest follows naturally.

**What's the slowest thing your API does synchronously? Drop it in a queue. Your users will thank you.**
