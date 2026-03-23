---
title: "BullMQ: Stop Making Your Users Wait for Things That Can Happen Later 🐂"
date: "2026-03-21"
excerpt: "Your users shouldn't stare at a spinner while you send a welcome email. Learn how to offload slow work to background jobs with BullMQ and Redis."
tags: ["\\\"nodejs\\\"", "\\\"express\\\"", "\\\"bullmq\\\"", "\\\"redis\\\"", "\\\"backend\\\"", "\\\"performance\\\"", "\\\"queues\\\""]
featured: "true"
---

# BullMQ: Stop Making Your Users Wait for Things That Can Happen Later 🐂

Picture this: a user signs up on your platform. They click "Create Account" and wait. And wait. And wait. Meanwhile, your server is busy sending a welcome email, resizing their profile picture, triggering three webhooks, and generating a PDF receipt — all synchronously, all on the same request thread.

The user didn't need any of that to happen *before* they saw the dashboard. You just made them wait for your to-do list.

This is exactly the problem background job queues solve. And **BullMQ** — the battle-hardened, Redis-backed job queue for Node.js — is one of the best tools for the job.

## The "Why Bother?" Moment

Anything that doesn't need to happen *right now* shouldn't block your HTTP response. The short checklist:

- Sending emails or SMS
- Image processing / file conversions
- Webhook deliveries
- Generating reports
- Syncing data to third-party APIs
- Sending push notifications

If the user doesn't see the result immediately, it belongs in a queue.

The mental model: your HTTP handler is a **receptionist** — take the request, confirm it's been received, and hand the actual work to someone in the back office. Don't make customers stand at the desk while paperwork gets filed.

## Setting Up BullMQ

BullMQ requires Redis. If you don't have it locally, `docker run -p 6379:6379 redis` gets you there in seconds.

```bash
npm install bullmq ioredis
```

BullMQ has two main concepts: **Queues** (where you add jobs) and **Workers** (where you process them). Let's wire up a simple email queue:

```typescript
// queues/emailQueue.ts
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({ maxRetriesPerRequest: null });

// The Queue — your job inbox
export const emailQueue = new Queue('emails', { connection });

// The Worker — runs in a separate process (or same process for dev)
const emailWorker = new Worker(
  'emails',
  async (job: Job) => {
    const { to, subject, body } = job.data;

    console.log(`Sending email to ${to}...`);
    await sendEmail(to, subject, body); // your email provider here
    console.log(`Done! Job ${job.id} complete.`);
  },
  {
    connection,
    concurrency: 5, // process 5 emails at once
  }
);

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

Now in your Express route, instead of sending the email inline:

```typescript
// routes/auth.ts
import { emailQueue } from '../queues/emailQueue';

app.post('/register', async (req, res) => {
  const { email, name } = req.body;

  // Create user in DB (synchronous — user needs this)
  const user = await db.users.create({ email, name });

  // Add email job to queue (fire and forget — user doesn't need to wait)
  await emailQueue.add('welcome-email', {
    to: email,
    subject: `Welcome, ${name}!`,
    body: `Here's everything you need to get started...`,
  });

  // Respond immediately — don't wait for email delivery
  res.status(201).json({ user, message: 'Account created!' });
});
```

The user gets a response in milliseconds. The email goes out whenever the worker gets to it — usually within a second or two.

## The Superpowers You Get for Free

This is where BullMQ earns its reputation. Out of the box you get:

**Automatic retries with backoff.** Email provider threw a 503? BullMQ retries with exponential backoff so you don't hammer a struggling service.

```typescript
await emailQueue.add('welcome-email', jobData, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

**Delayed jobs.** Send the "You haven't logged in for 7 days" email exactly 7 days after signup:

```typescript
await emailQueue.add('re-engagement', jobData, {
  delay: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});
```

**Scheduled / recurring jobs.** Like cron, but with retry logic and visibility:

```typescript
await emailQueue.add('weekly-digest', jobData, {
  repeat: { pattern: '0 9 * * MON' }, // Every Monday at 9am
});
```

**Job prioritization.** VIP user? Jump the queue:

```typescript
await emailQueue.add('vip-notification', jobData, { priority: 1 }); // lower = higher priority
```

## Keeping an Eye on Things

You can't babysit workers 24/7. BullMQ integrates with **Bull Board** for a slick dashboard showing job counts, failures, processing times, and retries — all in a web UI.

```bash
npm install @bull-board/express @bull-board/api
```

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Navigate to `/admin/queues` and you've got a full job monitoring dashboard. Lock it behind auth before deploying to production — you don't want strangers retrying your email jobs.

## Common Gotchas

**Don't put un-serializable data in job payloads.** Job data is stored in Redis as JSON. No class instances, no circular references, no Buffers unless you encode them first. Keep payloads small — store IDs and fetch fresh data inside the worker.

**Run workers in a separate process in production.** A crashed worker shouldn't take down your web server. Use separate Node processes or containers, and a process manager like PM2 to keep them alive.

**Set a `removeOnComplete` policy** so old jobs don't clog Redis:

```typescript
await emailQueue.add('welcome', data, {
  removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
  removeOnFail: { count: 5000 },     // keep last 5000 failed jobs for debugging
});
```

## The Bottom Line

Background queues are one of those backend patterns that feel optional until the day you *really* need them — when your email provider goes down and takes your entire signup flow with it, or when image processing spikes to 10 seconds and users think your site is broken.

BullMQ gives you a production-grade job queue with retries, scheduling, monitoring, and concurrency control, all on top of Redis you probably already have. The setup is a couple of hours. The payoff is faster response times, more resilient infrastructure, and users who don't rage-quit your spinner.

Start with one queue. Pick your slowest synchronous operation and move it out of the request path. You'll wonder why you waited.

---

**Try it yourself:** Grab the [BullMQ docs](https://docs.bullmq.io) and set up a queue for the slowest thing in your codebase. What would you offload first? Drop a comment below — I'd love to hear what's been holding your response times hostage.
