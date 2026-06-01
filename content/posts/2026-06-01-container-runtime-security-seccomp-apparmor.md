---
title: "🔒 Container Runtime Security: seccomp and AppArmor Are Your Last Line of Defence"
date: "2026-06-01"
excerpt: "Your container image is clean, your Dockerfile is minimal, and your CVE scanner is green — but your running container can still make 300+ syscalls the kernel will happily honour. seccomp and AppArmor are the unglamorous locks on the door everyone forgets to install."
tags:
  - containers
  - security
  - seccomp
  - apparmor
  - devops
  - linux
featured: true
---

Here's a fun thought experiment: imagine you've done everything right. Distroless base image. No root user. Image scanning in CI. Secrets out of the Dockerfile. You ship it, you pat yourself on the back, and your container goes live.

Then someone exploits a zero-day in your application and gets a shell. What happens next?

If you haven't configured **seccomp** or **AppArmor**, the answer is: quite a lot of bad things. Because now they have access to every syscall the Linux kernel offers — `ptrace`, `mount`, `unshare`, `clone` — the full buffet of container-escape techniques. Your hardened image didn't help. The blast radius is the entire host.

Runtime syscall filtering is the part of container security that almost nobody talks about because it's invisible when it works and catastrophic when it doesn't.

---

## What Are We Actually Talking About?

**seccomp** (Secure Computing Mode) is a Linux kernel feature that lets you define an allowlist (or denylist) of syscalls a process is permitted to make. Anything outside that list? The kernel kills the process or returns an error — before the syscall even executes.

**AppArmor** is a Linux Security Module that enforces mandatory access control via *profiles*. Where seccomp cares about *what operations* (syscalls) a process can invoke, AppArmor cares about *what resources* it can touch — files, network sockets, capabilities.

Together they form a defence-in-depth layer that lives at the OS level, *outside* your application code. No library, no runtime, no language runtime can bypass them.

Docker and containerd both ship a **default seccomp profile** that blocks ~44 dangerous syscalls — things like `ptrace`, `reboot`, `kexec_load`. That default is decent. The problem is most people assume it's enough and never go further.

It isn't.

---

## Writing a Custom seccomp Profile

The default profile allows `strace` to attach to your process. It allows `unshare`. For a production Node.js API, you need roughly 60-80 syscalls. The default allowlist permits ~300.

