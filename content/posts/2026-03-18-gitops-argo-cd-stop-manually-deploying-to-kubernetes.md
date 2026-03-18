---
title: "GitOps & Argo CD: Stop Manually Deploying to Kubernetes Like It's 2015 🚀🔄"
date: "2026-03-18"
excerpt: "After years of ssh-ing into servers and running kubectl apply like a caveman, I discovered GitOps and Argo CD. Now my Git repo IS my deployment pipeline, and I haven't manually touched a cluster in months. Here's how it works!"
tags: ["devops", "kubernetes", "gitops", "ci-cd", "deployment"]
featured: true
---

# GitOps & Argo CD: Stop Manually Deploying to Kubernetes Like It's 2015 🚀🔄

**Honest confession:** For the first two years of running Kubernetes in production, my deployment workflow looked like this:

```bash
kubectl apply -f deployment.yaml
# 🤞 pray
# check pods
kubectl get pods
# one is CrashLoopBackOff
# 😭 ssh into the cluster, start guessing
```

My teammates called it "creative deployment." I called it "controlled chaos." My manager called it "a lawsuit waiting to happen."

Then I discovered **GitOps** and specifically **Argo CD**. Now Git is the source of truth, deployments happen automatically when I push code, and I can sleep at night without setting three alarms to check if the 2 AM deployment succeeded.

Let me show you how to stop deploying like it's 2015.

## What Even Is GitOps? 🤔

GitOps is a simple (but brilliant) idea:

**Traditional deployment:**
```
Developer → runs kubectl → Cluster changes
(No audit trail, no rollback, pray it works!)
```

**GitOps:**
```
Developer → Git push → Argo CD detects change → Cluster syncs
(Full audit trail, instant rollback = git revert, always consistent!)
```

Your Git repo becomes the **single source of truth** for your cluster state. If it's not in Git, it doesn't exist. If it's in Git, it WILL be deployed.

**The mental model:** Git is your cluster's desired state. Argo CD is the bouncer that makes reality match the wish list. 🎯

## The Horror Story That Converted Me 💀

**2023, Friday 4:30 PM (of course it was Friday):**

We had just gotten approval to deploy a "quick config change" to production. Three of us were on the call:

```bash
# Dev #1 runs:
kubectl apply -f config-staging.yaml  # WRONG FILE! 😱

# Dev #2 at the same time runs:
kubectl set image deployment/api api=myapp:v2.1.0  # Unrelated change!

# Me running:
kubectl apply -f deployment-prod.yaml  # The right one, but too late!

# Result:
# 💥 Wrong config + wrong image version + right deployment
# 🔥 Production down for 2 hours
# 👀 Three engineers with zero audit trail of who did what
# 😬 "Someone changed something" — the DevOps blame game
```

**With GitOps**, this literally cannot happen:
- Every change goes through a PR
- Every deployment is a commit
- Every rollback is a `git revert`
- Every audit log is just `git log`

We adopted Argo CD the following Monday. I'm not exaggerating.

## Installing Argo CD: Faster Than You Think ⚡

```bash
# Create the namespace
kubectl create namespace argocd

# Install Argo CD
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for it to be ready
kubectl wait --for=condition=available \
  --timeout=300s \
  deployment/argocd-server \
  -n argocd

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Access the UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080
# Username: admin
# Password: (from above command)
```

**Total time:** About 5 minutes. Coffee isn't even done brewing yet. ☕

## Your First Argo CD Application 🎯

Let's say you have a repo with your Kubernetes manifests. Here's the structure:

```
my-app/
├── k8s/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── configmap.yaml
└── src/
    └── ... (your app code)
```

**Option 1: Using the Argo CD UI (click-ops, just this once!)**

Go to https://localhost:8080, click "+ NEW APP", and fill in:
- App name: `my-app`
- Project: `default`
- Sync policy: `Automatic`
- Repository URL: `https://github.com/yourorg/my-app`
- Path: `k8s/`
- Cluster: `https://kubernetes.default.svc`
- Namespace: `production`

Click **CREATE**. Done. Argo CD will now watch that path forever. 👀

**Option 2: Using YAML (the GitOps way, naturally):**

```yaml
# argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default

  source:
    repoURL: https://github.com/yourorg/my-app
    targetRevision: HEAD
    path: k8s/

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true      # Delete resources removed from Git
      selfHeal: true   # Fix manual kubectl changes automatically!
    syncOptions:
      - CreateNamespace=true
```

```bash
kubectl apply -f argocd-app.yaml
```

