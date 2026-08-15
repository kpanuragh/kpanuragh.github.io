---
title: "Load Shedding: Teaching Your Service to Say No Before It Falls Over 🚦"
date: "2026-08-15"
excerpt: "When traffic spikes, most services try to serve everyone and end up serving no one. Load shedding is the art of picking who to disappoint on purpose, so the other 90% of your users never notice anything happened."
tags:
  - devops
  - reliability
  - sre
  - platform-engineering
featured: true
---

There's a very specific kind of dread that comes from watching a dashboard during a traffic spike. CPU climbing. Latency climbing right alongside it. And then the death spiral: requests start timing out, clients retry, retries add more load, load adds more latency, more requests time out. Nobody set out to build a denial-of-service attack against themselves, but that's exactly what an unbounded, best-effort service does under pressure.

Load shedding is the unglamorous fix. Instead of trying to serve every request and slowly failing all of them, you deliberately reject some requests — fast, cheaply, on purpose — so the ones you keep can actually succeed. It's the engineering equivalent of a bouncer capping capacity instead of letting the room get so packed that everyone suffocates.

## Why "just autoscale" isn't the answer

Autoscaling is great and you should have it. It is also not instant. A new pod needs to be scheduled, pulled, started, pass its readiness probe, and warm up — that's routinely 30-90 seconds, sometimes minutes if you're pulling a fat image or warming a JIT/cache. A spike that triples your traffic in 10 seconds will flatten you long before new capacity shows up.

Autoscaling handles *sustained* growth. Load shedding handles the *gap* between "traffic exceeded capacity" and "capacity caught up." You need both, and conflating them is how teams end up surprised in incident reviews.

## Picking what to shed

The naive version of load shedding is a global concurrency limit: once you're handling N requests, reject the N+1th with a 503. That's a real improvement over nothing, but it treats a health-check ping and a checkout submission as equally disposable, which they are not.

A slightly better version sheds by priority. Tag requests — by endpoint, by header, by customer tier — and drop low-priority traffic first:

```python
# Simplified priority-aware admission control
import time
from collections import deque

class LoadShedder:
    def __init__(self, max_inflight=200):
        self.max_inflight = max_inflight
        self.inflight = 0

    def admit(self, priority: str) -> bool:
        # priority: "critical" | "standard" | "best_effort"
        if self.inflight >= self.max_inflight:
            if priority == "critical":
                # allow a small overshoot budget for critical paths
                return self.inflight < self.max_inflight * 1.1
            return False
        return True

    def start(self):
        self.inflight += 1

    def finish(self):
        self.inflight -= 1
```

Checkout and auth get marked `critical`. Recommendation widgets and analytics beacons get marked `best_effort`. When things get tight, the homepage might render without its "you might also like" carousel — annoying, invisible to most users, and infinitely better than the whole site timing out.

## Shed at the edge, not at the database

The other lesson that took me longer than it should have: reject early. If a request is going to get shed, the cheapest place to reject it is the load balancer or the API gateway — not three services deep, after it's already burned a database connection and a thread.

We had a service at Cubet that computed a fairly expensive personalization score before checking whether it even had capacity to finish the request. Under load, we were spending CPU cycles building responses we then discarded because a downstream call timed out. Moving the admission check to the front of the request, before any real work started, cut wasted CPU during spikes dramatically — the rejected requests cost a few microseconds instead of tens of milliseconds.

If you're running Envoy or nginx in front of your services, you get some of this almost for free:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;

server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://backend;
    }
}
```

It's blunt — per-client rate limiting, not priority-aware — but it stops a single noisy client or a retry storm from eating the whole box, and it costs you nothing to add.

## Make rejection cheap for the caller too

A 503 that arrives instantly is a gift. A 503 that arrives after your client's 10-second timeout, or after three retries with no backoff, is just a slower way of causing the same outage. Always pair shedding with:

- **Fast rejection** — check admission before any expensive work, not after.
- **`Retry-After` headers** — tell the client when it's worth trying again instead of making it guess.
- **Backoff and jitter on the client side** — a thundering herd of synchronized retries is how a shed load spike becomes a second load spike, 30 seconds later, self-inflicted.

That last one bites teams constantly: you ship load shedding, the incident dashboard looks great, and then every client retries at exactly the same interval and you get a heartbeat of secondary spikes for the next ten minutes. Jitter isn't optional decoration, it's load-bearing.

## What to actually shed on

CPU and inflight-request count are the obvious signals, but latency is often the better trigger — it reflects the thing users actually experience, and it captures downstream degradation (a slow database) that raw CPU on your service won't show. A common pattern is watching p99 latency or queue depth and starting to shed once either crosses a threshold, rather than waiting for CPU to pin at 100%, by which point you're already well into the death spiral.

## The part that's easy to skip: testing it

Load shedding logic that's never been exercised under real load is a hope, not a system. Load-test your shedding path specifically — verify that under 3x expected traffic, critical endpoints still succeed and low-priority ones degrade gracefully instead of the whole service falling over together. It's a cheap thing to add to a game day and a very expensive thing to discover is broken during a real spike.

## The takeaway

Load shedding won't make your bad day disappear, but it changes what a bad day looks like: from "the whole site is down" to "the recommendation carousel didn't load for twenty minutes." That's the entire game — degrading on purpose, on your terms, instead of collapsing by accident on the internet's terms.

If you don't have any admission control today, you don't need a fully priority-aware system to start. A blunt global concurrency cap in front of your busiest service, with fast rejection and a sane `Retry-After`, will already save you from your next traffic spike. Ship that first, then get fancy.
