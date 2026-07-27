---
title: "🎭 RESTful Is Not REST: A Vocabulary Fix Your APIs Desperately Need"
date: "2026-07-27"
excerpt: "You've been calling your JSON-over-HTTP CRUD endpoints 'RESTful' for years. So has everyone else. Roy Fielding would like a word — and understanding what he actually meant might change how you design your next API."
tags: ["api-design", "rest", "backend", "http"]
featured: true
---

Here's a fun bar trick for backend engineers: ask ten people to define REST, and at least seven will describe something that has nothing to do with REST.

"It's when you use nouns for URLs and HTTP verbs for actions." "It's JSON over HTTP." "It's not SOAP." "It's stateless, so... no sessions?" All of these are *adjacent* to REST. None of them are the thing itself. And the person who actually defined it — Roy Fielding, in his 2000 PhD dissertation — has spent two decades watching the industry build an entire vocabulary around a misunderstanding of his own work.

I'm not bringing this up to be pedantic (okay, a little bit to be pedantic). I'm bringing it up because the gap between "RESTful" and REST is exactly the gap where a lot of API design pain lives — brittle clients, endless versioning headaches, frontend teams that have to read backend source code to know what a response *might* contain next.

## What we actually built

Here's a completely typical "RESTful" endpoint. You've written a hundred of these:

```javascript
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  res.json({
    id: order.id,
    status: order.status,
    total: order.total,
    customerId: order.customerId,
  });
});
```

Clean, predictable, nouns-and-verbs, uses status codes correctly. By the common definition, this is RESTful. By Fielding's definition, it's barely REST at all — because the client that calls this endpoint has to already *know*, out-of-band, that a `pending` order can be cancelled via `DELETE /api/orders/:id`, or that a `shipped` order has a tracking endpoint at `/api/orders/:id/tracking`. None of that is discoverable from the response. It's tribal knowledge, baked into whatever frontend code or Postman collection someone wrote by reading your docs.

That out-of-band knowledge requirement is precisely what REST — the actual constraint set — was designed to eliminate.

## The constraint everyone skips: HATEOAS

Fielding's dissertation lays out a handful of architectural constraints (statelessness, cacheability, uniform interface, layered system...), and most APIs genuinely satisfy those. The one that gets dropped on the floor almost universally is **HATEOAS** — Hypermedia As The Engine Of Application State. The idea is that a response should tell the client what it can *do next*, the same way a web page's HTML tells a browser which links are clickable.

Here's the same order endpoint, but actually leaning into that constraint:

```javascript
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const links = { self: { href: `/api/orders/${order.id}` } };
  if (order.status === 'pending') {
    links.cancel = { href: `/api/orders/${order.id}`, method: 'DELETE' };
  }
  if (order.status === 'shipped') {
    links.track = { href: `/api/orders/${order.id}/tracking`, method: 'GET' };
  }

  res.json({ id: order.id, status: order.status, total: order.total, _links: links });
});
```

The response now *is* the state machine. A client doesn't need a wiki page explaining which actions are valid for which order status — it just checks whether `_links.cancel` exists. Change your business logic so cancellation also requires the order to be under $500? You update one `if` statement on the server, and every client — mobile app, web frontend, partner integration — picks up the new rule automatically, because none of them hardcoded the eligibility logic. This is the actual payoff of REST, and it's almost entirely orthogonal to whether your URLs use plural nouns.

## The Richardson Maturity Model, as a gut check

Leonard Richardson's maturity model is the cleanest way I've seen to locate where an API actually sits:

- **Level 0** — one URL, everything's a POST (basically RPC over HTTP, hi SOAP)
- **Level 1** — multiple resource URLs, still one HTTP verb for everything
- **Level 2** — proper URLs + proper HTTP verbs + status codes (this is where 95% of "RESTful" APIs live, including most of what I've shipped)
- **Level 3** — hypermedia controls, i.e. actual REST

Most of us are building excellent Level 2 APIs and calling them REST. That's fine! Level 2 is a legitimate, productive, well-understood design point — I'm not telling you to go bolt HATEOAS onto your internal CRUD service tonight. What I *am* saying is that the label matters when you're making design tradeoffs. If a teammate says "let's make this more RESTful" during a design review, it's worth a beat to ask: do we mean "use PATCH instead of a `/update` endpoint," or do we mean "stop hardcoding state-transition logic on the client"? Those are very different amounts of work, and only one of them is what Fielding was actually describing.

At Cubet, we settled on calling our internal style guide "resource-oriented HTTP APIs" instead of "REST APIs" specifically to sidestep this argument — nobody's dissertation gets misquoted in a naming meeting that way, and it's more honest about what the APIs actually do.

None of this is a call to retrofit hypermedia into every CRUD service you own. It's a call to be precise about what you're promising your API consumers, because vague vocabulary produces vague contracts, and vague contracts are how you end up with a frontend team that has three Slack threads pinned just to remember which endpoints support which verbs.

**Your homework**: pick one endpoint in your codebase you'd call "RESTful," and ask whether a brand-new client could figure out its valid next actions *from the response alone*. If the answer is no, that's not a crisis — but it is worth knowing exactly what you built.