**That's it.** Now every time you push to main, Argo CD syncs within 3 minutes. Push a bad commit? `git revert`. Emergency rollback complete in 30 seconds. 🎉

## The `selfHeal: true` Setting (My Favorite Feature) 🛡️

Here's the thing about Kubernetes teams: someone WILL manually `kubectl apply` something at 2 AM during an incident. Then forget to document it. Then the Git state and the cluster state diverge and nobody knows why things are different.

`selfHeal: true` means Argo CD will **automatically revert** any manual changes that don't match Git.

```bash
# Watch this magic trick:
# Git has replicas: 3

# Someone panics and runs:
kubectl scale deployment/my-app --replicas=10

# Argo CD in 3 minutes:
# "This doesn't match Git. Reverting to 3."
# *scales back to 3*

# Lesson: Git is the boss. Always.
```

**A moment of real talk:** This felt terrifying at first. What if I NEED to make a manual change during an incident? The answer is: make a PR, merge it fast, let Argo CD apply it. It takes 90 seconds. The discipline is the point.

## Real-World Setup: Multi-Environment GitOps 🌍

This is the pattern I use for every project now:

```
infrastructure-repo/
├── base/                    # Shared configs
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
├── overlays/
│   ├── staging/             # Staging-specific overrides
│   │   ├── kustomization.yaml
│   │   └── patch-replicas.yaml
│   └── production/          # Prod-specific overrides
│       ├── kustomization.yaml
│       └── patch-replicas.yaml
└── argocd/
    ├── staging-app.yaml
    └── production-app.yaml
```

**base/deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: myorg/my-app:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

**overlays/production/kustomization.yaml:**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

patches:
  - path: patch-replicas.yaml

images:
  - name: myorg/my-app
    newTag: v1.5.0   # Pin specific version in prod!
```

**overlays/production/patch-replicas.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 5   # Prod gets 5 replicas, staging gets 1
```

**argocd/production-app.yaml:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/infrastructure
    targetRevision: HEAD
    path: overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**The CI/CD pipeline now looks like:**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: myorg/infrastructure
          token: ${{ secrets.INFRA_TOKEN }}

      - name: Update image tag
        run: |
          cd overlays/production
          # Update the image tag to the new SHA
          kustomize edit set image myorg/my-app=myorg/my-app:${{ github.sha }}

      - name: Commit and push
        run: |
          git config user.email "ci@myorg.com"
          git config user.name "GitHub Actions"
          git add .
          git commit -m "deploy: update my-app to ${{ github.sha }}"
          git push

# Argo CD sees the infra repo change → auto-syncs → done! 🎉
```

**A CI/CD pipeline that saved our team:** The app repo and the infrastructure repo are separate. App devs don't need cluster access. The pipeline is just "commit the new tag to Git." Clean, auditable, beautiful. 😍

## Argo CD ApplicationSets: One Config, Many Apps 🎛️

After countless deployments of the same Argo CD application pattern for different microservices, I discovered **ApplicationSets** — the "stop copying and pasting" feature.

```yaml
# One ApplicationSet to rule them all
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: microservices
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - service: api-gateway
            namespace: production
          - service: auth-service
            namespace: production
          - service: payment-service
            namespace: production
          - service: notification-service
            namespace: production
  template:
    metadata:
      name: '{{service}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/infrastructure
        targetRevision: HEAD
        path: 'services/{{service}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

**Before ApplicationSets:** 4 YAML files, copy-pasted, all slightly different, guaranteed to drift.

**After ApplicationSets:** 1 YAML file, parameterized, consistent. Add a new microservice? Add one line to the `elements` list. 🎯

## Rollbacks: The Feature That Justifies Everything ⏪

Traditional rollback:
```bash
# What was the previous image tag? 🤷
# Check Slack messages...
# Check the wiki...
# Ask the person who deployed it...
# "I think it was v1.4.2?"
kubectl set image deployment/my-app my-app=myorg/my-app:v1.4.2
# 🙏 please work
```

GitOps rollback:
```bash
# The previous deployment commit is right here in Git history
git log --oneline
# abc1234 deploy: update my-app to v1.5.0  ← broke production
# def5678 deploy: update my-app to v1.4.2  ← last known good

git revert abc1234
git push
# Argo CD syncs in 3 minutes ← production restored
```

**After countless deployments**, I can say with confidence: `git revert` is the fastest, most reliable rollback mechanism in existence. No guessing. No tribal knowledge. Just Git history.

## Common Pitfalls (Learned Painfully) 🪤

### Pitfall #1: Putting Secrets in Git

