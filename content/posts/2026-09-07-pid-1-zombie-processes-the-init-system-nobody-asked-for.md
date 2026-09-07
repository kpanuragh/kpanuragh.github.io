---
title: "🧟 PID 1 and Zombie Processes: The Init System Nobody Asked For"
date: "2026-09-07"
excerpt: "Your container hangs for 30 seconds on every deploy and nobody knows why. The answer is that your app is secretly running the most important job in the container - being PID 1 - and it has no idea what that job even is."
tags:
  - containers
  - docker
  - kubernetes
  - devops
  - linux
featured: true
---

# 🧟 PID 1 and Zombie Processes: The Init System Nobody Asked For

Every container you've ever shipped has a process running as PID 1. You almost certainly didn't choose it on purpose - it's just whatever your `CMD` or `ENTRYPOINT` happened to launch. Node, Python, a shell script, whatever. And that process, whether it asked for the job or not, inherited a set of kernel responsibilities that most application code has never heard of, doesn't implement, and will absolutely get wrong.

This is why your pod takes exactly 30 seconds to terminate on every single deploy. It's not a coincidence. It's a very specific, very fixable bug that lives at the intersection of "how Unix has worked since 1971" and "how nobody explains that to you when you write `FROM node:20-slim`."

## The two jobs PID 1 didn't apply for

On a normal Linux machine, PID 1 is `init` (or `systemd`, or `runit` - pick your flavor). It has two jobs that are boring right up until they're not:

**Job one: reap zombies.** When a process forks a child and the child exits, the child becomes a zombie - a dead process still holding a slot in the process table - until its parent calls `wait()` on it to collect the exit status. If the immediate parent has *also* died, the zombie gets reparented to PID 1, whose entire purpose in life is to call `wait()` on orphans nobody else wants. A real init system does this automatically. Your Node.js app does not, because nobody writes `require('wait-for-zombies')`.

**Job two: forward signals.** When Docker or Kubernetes wants to stop a container, it doesn't reach in and kill your app directly - it sends `SIGTERM` to PID 1 and expects PID 1 to do something sensible with it, like passing it along to whatever it's supervising. A real init system forwards signals. Your Node.js app, again, was not written with this in mind.

## Where this actually shows up

Here's a Dockerfile that looks completely normal:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["npm", "start"]
```

Run `docker stop` on that container and watch what happens. Docker sends `SIGTERM`, waits 10 seconds (the default grace period), gets no response, and sends `SIGKILL`. Every single time. A 10-second delay on every restart, every deploy, every `docker compose down`.

The reason is `npm start`. `npm` is not your app - it's a wrapper script that forks a *child* process to actually run your app, and `npm` itself does not forward `SIGTERM` to that child. PID 1 gets the signal, shrugs, and the real work keeps running underneath it, blissfully unaware anyone asked it to stop. Docker eventually gives up and kills the whole process tree with `SIGKILL`, which - fun fact - can't be caught, ignored, or cleaned up after. Any in-flight request, any buffered write, any "let me finish this transaction" logic in your shutdown handler never runs.

In Kubernetes this is the same bug wearing a nicer suit: `terminationGracePeriodSeconds` (default 30) ticks all the way down before the kubelet sends `SIGKILL`, which is exactly the "why does every rollout take 30 extra seconds" mystery that shows up in almost every cluster that's never had this explained.

## The fix is a 4KB binary, not a rewrite

You don't fix this by rewriting your app to implement init semantics. You fix it by not making your app PID 1 in the first place. `tini` is a tiny init process built for exactly this - it does signal forwarding and zombie reaping and nothing else:

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
```

Note the switch from `npm start` to `node server.js` directly too - cutting out the `npm` wrapper removes one extra layer that could eat a signal, and `tini` as real PID 1 forwards `SIGTERM` straight into `node`, which *does* know how to handle it if you've written a shutdown handler:

```js
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

If you don't want to add a package, Docker has had this built in since 18.02 - `docker run --init` injects `tini` as PID 1 for you without touching the Dockerfile. In Kubernetes there's no pod-level equivalent flag, so baking `tini` into the image (or using a base image that already includes it) is the portable answer. Also worth checking: exec form vs shell form for `CMD`/`ENTRYPOINT` matters here too. `CMD npm start` runs under `/bin/sh -c`, adding *another* process in the chain between PID 1 and your app; `CMD ["node", "server.js"]` (exec form, no shell) skips that layer entirely.

## The lesson that doesn't fit in a Dockerfile

At Cubet Techno Labs we chased a "why do canary rollouts take longer than they should" ticket for a service that, on paper, had nothing wrong with it - fast health checks, low traffic, no resource pressure. The actual cost was hiding in plain sight in `kubectl describe pod` output: every terminating pod sat in `Terminating` for the full grace period before finally dying, on every single rollout, multiplied across dozens of pods. It wasn't a Kubernetes problem or a resource problem. It was a shell wrapper eating a signal three process-forks away from the kernel, in a service nobody had touched in over a year. Adding `tini` and switching to exec-form `CMD` fixed it in about ten minutes once we knew to look for it - the hard part was knowing PID 1 was a thing that could be wrong at all.

The uncomfortable truth is that most of us never chose to write an init system, and most of our application code was never designed to be one. Check what's actually running as PID 1 in your containers - `docker top <container>` or `kubectl exec <pod> -- ps aux` will tell you in ten seconds - and if it's your app directly behind a shell or a wrapper script, you've probably got a few free seconds of deploy time sitting there waiting to be reclaimed.

Gone hunting for your own PID 1 and found something weird living there? I'd like to hear about it - find me wherever this blog is linked from.
