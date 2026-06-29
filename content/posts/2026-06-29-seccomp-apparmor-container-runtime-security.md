---
title: "🛡️ Seccomp and AppArmor: The Kernel-Level Bodyguards Your Containers Need"
date: "2026-06-29"
excerpt: "Your container isn't as isolated as you think. seccomp and AppArmor create a second wall between your app and the host kernel — here's how to actually use them before your next audit finds out you haven't."
tags: ["containers", "security", "seccomp", "apparmor", "kubernetes", "devops", "runtime-security"]
featured: true
---

Your container is not a VM. Everyone knows that — but most people stop at "shared kernel" and move on. The real implication is scarier: if your containerized app gets exploited, the attacker lands inside a process that has direct access to the same kernel your host OS is running on. Without additional protection, they can call any syscall the kernel exposes.

That's where seccomp and AppArmor come in. They've been in Linux for over a decade, they're supported by every major container runtime, and they're still criminally underused in production. Let me fix that.

## The Problem: Your Container Can Call *What*?

When your Node.js API is running in a container, it can technically invoke `ptrace()`, `mount()`, `reboot()`, and a bunch of other syscalls that have absolutely no business being available to a web server. If an attacker exploits your app, they might escalate by calling one of those directly.

This is how container escapes happen. The attack surface is the kernel — and by default, you're leaving most of it exposed.

First, check what your containers are actually running:

```bash
docker inspect --format='{{.HostConfig.SecurityOpt}}' my-container
# [] means no custom profile — you're on Docker's default, or nothing at all
```

If that returns empty brackets on your production workloads, keep reading.

## Seccomp: The Syscall Bouncer

seccomp (Secure Computing Mode) lets you define an allowlist of syscalls a process is permitted to make. Docker ships a default seccomp profile that blocks ~44 dangerous syscalls, but "default" varies by runtime version and is not a substitute for per-application hardening.

A minimal seccomp profile for a typical web service looks like this:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "open", "openat", "close", "stat", "fstat",
        "mmap", "mprotect", "munmap", "brk", "rt_sigaction",
        "rt_sigprocmask", "rt_sigreturn", "ioctl", "select", "dup",
        "dup2", "nanosleep", "getpid", "socket", "connect", "accept",
        "sendto", "recvfrom", "sendmsg", "recvmsg", "shutdown",
        "bind", "listen", "getsockname", "getpeername", "setsockopt",
        "getsockopt", "clone", "fork", "execve", "exit", "wait4",
        "kill", "uname", "fcntl", "flock", "fsync", "getcwd",
        "chdir", "rename", "mkdir", "rmdir", "unlink", "readlink",
        "gettimeofday", "getuid", "getgid", "geteuid", "getegid",
        "futex", "clock_gettime", "clock_nanosleep", "exit_group",
        "epoll_wait", "epoll_ctl", "epoll_create1", "getdents64",
        "newfstatat", "getrandom", "accept4", "pipe2", "prlimit64",
        "set_robust_list", "get_robust_list", "sched_yield"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

Apply it via Docker:

```bash
docker run --security-opt seccomp=./web-seccomp.json my-image
```

In Kubernetes, seccomp profiles have been stable since 1.19 and are stupidly easy to enable:

```yaml
apiVersion: v1
kind: Pod
spec:
  securityContext:
    seccompProfile:
      type: RuntimeDefault   # container runtime's built-in profile
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        runAsNonRoot: true
        readOnlyRootFilesystem: true
```

`RuntimeDefault` gets you the runtime's built-in profile (equivalent to Docker's default). For tighter control, use `Localhost` and reference a custom profile dropped onto every node. For most services, `RuntimeDefault` is a meaningful improvement over nothing and costs you zero effort.

## AppArmor: The Path and Capability Watchdog

seccomp filters *which syscalls* can be called. AppArmor works at a higher level — it restricts *which files and network resources* can be accessed, enforced via Mandatory Access Control (MAC). Think of them as complementary layers: seccomp is the API surface guard, AppArmor is the resource access guard.

