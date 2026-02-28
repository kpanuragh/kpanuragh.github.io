---
title: "Kubernetes NetworkPolicy: Stop Your Pods From Talking to Strangers 🔒🚦"
date: "2026-02-28"
excerpt: "By default every pod in your cluster can talk to every other pod. That's basically leaving every door in your office unlocked. After running production Kubernetes clusters I learned that NetworkPolicy is the firewall you absolutely need but nobody tells you about!"
tags: ["kubernetes", "devops", "security", "networking", "containers"]
featured: true
---

# Kubernetes NetworkPolicy: Stop Your Pods From Talking to Strangers 🔒🚦

**True story:** I once ran a Kubernetes cluster where the marketing analytics pod could freely open a TCP connection to the payments database. They were in the same namespace, same cluster, zero restrictions. Nothing was exploiting it — but if any one of our dozens of pods got compromised, an attacker had a clear shot at everything.

That's the dirty secret of Kubernetes out of the box:

> **Every pod can talk to every other pod. Always. Without asking permission.**

It's like building an office building and making every single door in every single room always unlocked, then being surprised when someone walks into the server room looking for the bathroom. 🚪😅

Welcome to **NetworkPolicy** — the Kubernetes feature that's been there since v1.3 but somehow never makes it into "Getting Started" tutorials.

## The Problem: Your Cluster Is a Flat, Open Network 🌐

By default, Kubernetes uses a flat network model. Every pod gets an IP, and every pod can reach every other IP in the cluster. This means:

- Your **frontend** pods can directly query your **Postgres database**
- Your **logging sidecar** can hit your **internal admin API**
- A compromised **image processing worker** can probe your **payment service**

```bash
# Proof: from any pod, you can reach any other pod
kubectl exec -it frontend-pod -- curl http://payments-service:8080/admin/users

# 200 OK
# {"users": [...]}  ← 💀 That should NOT be accessible from the frontend!
```

An attacker who gets code execution in your least-privileged pod now has a springboard to your most sensitive services. NetworkPolicy is the fix.

## NetworkPolicy 101: Kubernetes Firewalls for Pods 🧱

A NetworkPolicy is just a YAML file that says "these pods can only receive traffic from these sources, and can only send traffic to these destinations."

**The mental model:**
- **No NetworkPolicy** = pod has no firewall, all traffic allowed
- **At least one NetworkPolicy selects a pod** = that pod is now in "default deny" mode for the traffic types the policy covers
- You then **explicitly allow** what's needed

**Important:** NetworkPolicy requires a compatible CNI plugin. Calico, Cilium, and Weave Net support it. Flannel by default does NOT. Check your CNI before expecting this to work!

```bash
# Check what CNI you're using
kubectl get pods -n kube-system | grep -E 'calico|cilium|weave|flannel'
```

## Your First NetworkPolicy: Lock Down the Database 🔐

This is the most important policy you'll ever write. Your database should only accept connections from your app servers. Full stop.

```yaml
# database-networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-lockdown
  namespace: production
spec:
  # Apply this policy to pods with this label
  podSelector:
    matchLabels:
      app: postgres

  # This policy controls incoming traffic (ingress)
  policyTypes:
    - Ingress

  ingress:
    # ONLY allow traffic from pods labeled app=backend
    - from:
        - podSelector:
            matchLabels:
              app: backend
      ports:
        - protocol: TCP
          port: 5432

# What this does:
# ✅ backend pods can connect to postgres on 5432
# ❌ frontend pods CANNOT connect to postgres
# ❌ analytics pods CANNOT connect to postgres
# ❌ Any other pod CANNOT connect to postgres
# ❌ Even cluster admins can't accidentally query prod DB from a debug pod!
```

Apply it:

```bash
kubectl apply -f database-networkpolicy.yaml

# Verify it's working
kubectl exec -it frontend-pod -- nc -zv postgres-service 5432
# Connection refused ← ✅ Policy is working!

kubectl exec -it backend-pod -- nc -zv postgres-service 5432
# Connection succeeded ← ✅ Backend still works!
```

The moment I applied this in production, I found THREE services that were directly querying the database from pods that absolutely should not have been. NetworkPolicy didn't just add security — it exposed architecture problems. 🎯

## The "Default Deny All" Pattern: Start Strict, Open What You Need 🚫

The best practice is to start with a policy that denies everything in a namespace, then selectively open ports.

```yaml
# default-deny-all.yaml
# Apply this FIRST in every namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}  # Selects ALL pods in the namespace
  policyTypes:
    - Ingress
    - Egress
  # No ingress/egress rules = deny everything!
```

Now NOTHING can talk to anything. Then add policies for what's actually needed:

```yaml
# allow-backend-to-db.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-postgres
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Egress
  egress:
    # Allow backend to talk to postgres
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    # Allow backend to use DNS (without this, nothing works!)
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
```

**The DNS gotcha that bit me hard:** When you lock down egress, you MUST explicitly allow port 53/UDP for DNS. Otherwise your pods can't resolve service names and everything breaks in the most confusing way possible. I spent 2 hours debugging why my backend couldn't reach `postgres-service` — it couldn't resolve the hostname. 🤦

## Namespace Isolation: Separate Dev From Prod 🏗️

