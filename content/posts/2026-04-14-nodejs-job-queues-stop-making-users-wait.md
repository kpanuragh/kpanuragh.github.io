---
title: "🏗️ Node.js Job Queues: Stop Making Your Users Wait in Line"
date: 2026-04-14
excerpt: "Your API endpoint shouldn't be doing heavy lifting while a user stares at a spinner. Learn how to offload background work with BullMQ and Redis so your server stays snappy and your users stay happy."
tags: [nodejs, express, backend, bullmq, redis, job-queues, performance]
featured: true
---

Picture this: a user uploads a profile photo. Your Express handler resizes the image, strips EXIF data, uploads it to S3, sends a confirmation email, and updates three database tables — all before it sends a `200 OK`. Meanwhile, the user is staring at a spinner, wondering if your site died.

You've turned a millisecond HTTP response into a 4-second ordeal. Congrats, you've built a queue — a very bad, synchronous, blocking one inside a request handler.

The fix? **Job queues.** Specifically, [BullMQ](https://bullmq.io/) — the battle-tested, Redis-backed queue library that lets you push work off the critical path and process it in the background like a civilized engineer.

---

## The "Just Do It in the Request" Trap

It's tempting. The code is right there. The database connection is open. Why not just do the work inline?

Because:

- **It's slow.** Every extra millisecond in a request handler is milliseconds your user is staring at a loading bar.
- **It's fragile.** If the email service is down, your entire upload endpoint fails.
- **It doesn't retry.** If something blows up halfway through, good luck knowing where it stopped.
- **It doesn't scale.** Suddenly your cute little "resize an image" function is eating 100% CPU because 50 users uploaded at once.

Request handlers should do one thing: accept input, validate it, and return a response. Heavy lifting belongs in the background.

---

## Enter BullMQ

BullMQ is a Node.js library that gives you:

- **Queues** — a named list of jobs backed by Redis
- **Workers** — processes that pull jobs off the queue and execute them
- **Retries, delays, priorities** — all the knobs you'd want
- **A dashboard** (Bull Board) — because "blind queuing" is not a career move

First, install it:

```bash
npm install bullmq ioredis
```

You'll need a Redis instance. Locally, Docker makes this trivial:

```bash
docker run -d -p 6379:6379 redis:alpine
```

---

## Queuing Work from Your Express Handler

Here's the pattern. When a user uploads a photo, your handler creates a job and immediately responds. The actual processing happens elsewhere.

```javascript
// queues/imageQueue.js
import { Queue } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };

export const imageQueue = new Queue('image-processing', { connection });

// routes/upload.js
import express from 'express';
import { imageQueue } from '../queues/imageQueue.js';

const router = express.Router();

router.post('/upload', async (req, res) => {
  const { userId, fileKey } = req.body;

  // Enqueue the job — this is near-instant
  await imageQueue.add('process-image', {
    userId,
    fileKey,
    uploadedAt: new Date().toISOString(),
  });

  // Respond immediately — don't make the user wait
  res.status(202).json({
    message: 'Upload received! Processing in the background.',
  });
});

export default router;
```

Notice the `202 Accepted` instead of `200 OK`. That's HTTP doing its job — it means "got it, working on it." Your API is now honest about what it's actually doing.

---

## Processing Jobs with a Worker

Workers are separate processes (or at least separate concerns) that consume jobs from the queue. They retry on failure, respect concurrency limits, and don't care that your Express server is getting hammered.

```javascript
// workers/imageWorker.js
import { Worker } from 'bullmq';
import { resizeImage, uploadToS3, sendConfirmationEmail } from '../services/index.js';

const connection = { host: 'localhost', port: 6379 };

const worker = new Worker(
  'image-processing',
  async (job) => {
    const { userId, fileKey } = job.data;

    console.log(`Processing image for user ${userId}...`);

    // Step 1: Resize
    const resizedBuffer = await resizeImage(fileKey);

    // Step 2: Upload to S3
    const s3Url = await uploadToS3(resizedBuffer, fileKey);

    // Step 3: Email confirmation
    await sendConfirmationEmail(userId, s3Url);

    console.log(`Done! Image for user ${userId} is live at ${s3Url}`);

    return { s3Url };
  },
  {
    connection,
    concurrency: 5, // Process up to 5 images at once
  }
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});
```

Run the worker as a separate process — `node workers/imageWorker.js` — and it'll happily chug through the queue without touching your Express server. If the worker crashes, BullMQ automatically retries the job (configurable up to N times with exponential backoff). If your email service is down, only the email jobs fail — not your upload endpoint.

---

## When Should You Use a Queue?

Not everything needs one. A queue is overkill for "look up a user by ID." But it's perfect for:

| Use Case | Why Queue It? |
|---|---|
| Sending emails / SMS | External services are slow and unreliable |
| Image / video processing | CPU-intensive, can chew through resources |
| Generating reports / PDFs | Heavy, can take seconds or minutes |
| Syncing to third-party APIs | Rate limits, retries, eventual consistency |
| Sending webhooks | Need retries if the destination is down |
| Batch database updates | Don't block a request for a bulk write |

The common thread: **anything that could fail independently, take a while, or needs retry logic** should live in a queue.

---

## A Note on "Eventual Consistency"

Using a queue means accepting that work happens *eventually*, not *immediately*. That's a mindset shift. Your client can't assume the image is ready the millisecond it gets a `202`. You'll need to either:

- **Poll** — have the client hit a status endpoint every few seconds
- **WebSockets** — push a notification when the job finishes
- **Email / push notification** — tell the user when it's done

Most of the time, "we'll email you when your report is ready" is a perfectly fine UX. Users understand waiting. What they don't understand is a spinner that spins forever because your server crashed mid-resize.

---

## The Takeaway

Job queues aren't magic — they're just an honest acknowledgment that some work takes time and might fail. BullMQ gives you a robust foundation: retries, concurrency, priorities, and visibility into what's happening.

Your HTTP handlers should be fast, dumb, and reliable. Push the hard stuff into the queue, let workers handle the heavy lifting, and your users will thank you by not rage-quitting your app.

Now go add BullMQ to that "process-everything-in-the-request" endpoint you definitely have in production. We all do. No judgment.

**What are you currently processing inline that should be queued? Drop it in the comments — I'm curious what creative horrors people have baked into their request handlers.**
