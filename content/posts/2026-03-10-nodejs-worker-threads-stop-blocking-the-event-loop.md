---
title: "🧵 Node.js Worker Threads: Stop Letting CPU Work Murder Your API"
date: "2026-03-10"
excerpt: "The event loop is single-threaded — and that's great, until you try to crunch numbers in it. Worker threads are Node's secret weapon for CPU-heavy tasks without tanking your server."
tags: ["\\\"nodejs\\\"", "\\\"backend\\\"", "\\\"performance\\\"", "\\\"javascript\\\"", "\\\"worker-threads\\\""]
featured: "true"
---

Picture this: your Node.js API is humming along, handling hundreds of requests per second. Then someone uploads a 50MB CSV file and asks you to parse and transform every row. Suddenly, response times shoot from 20ms to 4 seconds for *everyone*. Your beautiful async server just got taken hostage by a CPU-hungry task.

This is the classic Node.js trap — and **worker threads** are the escape hatch most developers never use.

## The Event Loop Has One Job (And One Thread)

Node.js is single-threaded by design. The event loop juggles I/O operations brilliantly because it doesn't *wait* for them — it fires them off and moves on. Waiting for a database query? No problem. Reading a file? Async all the way.

But CPU-bound work is different. When you're hashing passwords in a loop, parsing JSON the size of a phonebook, or running image processing — there's no "await" to yield control. The event loop is *stuck* until the work is done. Every other request queues up, stares at the ceiling, and wonders why Node.js gets so much hype.

Enter `worker_threads` — a built-in module that spins up real OS threads so CPU work runs in parallel, leaving the event loop free to keep serving requests.

## Your First Worker Thread

Here's the pattern in its simplest form. You have a main file and a worker file:

```js
// worker.js — runs in its own thread
const { workerData, parentPort } = require('worker_threads');

function heavyComputation(data) {
  // Simulate expensive CPU work
  let result = 0;
  for (let i = 0; i < data.iterations; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }
  return result;
}

const result = heavyComputation(workerData);
parentPort.postMessage({ result });
```

```js
// main.js — the event loop stays free
const { Worker } = require('worker_threads');
const path = require('path');

function runHeavyTask(iterations) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { iterations }
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

// In your Express route:
app.post('/compute', async (req, res) => {
  const { iterations = 1_000_000 } = req.body;
  const result = await runHeavyTask(iterations);  // event loop is FREE while this runs
  res.json({ result });
});
```

The main thread dispatches work via `workerData`, the worker runs it in isolation, and communicates back through `parentPort.postMessage`. The event loop never blocks. Other requests keep flowing.

## Build a Worker Pool (Don't Spawn a Thread Per Request)

Spawning a new thread for every request is expensive — thread creation has overhead. The right pattern is a **pool** of reusable workers, like a connection pool for your database.

```js
// worker-pool.js
const { Worker } = require('worker_threads');
const os = require('os');

class WorkerPool {
  constructor(workerScript, poolSize = os.cpus().length) {
    this.workerScript = workerScript;
    this.pool = [];
    this.queue = [];

    for (let i = 0; i < poolSize; i++) {
      this._addWorker();
    }
  }

  _addWorker() {
    const worker = new Worker(this.workerScript);
    worker.isIdle = true;

    worker.on('message', (result) => {
      worker.isIdle = true;
      worker._resolve(result);
      this._processQueue();
    });

    worker.on('error', (err) => {
      worker._reject(err);
      // Replace the dead worker
      this.pool = this.pool.filter(w => w !== worker);
      this._addWorker();
    });

    this.pool.push(worker);
  }

  _processQueue() {
    if (this.queue.length === 0) return;
    const idleWorker = this.pool.find(w => w.isIdle);
    if (!idleWorker) return;

    const { data, resolve, reject } = this.queue.shift();
    idleWorker.isIdle = false;
    idleWorker._resolve = resolve;
    idleWorker._reject = reject;
    idleWorker.postMessage(data);
  }

  run(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this._processQueue();
    });
  }
}

module.exports = WorkerPool;
```

Now you create one pool at startup and reuse it across all requests:

```js
const pool = new WorkerPool('./worker.js', 4); // 4 threads, set once

app.post('/process-csv', async (req, res) => {
  const result = await pool.run({ csvData: req.body.data });
  res.json(result);
});
```

This is how production systems handle it. Four threads, hundreds of concurrent requests, zero blocking.

## When Should You Actually Use This?

Worker threads aren't a silver bullet. The overhead of thread communication makes them *slower* than just running code in-line for small tasks. Use them when:

- **Parsing large files**: CSV, XML, JSON files over a few MB
- **Image/video processing**: resizing, compression, format conversion
- **Cryptography at scale**: bcrypt hashing many passwords, key derivation
- **Machine learning inference**: running a TensorFlow.js model
- **Data transformations**: complex ETL pipelines, report generation

Don't use them for:
- Database queries (that's I/O — use async/await like normal)
- Network requests (same — the event loop already handles these well)
- Small computations that finish in microseconds

## The Real-World Payoff

Before worker threads, a typical approach was to offload CPU work to a separate service entirely — spawn a Python process, call a microservice, whatever it takes. Worker threads let you keep the logic in Node.js without sacrificing responsiveness.

One more thing: the `--experimental-worker` flag that used to be required is long gone. Worker threads have been stable since Node.js 12. If you're on anything modern, it's ready to use.

## Go Make Your API Responsive Again

The next time you find a slow endpoint choking your server, ask yourself: is this I/O or CPU? If it's CPU, reach for worker threads. Create a pool sized to your CPU count, offload the heavy lifting, and watch your p99 latencies drop back to where they belong.

Your event loop has one job. Don't make it do yours too.

---

*Have a CPU-intensive Node.js horror story (or a worker thread win)? Drop it in the comments — let's compare battle scars.*
