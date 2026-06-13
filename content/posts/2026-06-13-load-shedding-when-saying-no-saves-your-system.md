---
title: "Load Shedding: When Saying No Saves Your System 🚫"
date: 2026-06-13
excerpt: "Your service is drowning in traffic. Most systems respond by slowing everyone down until nothing works. Load shedding flips the script — deliberately drop low-priority requests so high-priority ones keep flying."
tags: ["reliability", "devops", "sre", "kubernetes", "platform-engineering"]
featured: true
---

# Load Shedding: When Saying No Saves Your System 🚫

Picture this: Black Friday hits. Traffic spikes 10x. Your API starts responding in 8 seconds. Then 15. Then not at all. Your CDN keeps sending requests. Your autoscaler is spinning up pods as fast as it can. Meanwhile, your database is on its knees, every connection slot taken, query queue backed up to the horizon.

You didn't fail because your system was too small. You failed because it tried to serve *everyone* — and succeeded at serving *no one*.

This is exactly the problem **load shedding** solves. And no, it's not the same as circuit breakers, graceful degradation, or backpressure (though they're friends). Load shedding is the deliberate, intentional act of saying **"not you, not right now"** to incoming requests so the ones that matter can still get through.

## The Distinction That Actually Matters

I've seen these reliability patterns get conflated in engineering discussions at Cubet, so let me draw the line clearly:

- **Circuit breakers** protect you from *downstream* failures. When the payment gateway is timing out, you stop hammering it.
- **Graceful degradation** serves *reduced* responses. No recommendations? Return empty. Search down? Show cached results.
- **Backpressure** signals upstream producers to slow down — classic producer/consumer flow control.
- **Load shedding** drops *incoming* requests at the gate when *you* are the one overwhelmed. It doesn't degrade the response — it rejects it outright with a `503` or `429`.

The key insight: a fast rejection is infinitely better than a slow timeout. A `503` in 2ms costs almost nothing. A request that crawls for 30 seconds before failing burns resources the entire time, making things worse for everyone else waiting behind it.

## Priority: Not All Requests Are Created Equal

The naive version of load shedding drops requests randomly or purely by arrival rate. The smart version sheds by *priority*. In most production systems you have a natural hierarchy:

1. **Critical** — payment processing, auth, health checks, webhook ingestion
2. **Important** — core product reads, user-facing API calls
3. **Background** — analytics events, recommendation refreshes, search indexing, bulk exports

When you're overloaded, kill the third tier first. Your users will never know. Kill the second tier if you have to, carefully. Never kill the first.

Here's a simple Go middleware that does priority-based shedding using CPU load as the signal:

```go
func LoadSheddingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        load := currentCPULoad() // e.g. from /proc/stat, sampled every 500ms

        priority := requestPriority(r) // reads X-Request-Priority header or path prefix

        // Shed aggressively when hot, progressively based on priority
        switch {
        case load > 0.95 && priority < PriorityCritical:
            http.Error(w, `{"error":"overloaded"}`, http.StatusServiceUnavailable)
            return
        case load > 0.80 && priority == PriorityBackground:
            http.Error(w, `{"error":"try later"}`, http.StatusTooManyRequests)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

The beauty of this: background analytics jobs get a `429`, implement retry-with-backoff, and your core API breathes again. No code change required in the callers — they already handle retries. You just made them *use* that code path.

## Admission Control in Kubernetes

At the infrastructure level, Kubernetes gives you a few knobs. The underused one is the API Priority and Fairness (APF) feature — it's been stable since 1.29 and applies to the *kube-apiserver* itself. But for your own workloads, you want load shedding at the ingress layer.

Here's an Nginx Ingress snippet that enforces a request queue limit, so Nginx rejects rather than queues when you're overwhelmed:

```nginx
# In your nginx ConfigMap or annotations
upstream backend {
    server app:8080;
    keepalive 32;
}

server {
    location /api/ {
        proxy_pass http://backend;

        # Drop requests if the queue is full — don't hold them
        proxy_connect_timeout 2s;
        proxy_read_timeout    10s;
        proxy_send_timeout    10s;

        # Limit concurrent connections to the upstream
        limit_conn api_conn 200;
        limit_conn_status 503;

        # Rate-limit burst, return 429 beyond it
        limit_req zone=api_rate burst=50 nodelay;
        limit_req_status 429;
    }

    location /api/internal/analytics {
        # Lower limits for background traffic
        limit_conn api_conn 20;
        limit_req zone=api_rate burst=5 nodelay;
        limit_req_status 429;
    }
}
```

Pair this with a `Retry-After` header on your `503`/`429` responses and clients will back off gracefully instead of hammering you harder.

## The Metric You're Probably Not Tracking

If you're not tracking **request rejection rate** as a primary metric, add it today. It belongs on your SLO dashboard right next to error rate and latency.

A healthy rejection rate during a spike is a *success signal* — it means your load shedding is working. A zero rejection rate during a traffic spike, combined with rising latency, means your system is trying to serve everything and degrading uniformly. That's the bad outcome.

Set an alert for when rejection rate exceeds some threshold (say, 5% of traffic over 5 minutes) — that's your signal to scale out or investigate what's driving the spike.

## Lessons From the Trenches

We hit a version of this at Cubet when an integration partner started hammering our webhook processing endpoint with retry storms — their system was misconfigured and sending every event three times simultaneously. Our endpoint was stateless and fast under normal load, but the 3x multiplier pushed CPU to 100% and dragged response times for *all* consumers.

The fix was straightforward: a sliding window counter per partner ID at the ingress layer, rejecting anything beyond 2x their normal rate with a `429`. The partner's retry loop hit the limit, backed off, and our normal traffic was completely unaffected. The whole change was 15 lines of Lua in our Nginx config and a shared counter in Redis.

No heroics. No emergency scaling. Just a well-placed "no."

## Start Simple, Tune Over Time

Don't overthink this. Start with:

1. **Set connection and queue limits** at your ingress/reverse proxy layer
2. **Return fast 503/429s** instead of letting requests queue forever
3. **Add a `Retry-After` header** so clients back off intelligently
4. **Instrument your rejection rate** and alert on anomalies
5. **Classify your endpoints by priority** and apply tighter limits to non-critical paths

Load shedding isn't glamorous. It doesn't show up in architecture diagrams. But when traffic spikes and your system holds steady while everyone else's falls over — that's the payoff.

The best incident is the one your users never knew happened. Load shedding is how you pull that off.

---

*What's your current load shedding story? Drop it in the comments — I'm especially curious about teams running this inside service meshes like Istio or with Envoy filters. Always more patterns to steal.*