```yaml
# BAD! Never do this!
# configmap.yaml
apiVersion: v1
kind: ConfigMap
data:
  DATABASE_URL: "postgres://user:my_actual_password@prod-db:5432/app"
```

**The right way:** Use Sealed Secrets or External Secrets Operator:

```bash
# Install Sealed Secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal your secret (safe to commit!)
echo -n "my_actual_password" | kubeseal \
  --raw \
  --namespace production \
  --name db-secret \
  --scope namespace-wide
# Returns encrypted blob safe for Git ✅
```

**Docker taught me the hard way** that secrets in Dockerfiles get baked into image layers. Argo CD taught me the sequel: secrets in Git repos get baked into audit logs. Use External Secrets. Always.

### Pitfall #2: Not Setting Resource Limits

```yaml
# BAD: No limits = one pod can eat the whole cluster!
containers:
  - name: my-app
    image: myorg/my-app:v1.5.0

# GOOD: Always set limits!
containers:
  - name: my-app
    image: myorg/my-app:v1.5.0
    resources:
      requests:
        memory: "256Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
```

Without limits, I once had a memory leak in production that OOM-killed half the cluster. With GitOps, at least the fix was a one-line PR.

### Pitfall #3: Auto-Sync in Production Without Health Checks

```yaml
# BAD: Auto-sync without health validation
syncPolicy:
  automated:
    prune: true

# GOOD: Let Argo CD validate health before marking sync successful
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - RespectIgnoreDifferences=true
```

Add proper health checks to your deployments:

```yaml
spec:
  template:
    spec:
      containers:
        - name: my-app
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

**Argo CD will wait for readiness before marking a sync "Healthy."** If the new pods don't become ready, it shows the sync as "Degraded" and leaves the old pods running. Built-in zero-downtime deployments! 🎉

## Before vs. After: Real Numbers 📊

Here's what switching to GitOps with Argo CD actually looked like for our team:

| Metric | Before GitOps | After GitOps |
|--------|---------------|--------------|
| Deployment frequency | 2-3x/week (scary) | 10-15x/week (normal) |
| Deployment time | 20-30 minutes | 3-5 minutes |
| Rollback time | 15-30 minutes | 2-3 minutes |
| Production incidents from deploys | 2-3/month | 0-1/month |
| "Who changed that?" Slack messages | Daily | Never |
| Friday deploy fear | 😱😱😱 | 😊 |

**The Friday deploy fear stat is 100% real.** We used to have an unwritten rule: no deploys after 3 PM on Fridays. Now we deploy on Friday afternoons regularly because rollback is just a `git revert` away.

## The Bottom Line 💡

GitOps isn't a tool, it's a mindset shift:

- ✅ **Git is the source of truth** — not someone's brain, not Slack messages
- ✅ **Every change is audited** — who changed what, when, and why (commit message!)
- ✅ **Rollback is instant** — `git revert` beats any other mechanism
- ✅ **Consistency is automatic** — Argo CD ensures Git = cluster, always
- ✅ **Deploy confidence goes up** — automated sync beats human memory

**After countless deployments** — manual, scripted, Ansible-based, and GitOps — I can say: GitOps with Argo CD is the first deployment approach that actually keeps me calm on Fridays.

The learning curve is real. The initial setup takes a day. But the payoff? Sleeping through the night without deployment anxiety. Worth every minute. 🛌

## Your Action Plan 🚀

**Day 1:**
1. Install Argo CD in a test cluster
2. Point it at a non-critical app
3. Feel the magic of `git push` triggering a deploy

**Week 1:**
1. Migrate one staging app to GitOps
2. Set up the app repo + infra repo separation
3. Add Kustomize overlays for staging/production

**Month 1:**
1. Migrate production apps
2. Set up ApplicationSets for microservices
3. Implement External Secrets for secret management
4. Watch your team's Friday afternoon confidence skyrocket

---

**Still doing `kubectl apply` by hand?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk about escaping that chaos!

**Want to see real Argo CD configs?** Check my [GitHub](https://github.com/kpanuragh) — production GitOps setups from real projects!

*Now go forth and let Git run your cluster!* 🔄🚀✨

---

**P.S.** The first time Argo CD automatically reverted a coworker's accidental manual kubectl change, they were FURIOUS. Then they realized it was correct and their manual change was the bug. GitOps enforces discipline. Teams eventually thank you for it. 😄

**P.P.S.** "But what if Git is down and I need to emergency deploy?" Valid concern. Argo CD has an emergency manual sync option. But in 2 years of GitOps, I've never had to use it. GitHub has better uptime than our infrastructure. 🤷