Here's a minimal seccomp profile for a Node.js HTTP server:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64", "SCMP_ARCH_AARCH64"],
  "syscalls": [
    {
      "names": [
        "accept4", "bind", "brk", "clone", "close", "connect",
        "epoll_create1", "epoll_ctl", "epoll_wait", "execve",
        "exit_group", "fcntl", "fstat", "futex", "getdents64",
        "getpid", "gettid", "gettimeofday", "listen", "mmap",
        "mprotect", "munmap", "nanosleep", "openat", "pipe2",
        "poll", "read", "recvfrom", "recvmsg", "rt_sigaction",
        "rt_sigprocmask", "rt_sigreturn", "sendmsg", "sendto",
        "set_robust_list", "setsockopt", "socket", "stat",
        "uname", "write", "writev"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

Apply it in Docker:

```bash
docker run \
  --security-opt seccomp=./node-api-seccomp.json \
  my-api:latest
```

Or in a Kubernetes pod spec:

```yaml
apiVersion: v1
kind: Pod
spec:
  securityContext:
    seccompProfile:
      type: Localhost
      localhostProfile: profiles/node-api-seccomp.json
  containers:
    - name: api
      image: my-api:latest
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        runAsNonRoot: true
        runAsUser: 1000
```

**How do you figure out what syscalls your app actually needs?** Run the container with `strace -f -e trace=all` in a dev environment and filter the output. Or — and this is what we do at Cubet for anything security-sensitive — use `seccomp-bpf` in log mode first, let the app run through its full startup and request cycle, then tighten based on what was logged.

---

## AppArmor Profiles: Locking Down the Filesystem

seccomp is syscall-level. AppArmor is resource-level. They complement each other.

A simple AppArmor profile for the same Node.js API:

```
#include <tunables/global>

profile node-api flags=(attach_disconnected) {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  # Node.js binary and libraries
  /usr/local/bin/node ix,
  /usr/local/lib/node_modules/** r,

  # App files — read only
  /app/** r,
  /app/node_modules/** r,

  # Writable tmp for Node internals
  /tmp/** rw,

  # Deny everything else by default
  deny /etc/shadow r,
  deny /proc/*/mem rw,
  deny @{HOME}/.ssh/** rw,

  # Networking allowed
  network inet stream,
  network inet6 stream,
}
```

Load and apply it:

```bash
# On the host
sudo apparmor_parser -r -W ./node-api-apparmor
sudo aa-status  # verify it loaded

# Docker
docker run \
  --security-opt apparmor=node-api \
  my-api:latest
```

Now even if an attacker gets code execution inside your container, they can't read `/etc/shadow`, can't traverse `/proc` for memory inspection, and can't touch your SSH keys. The profile denies it at the kernel level before the filesystem call completes.

---

## The Part Everyone Skips: Auditing Before Enforcing

The worst thing you can do is slap a restrictive profile on a production container cold and hope for the best. Your app will crash and you'll spend three hours reading cryptic kernel logs.

Do it in stages:

1. **Complain mode first** — AppArmor has a `flags=(complain)` mode that logs violations without blocking. Run your full integration test suite through it. Same with seccomp's `SCMP_ACT_LOG` action instead of `SCMP_ACT_ERRNO`.

2. **Collect and refine** — `/var/log/audit/audit.log` (auditd) or `journalctl -k | grep apparmor` will show every denied access that *would have* been blocked. Add them to your allowlist.

3. **Switch to enforce** — Once your test suite + a canary deploy runs clean, switch to enforce mode.

This cycle took us about a day per service the first time. Now it's a template — we've done it across a dozen containers at Cubet and the effort has dropped to an afternoon.

---

## Kubernetes: The OPA and PSA Angle

If you're running Kubernetes, there are two more layers worth knowing:

- **Pod Security Admission (PSA)** — the `restricted` baseline enforces `seccompProfile.type: RuntimeDefault` automatically. If you're not on `restricted` namespace labels, you're opting out of a free baseline.
- **OPA/Gatekeeper** — you can write policies that *require* a seccomp profile or AppArmor annotation before a pod is admitted. This turns profile enforcement from a suggestion into a guardrail.

The `RuntimeDefault` seccomp profile (previously `runtime/default`) is containerd/Docker's built-in default. It's better than nothing. A custom `Localhost` profile is better still.

---

## The Honest Tradeoff

Yes, this adds operational complexity. You need to maintain profiles. New library versions sometimes invoke new syscalls and your container dies mysteriously in the next deploy until you update the profile. That's a real cost.

But compare it to the cost of a container escape. A compromised container with no seccomp/AppArmor can enumerate the host's processes, access the cloud metadata endpoint, pivot to other containers, and exfiltrate secrets from `/proc`. The $20/hour ops time to maintain a seccomp profile is a bargain against that outcome.

The default Docker profile covers the obvious attacks. Custom profiles cover the non-obvious ones. AppArmor covers what seccomp misses.

None of this is hard. It's just the part everyone deprioritises until the postmortem.

---

## Where to Start

1. Check if your pods use `RuntimeDefault` — `kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.securityContext.seccompProfile}{"\n"}{end}'`
2. If they don't, add `seccompProfile: { type: RuntimeDefault }` to your pod security context today. No custom profile needed yet.
3. For any internet-facing service, spend a day building a custom seccomp profile using `strace` + log mode.
4. Add AppArmor for anything that handles user data or has filesystem access.

Your scanner can't see what the kernel will allow at runtime. seccomp and AppArmor can.

Lock the door.
