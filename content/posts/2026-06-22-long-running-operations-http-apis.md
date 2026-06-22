---
title: "The 30-Second Timeout Is Coming for Your API ⏳"
date: "2026-06-22"
excerpt: "Long-running operations and synchronous HTTP don't mix. Here's how to design async job APIs that don't leave clients hanging — polling, SSE, webhooks, and the patterns that actually hold up in production."
tags:
  - backend
  - api-design
  - http
  - distributed-systems
  - nodejs
featured: true
---

Picture this: a client calls your API to kick off a report that crunches three months of sales data, joins four tables, and emails a PDF. Your handler dutifully starts the work… and 35 seconds later the load balancer's timeout fires, the client gets a 504, and your database query is still happily running in the background like nothing happened.

Welcome to the synchronous HTTP trap. Your API is holding its breath, and eventually something upstream will stop waiting.

## Why Synchronous HTTP Has a Short Fuse

HTTP was designed for the request-response cycle. You ask, I answer, we part ways. That model breaks the moment "answering" takes more than a second or two because:

- **Load balancers have hard timeouts** — AWS ALB defaults to 60 seconds, Cloudflare to 100. You don't control these.
- **Clients retry on timeout** — so that expensive job kicks off a second time, and a third.
- **One slow request hogs a worker** — in a thread-per-request model, your connection pool drains. Even with async Node.js, long-held HTTP connections count against limits.

The fix isn't "make it faster" (sometimes you can't). The fix is to design the API so HTTP is only responsible for *accepting* work, not *completing* it.

## Pattern 1: The Async Job (202 Accepted + Polling)

The gold standard for long-running operations is to immediately respond with `202 Accepted`, hand the work to a queue, and give the client a job ID to poll.

```typescript
// POST /reports → kick off job
app.post('/reports', async (req, res) => {
  const jobId = crypto.randomUUID();

  await db.jobs.create({
    id: jobId,
    status: 'pending',
    payload: req.body,
    createdAt: new Date(),
  });

  await queue.publish('report.generate', { jobId });

  res.status(202).json({
    jobId,
    statusUrl: `/reports/jobs/${jobId}`,
    retryAfter: 5, // hint: poll in ~5 seconds
  });
});

// GET /reports/jobs/:id → check status
app.get('/reports/jobs/:id', async (req, res) => {
  const job = await db.jobs.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'done') {
    return res.json({ status: 'done', resultUrl: `/reports/${job.resultId}` });
  }

  if (job.status === 'failed') {
    return res.status(200).json({ status: 'failed', error: job.errorMessage });
  }

  res.set('Retry-After', '5');
  res.json({ status: job.status, progress: job.progress ?? null });
});
```

A few things worth noting here:

- **Return `200` for failed jobs, not `5xx`.** A failed job is a *known terminal state* — the job itself succeeded in running and learning it failed. Reserve 5xx for infrastructure errors.
- **Include `Retry-After`** as both a header and a body hint — it tells well-behaved clients how long to wait before polling again.
- **Return `resultUrl`** rather than embedding the result inline. The job status endpoint stays lean; the actual payload lives at its own URL where it can be cached.

At Cubet, we use this pattern for anything our clients need to wait on — bulk data exports, invoice generation, video transcoding. The rule of thumb on my team: if it touches more than one external service or takes over two seconds at p95, it gets a job ID.

## Pattern 2: Server-Sent Events for Live Progress

Polling works, but it's chatty and you're always at least one interval behind. If the client is a browser or a terminal UI that wants to *stream* progress, Server-Sent Events (SSE) are a better fit.

```typescript
app.get('/reports/jobs/:id/stream', async (req, res) => {
  const job = await db.jobs.findById(req.params.id);
  if (!job) return res.status(404).end();

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
  });
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // subscribe to job progress via Redis pub/sub or similar
  const unsubscribe = pubsub.subscribe(`job:${job.id}`, (message) => {
    send(message.event, message.data);
    if (message.event === 'done' || message.event === 'failed') {
      unsubscribe();
      res.end();
    }
  });

  // clean up if client disconnects
  req.on('close', unsubscribe);
});
```

SSE is underrated. It's HTTP/1.1, firewall-friendly, and has built-in reconnection in the browser's `EventSource` API. You don't need WebSockets unless you need bidirectional communication — and for job progress you definitely don't.

The `X-Accel-Buffering: no` header is the sneaky one — without it, nginx will buffer your stream and the client sees nothing until the buffer fills. Burned by this more than once.

## Pattern 3: Webhooks for Fire-and-Forget Clients

Sometimes the client doesn't want to sit around polling or streaming. They have their own server; just call them back when it's done.

```typescript
// POST /reports with a callbackUrl in the body
app.post('/reports', async (req, res) => {
  const { callbackUrl, ...payload } = req.body;
  const jobId = crypto.randomUUID();

  await db.jobs.create({ id: jobId, callbackUrl, payload });
  await queue.publish('report.generate', { jobId });

  res.status(202).json({ jobId });
});

// Inside the worker, after processing:
async function notifyCallback(job, result) {
  if (!job.callbackUrl) return;

  const body = JSON.stringify({ jobId: job.id, status: 'done', result });
  const sig = hmac('sha256', process.env.WEBHOOK_SECRET, body);

  await fetch(job.callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-SHA256': `sha256=${sig}`,
    },
    body,
  });
}
```

Always sign your webhook payloads. The client needs proof the call came from you, not a random person who guessed their endpoint URL. HMAC-SHA256 over the raw body is the industry convention (same approach as GitHub and Stripe use).

## The Decision Flowchart

Choosing between these patterns is actually straightforward:

- **Client is a backend service that doesn't need real-time feedback** → async job + polling
- **Client is a browser or CLI that wants live progress** → SSE stream
- **Client has its own server and wants to stay decoupled** → webhook callback
- **Operation takes under ~2 seconds at p99** → synchronous is fine, don't over-engineer it

You can combine them: offer polling as the baseline, SSE for clients that want it, and an optional callback URL for integrations. The job entity in the database is the single source of truth regardless of how the client chooses to observe it.

## Things That Will Bite You

**Orphaned jobs.** If a worker crashes mid-job, the job stays `in_progress` forever. Add a `startedAt` timestamp to jobs and a sweeper that requeues anything `in_progress` for more than N minutes with no heartbeat update.

**Duplicate submissions.** Clients retry when they don't hear back. Consider accepting an `idempotency-key` header and storing it against the job — if the same key comes in twice, return the existing job instead of creating a new one.

**Unbounded job history.** Jobs accumulate. Set a TTL on completed/failed jobs (30 days is common) and delete them in a background sweep. Don't let your jobs table become a data lake by accident.

**Result storage.** Where does the actual output live? S3 or equivalent for large payloads; your DB for small ones. Either way, generate a short-lived signed URL for `resultUrl` rather than serving the file through your API — your API shouldn't become a CDN.

---

Long-running operations are one of those API design problems that feels annoying until you've shipped a feature that works beautifully — watching a progress bar tick up in real time while your SSE stream feeds it is genuinely satisfying. The `202 Accepted` dance is 20 extra lines of code and it saves you from a category of production incidents that are otherwise nearly impossible to debug.

Return early. Queue the work. Give the client a way to check in. Your load balancer will thank you.

---

*Have you run into creative variations of this pattern — long-polling, gRPC streams, or something weirder? Drop a note; always curious how others solve it.*
