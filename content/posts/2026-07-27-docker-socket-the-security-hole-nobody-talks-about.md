---
title: "🕳️ The Docker Socket: The Root Shell You Mounted On Purpose"
date: "2026-07-27"
excerpt: "-v /var/run/docker.sock:/var/run/docker.sock is the most casually-copy-pasted line in every CI tutorial on the internet. It's also functionally a root grant to your host. Let's talk about why, and what to do instead."
tags: ["docker", "containers", "security", "devops", "ci-cd"]
featured: true
---

Go search GitHub for `docker.sock`. Go on, I'll wait. You'll find it mounted into build agents, monitoring sidecars, "Docker-in-Docker" workarounds, Portainer, Watchtower, half of every self-hosted CI tutorial ever written. It's the single most copy-pasted volume mount in the container ecosystem, and almost nobody stops to ask what they just did.

What they just did is hand out root on the host.

## The socket is not "just an API"

The mental model most engineers carry around is: "the Docker socket lets a container talk to the Docker daemon, so it can spin up sibling containers, that's neat." True, technically. But the Docker daemon runs as root, and the socket has no concept of "let this container do container things but not host things." If a process can talk to `/var/run/docker.sock`, it can ask the daemon to do *literally anything the daemon can do* — and the daemon can do anything root can do.

Here's the five-second proof. Assume you've got a container with the socket mounted in "just to check container status" or whatever the comment says:

```bash
docker run -it --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  docker:cli sh
```

Now, from *inside* that container, with no other privileges:

```bash
docker run -it --rm -v /:/host alpine chroot /host sh
```

That's it. That's the whole exploit. You just asked the daemon (which lives on the host, as root) to start a brand new container that mounts the *entire host filesystem* and chroots into it. You are now root on the host. Not root-in-a-namespace. Root. The container boundary didn't get bypassed — it was never actually there, because the socket was the front door the whole time.

## "But I trust the image" is not the threat model

The usual defense is "sure, but only my own tooling has access to the socket, I'm not running random images against it." That's the wrong threat model. The real question is: what happens when that *trusted* tool has a dependency vulnerability, a malicious plugin, a compromised CI job, or just a bug that lets an attacker control what command it runs?

I've seen this exact shape of incident play out with a Jenkins agent at a place I worked. The agent container had the socket mounted so build jobs could `docker build` and `docker push` without needing Docker-in-Docker's own can of worms. Totally reasonable-sounding call. Then a compromised third-party Jenkins plugin got pulled in during a routine update, and suddenly an "isolated" build job had a clean path to host root via the socket — no container escape technique required, no kernel exploit, just a plain Docker CLI command. The socket wasn't a side door. It was clearly labeled, unlocked, and load-bearing.

At Cubet, when we set up self-hosted GitHub Actions runners for image builds, this was the first thing we explicitly ruled out. If a workflow needs to build and push images, it doesn't get the host socket — full stop. The blast radius of "attacker controls a workflow step" versus "attacker controls the host" is not a gap we were willing to leave open just to save ourselves setting up a proper builder.

## What to actually do instead

You genuinely don't need the raw socket for 90% of the reasons people mount it. Pick based on what you're actually trying to do:

**Building images in CI** — use rootless, daemonless builders instead of talking to a privileged daemon at all:

```yaml
# buildkit's standalone builder, no daemon socket required
- uses: docker/setup-buildx-action@v3
  with:
    driver: docker-container
- uses: docker/build-push-action@v6
  with:
    push: true
    tags: myapp:latest
```

`buildkitd` can run rootless, and `docker/build-push-action` doesn't need your host's privileged socket to do it. Kaniko is another solid option if you're on Kubernetes and want zero daemon dependency at all.

**Monitoring / introspection tools that just need to *read* container state** — don't give them the socket, give them a scoped proxy. [Tecnativa's docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) sits between the tool and the real socket and lets you allowlist which API endpoints are reachable — read-only container listing, yes; `/containers/create`, no:

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1   # allow GET /containers
      POST: 0         # block all POST (create/start/exec/...)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

Now your monitoring sidecar can *see* containers and genuinely cannot spawn a chroot-the-host escape, because the daemon never accepts the request in the first place.

**Sibling builds you truly can't avoid** — if you must, at minimum run rootless Docker on the host so the daemon itself isn't root, and treat that socket-mounting container as equivalent in privilege to a host shell in every access control decision you make about it. Don't let it near secrets, don't let it run untrusted code, don't let a plugin ecosystem near it.

## The takeaway

`docker.sock` isn't a Docker API endpoint with some elevated permissions. It's root, wearing a trench coat, standing in your container labeled "API." Every time you mount it, ask the question you'd ask before giving something an SSH key to the host — because that's what you actually did.

Go grep your Dockerfiles, your `docker-compose.yml` files, and your CI configs for `docker.sock` right now. If you find one and can't immediately explain why it's *not* a socket-proxy or a rootless builder instead, that's your next ticket.
