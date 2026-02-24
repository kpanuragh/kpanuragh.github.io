---
title: "🐂 BullMQ: Stop Doing Everything Synchronously in Your Node.js App"
date: 2026-02-24
excerpt: "Sending emails inside a request handler? Resizing images on the main thread? Let's talk about BullMQ — Redis-backed job queues that'll save your API response times and your sanity."
tags: ["nodejs", "express", "bullmq", "redis", "backend", "performance", "queues"]
featured: true
---

# 🐂 BullMQ: Stop Doing Everything Synchronously in Your Node.js App

Picture this: a user clicks "Send Invoice." Your Express handler fires. It generates the PDF, sends the email, logs to a third-party analytics API, and — if you're really brave — also sends a Slack notification. The user stares at a spinner for four seconds. Your API response time graph looks like a heart attack. Your users leave.

There's a better way. It's called a **job queue**, and BullMQ is the best one in the Node.js ecosystem.

---

## What Is BullMQ and Why Should You Care?

BullMQ is a Redis-backed job queue for Node.js. The idea is dead simple:

1. Your web handler **enqueues a job** (takes ~1ms) and returns immediately
2. A **worker process** picks up the job in the background and does the heavy lifting
3. Your users get a fast response and don't know (or care) what happened next

Think of it like a restaurant. When you order food, the waiter doesn't disappear into the kitchen for 20 minutes while you sit there staring at them. They take your order, hand it off to the kitchen, and go handle other tables. BullMQ makes your app work the same way.

---

## Getting Started

First, you need Redis running. If you haven't got it locally, Docker is your best friend:

```bash
docker run -d -p 6379:6379 redis:alpine
```

Then install BullMQ:

```bash
npm install bullmq
```

Now let's wire it up. Here's a real-world example: sending a welcome email after user registration.

### The Queue (Producer)

```typescript
// src/queues/emailQueue.ts
import { Queue } from "bullmq";

const connection = { host: "localhost", port: 6379 };

export const emailQueue = new Queue("emails", { connection });

// In your Express route handler:
// app.post("/register", async (req, res) => {
//   const user = await createUser(req.body);
//   await emailQueue.add("welcome-email", { userId: user.id, email: user.email });
//   res.json({ message: "Registered! Check your email shortly." });
// });
```

Your route handler enqueues the job and returns in milliseconds. The user is happy. Your p95 latency is happy. Everyone wins.

### The Worker (Consumer)

```typescript
// src/workers/emailWorker.ts
import { Worker } from "bullmq";
import { sendWelcomeEmail } from "../services/mailer";

const connection = { host: "localhost", port: 6379 };

const worker = new Worker(
  "emails",
  async (job) => {
    const { userId, email } = job.data;

    console.log(`Processing welcome email for ${email}`);
    await sendWelcomeEmail({ userId, email });

    // BullMQ automatically marks the job as completed when this resolves
    return { sent: true };
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} finished`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

Run this as a separate process (`ts-node src/workers/emailWorker.ts`) and it'll sit there waiting for jobs to arrive. No polling, no cron jobs that fire whether there's work or not — BullMQ uses Redis pub/sub to wake workers up the instant a job lands.

---

## The Part That Makes BullMQ Actually Great

"But wait," you say, "I could just use `setImmediate` or `process.nextTick` for background work." Sure, if you enjoy:

- Jobs silently dying when your process restarts
- No visibility into what's running, failed, or waiting
- Zero retry logic
- Your entire job backlog evaporating during a deploy

BullMQ gives you **persistence, retries, and observability** out of the box.

### Retries and Backoff

```typescript
await emailQueue.add(
  "welcome-email",
  { userId: user.id, email: user.email },
  {
    attempts: 3,               // retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 1000,             // 1s, 2s, 4s between retries
    },
    removeOnComplete: 100,     // keep last 100 completed jobs for debugging
    removeOnFail: 500,         // keep last 500 failed jobs to investigate
  }
);
```

If your email provider has a hiccup, BullMQ backs off and retries automatically. No manual retry logic, no cron job to clean up orphaned tasks, no 3am pages.

---

## Practical Patterns Worth Knowing

**Job Prioritization** — Not all jobs are equal. A password reset email should jump the queue ahead of a weekly digest.

```typescript
await emailQueue.add("password-reset", data, { priority: 1 }); // higher priority
await emailQueue.add("weekly-digest", data, { priority: 10 });  // lower priority
```

**Delayed Jobs** — Schedule work to happen in the future without a cron daemon.

```typescript
// Send a follow-up email 24 hours after signup
await emailQueue.add("follow-up", { userId }, { delay: 24 * 60 * 60 * 1000 });
```

**Rate Limiting** — Respect third-party API limits without building a custom throttler.

```typescript
const worker = new Worker("emails", processor, {
  connection,
  limiter: {
    max: 100,       // max 100 jobs
    duration: 60000 // per minute
  }
});
```

---

## Monitor It With Bull Board

Flying blind on your job queue is a rookie mistake. Install `@bull-board/express` and get a real-time dashboard:

```bash
npm install @bull-board/express @bull-board/api
```

```typescript
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());
```

Now you can see exactly which jobs are waiting, running, completed, or failed — and retry failed jobs with one click. It's the difference between operating a system and hoping for the best.

---

## When to Use a Job Queue (and When Not To)

**Reach for BullMQ when:**
- The task takes more than ~100ms (email, PDF generation, image processing, external API calls)
- The task can tolerate eventual completion (notifications, analytics, webhooks)
- You need retries on failure
- You want to decouple services

**Don't bother when:**
- The result needs to go directly into the HTTP response (user expects immediate output)
- The task genuinely takes < 10ms and almost never fails
- You're building a prototype and Redis adds unnecessary complexity

The rule of thumb: if the user doesn't need the result in *this* response, offload it.

---

## The Bottom Line

Every non-trivial production Node.js app eventually needs a job queue. The alternative — doing everything synchronously in your request handler — is a slow, fragile, unretriable mess waiting to embarrass you in production.

BullMQ is battle-tested, well-maintained, and the job queue the ecosystem has been gradually standardizing on since Bull (its predecessor) proved the pattern works.

Start with one queue for emails. Add another for image resizing. Before long you'll wonder how you shipped anything without it.

**Try it out:** Add BullMQ to one endpoint in your app today. Move your most expensive operation into a worker. Measure the before/after on your response times. The numbers will convince you faster than this post ever could.

Got questions about job queue patterns or BullMQ gotchas you've hit in production? Drop them in the comments below.