Here's a scenario I've seen cause real incidents: a developer is debugging their app in the `staging` namespace and accidentally points it at the `production` database (wrong env var). With NetworkPolicy, you can prevent cross-namespace traffic by default.

```yaml
# isolate-namespace.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-namespace
  namespace: staging
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Only allow traffic from within the same namespace
    - from:
        - podSelector: {}  # Any pod in THIS namespace
  egress:
    # Only allow traffic to within the same namespace
    - to:
        - podSelector: {}
    # Plus DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53

# Staging pods can ONLY talk to other staging pods.
# They CANNOT accidentally reach production services.
```

Combined with namespace labels, you can also create policies that allow specific cross-namespace traffic:

```yaml
# Allow monitoring to scrape metrics from all namespaces
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scraping
  namespace: production
spec:
  podSelector: {}  # All pods
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
        - podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 9090
        - protocol: TCP
          port: 8080  # Common metrics port
```

## Real-World Production Architecture 🏭

Here's what a complete NetworkPolicy setup looks like for a typical three-tier web app:

```yaml
# Tier 1: Frontend can only receive external traffic and talk to backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: frontend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from: []  # Allow from anywhere (ingress controller handles the real restriction)
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              tier: backend
      ports:
        - protocol: TCP
          port: 8080
    - to: {}  # DNS
      ports:
        - protocol: UDP
          port: 53
---
# Tier 2: Backend can receive from frontend and talk to database
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: backend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: frontend
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              tier: database
      ports:
        - protocol: TCP
          port: 5432
    - to: {}
      ports:
        - protocol: UDP
          port: 53
---
# Tier 3: Database only receives from backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: database
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: backend
      ports:
        - protocol: TCP
          port: 5432
```

This is the pattern I use in every production cluster. Frontend → Backend → Database, with hard walls between each tier. If any pod gets compromised, the blast radius is contained to that tier. 🎯

## Common Mistakes I've Made So You Don't Have To 😅

**Mistake #1: Forgetting DNS egress**
Applied a strict egress policy, everything broke, spent 2 hours debugging. Always allow port 53 UDP (and sometimes TCP for large DNS responses).

**Mistake #2: Applying default-deny before writing allow rules**
Applied `default-deny-all` to production namespace on a Friday at 4pm. Everything stopped working. Users noticed immediately. Had to roll back in a panic. **Always write your allow rules first, then apply the deny.**

**Mistake #3: Not testing with `kubectl exec`**
You MUST test policies manually. Use `kubectl exec` to get a shell in the pods and actually try to connect to things. Don't assume the YAML is correct — verify it.

```bash
# Test toolkit: run a temporary debug pod
kubectl run nettest --image=busybox --rm -it --restart=Never -- sh

# From inside the pod, test connectivity
wget -qO- http://backend-service:8080/health  # Should work or fail based on policy
nc -zv postgres-service 5432                   # Test TCP connectivity
nslookup kubernetes.default                    # Test DNS
```

**Mistake #4: Thinking NetworkPolicy is enough**
NetworkPolicy controls which pods can talk to which pods at the network level. It does NOT control what those pods do once they're connected. You still need proper authentication, authorization, and input validation in your application code. NetworkPolicy is one layer of defense, not the whole stack.

## The Bottom Line 💡

NetworkPolicy is one of those features that feels like overkill until the day you desperately wish you had it. By that point, it's too late.

The good news: adding NetworkPolicy to an existing cluster is non-disruptive if you do it right (write allows first, then deny). The bad news: most teams running Kubernetes in production have zero NetworkPolicies, which means their cluster's security posture is basically "hope nothing gets compromised."

**Start with three policies:**
1. Default deny-all in production namespace
2. Allow only the specific pod-to-pod connections you need
3. Always allow DNS egress

Your future self (dealing with a security incident at 3am) will thank you.

## Your Action Plan 🚀

**Today:**
1. Check if your CNI supports NetworkPolicy: `kubectl get pods -n kube-system`
2. List existing NetworkPolicies: `kubectl get networkpolicies -A`
3. If the list is empty — you're wide open. Start fixing that!

**This week:**
1. Write a default-deny policy for your most sensitive namespace
2. Map out which pods actually need to talk to each other
3. Write explicit allow policies for each allowed connection
4. Test with `kubectl exec` — trust, but verify

**This month:**
1. Roll out NetworkPolicy to all production namespaces
2. Consider Cilium for advanced L7 policies (filter by HTTP path, not just port)
3. Add policy auditing to your CI/CD pipeline
4. Document your network topology — now that it's enforced, you finally know what it is!

---

**Realized your cluster is completely open?** You're not alone — most are. Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk about locking things down without breaking them.

**Want to go deeper?** Check out [Cilium](https://cilium.io/) for Layer 7 NetworkPolicy (yes, you can write policies that allow `GET /health` but deny `DELETE /admin`) — it's wild what modern CNIs can do.

*Now go lock those pod-to-pod connections down — your future security audit will be much happier for it.* 🔒🚀

---

**P.S.** If you're on a managed Kubernetes service (EKS, GKE, AKS), NetworkPolicy is supported by default with the right CNI addon. On EKS: enable VPC CNI policy enforcement. On GKE: use Dataplane V2. On AKS: use Azure CNI. No excuses — the feature is there, you just have to turn it on! 🎯