A practical AppArmor profile for a web server container:

```
#include <tunables/global>

profile my-webapp flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  # Allow outbound TCP/UDP (the app talks to a database)
  network inet tcp,
  network inet udp,

  # Read the app bundle, write only to /tmp
  /app/**        r,
  /app/server    ix,
  /tmp/**        rw,

  # Process info needed by health checks
  /proc/*/status r,

  # Hard denials — these should never be needed
  deny /etc/shadow   r,
  deny /proc/sysrq-trigger rw,
  deny /sys/**       rw,
}
```

Load it on the host node:

```bash
apparmor_parser -r -W /etc/apparmor.d/my-webapp
```

Wire it up in Kubernetes via annotation:

```yaml
metadata:
  annotations:
    container.apparmor.security.beta.kubernetes.io/app: localhost/my-webapp
```

The key AppArmor workflow: start in **complain mode** (`flags=(complain)`), run your app under real load, and watch `/var/log/audit/audit.log` for violations. Once the profile captures everything your app legitimately needs, switch to **enforce mode**. Don't try to write the profile from scratch — let the runtime tell you what the app actually does.

## What Happened When We Actually Ran This

At Cubet, we had a Node.js microservice that needed to pass a PCI-DSS compliance audit. The security report came back with two findings: the container was running Docker's default seccomp profile (not a custom one), and AppArmor was set to `unconfined`.

`Unconfined` is the worst possible answer on a compliance audit. AppArmor is installed, actively doing nothing.

We ran the service for two hours in AppArmor complain mode against our staging load tests, captured the access log, and built a profile from actual observed behaviour. The final profile denied access to 96% of the filesystem, blocked raw socket creation entirely, and added an explicit `deny` on `/proc/sysrq-trigger` just to make the auditor happy.

The client passed. The service still works perfectly. No one noticed any change in behaviour because there was none — the profile only locked out things the app was never doing anyway. That's the whole point.

## Tooling That Actually Helps

Don't guess which syscalls your app needs. Profile first:

- **`strace -f -e trace=all`** — capture live syscalls in dev or staging. Noisy but thorough.
- **`bpftrace`** — eBPF-based tracing, low overhead, production-safe if you're careful.
- **AppArmor complain mode** — logs violations without blocking. Essential for writing profiles.
- **KubeArmor** — a Kubernetes-native runtime security engine built on eBPF that enforces seccomp/AppArmor-style policies without per-node profile file management. Worth evaluating if you run many clusters.

For auditing existing clusters, `kubectl get pods -A -o json | jq` for `seccompProfile` and AppArmor annotations will show you exactly how many pods are running unconfined. Spoiler: it's usually most of them.

## The Objections, Addressed

**"We already run as non-root."** Non-root processes can still call `setns()`, `perf_event_open()`, and other syscalls that enable privilege escalation. Non-root is necessary but not sufficient.

**"Our runtime handles this."** The runtime default profile blocks the worst offenders, but it's not application-aware. A profile tuned to your specific service is categorically better.

**"We'll add this later."** Later is how you fail an audit. `seccompProfile.type: RuntimeDefault` is literally one line. Add it now, improve it later.

## Your Action Plan

1. **Audit today.** `docker inspect` your production containers and `kubectl get pods` for missing seccomp profiles. Measure the gap first.
2. **Add `RuntimeDefault` to every pod spec.** One line. Stable since Kubernetes 1.19. No excuses.
3. **Profile your sensitive services in AppArmor complain mode.** Graduate to enforce for anything touching payment data, credentials, or customer PII.
4. **Add seccomp + AppArmor checks to your security review checklist.** These are the first thing a serious auditor will look at.

The kernel is the most powerful resource in the room. Give your containers the minimum access they need to do their job — nothing more. seccomp and AppArmor are how you enforce that. They've been sitting there in Linux, waiting for you to use them.

Time to stop waiting.
