---
title: "GitOps with ArgoCD: Stop SSH-ing Into Production Like It's 2012 🚀"
date: "2026-02-23"
excerpt: "After years of SSHing into production servers to 'quickly fix' things and creating configuration drift nightmares, I discovered GitOps. ArgoCD made our cluster self-healing. Here's everything I wish I knew before losing two Fridays to manual kubectl apply sessions."
tags: ["devops", "deployment", "ci-cd", "kubernetes", "gitops"]
featured: true
---

# GitOps with ArgoCD: Stop SSH-ing Into Production Like It's 2012 🚀

**Confession:** I once SSHed into a production Kubernetes cluster, ran a quick `kubectl set image` to hotfix a bug, and thought "I'll open a PR for this later." That was a Thursday. The PR never happened. Three months later, production was silently running different code than our Git repo, and nobody knew why things were subtly broken. Including me. Especially me.

That's **configuration drift** — and it's the slow-motion disaster that GitOps was invented to prevent.

ArgoCD is the tool that finally made our deployments honest. If it's not in Git, it doesn't exist in production. Full stop.

## What GitOps Actually Means 🤔

GitOps flips the deployment model on its head.

**Old way (push-based):**
```
Developer → runs kubectl apply → cluster changes
```

**GitOps way (pull-based):**
```
Developer → commits to Git → ArgoCD notices → ArgoCD applies → cluster changes
```

Git becomes the **single source of truth** for your entire cluster state. Every config change is a PR. Every deployment is reviewable, auditable, and rollback-able with a simple `git revert`.

ArgoCD runs *inside* your cluster and watches your Git repository. When the repo drifts from the cluster state (someone ran a rogue `kubectl` command), ArgoCD flags it — or auto-corrects it, depending on your sync policy.

## The Incident That Changed Everything 🔥

A CI/CD pipeline that saved our team — but only after it nearly destroyed us first.

We had a multi-tenant Laravel API on Kubernetes. Three developers, one cluster, and zero discipline about who was applying what. Our deployment process was: "Build the image in GitHub Actions, then someone SSHes in and updates the manifest."

One day, we had a P0 incident. Users couldn't authenticate. Our monitoring showed the auth service was running the right image tag... but behaving like an older version. We spent two hours debugging. The auth service was fine. The *environment variable* was wrong. Someone had run `kubectl edit deployment auth-service` to "test something" two weeks earlier and never reverted it.

After countless deployments chasing ghost bugs caused by drift, I set up ArgoCD in a weekend. We haven't had a drift incident since. Not once.

## Setting Up ArgoCD ⚙️

Installation is surprisingly painless:

```bash
# Install ArgoCD into its own namespace
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for it to come up
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

# Port-forward to access the UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Then you define an `Application` — ArgoCD's CRD that says "watch this Git path and sync it to this namespace":

```yaml
# argocd-apps/api-service.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-service
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/yourorg/k8s-manifests
    targetRevision: HEAD
    path: apps/api-service         # Folder in your GitOps repo
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true       # Delete resources removed from Git
      selfHeal: true    # Revert manual kubectl changes automatically
    syncOptions:
      - CreateNamespace=true
```

The `selfHeal: true` is the game-changer. Somebody runs a `kubectl edit` in production at 2 AM? ArgoCD reverts it within 3 minutes. No more drift. No more mysteries.

## The Full GitOps Workflow 🤖

Here's the two-repo pattern that works well: one repo for application code, one for Kubernetes manifests.

```
[app-repo]                          [k8s-manifests repo]
  main branch                         main branch
  └── src/                            └── apps/
  └── Dockerfile                          └── api-service/
  └── .github/workflows/                      └── deployment.yaml
       └── deploy.yml                          └── service.yaml
                                               └── ingress.yaml
```

**GitHub Actions workflow (in app-repo):**

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-update-manifest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
        with:
          aws-region: ap-south-1

      - name: Build and push image
        env:
          IMAGE_TAG: ${{ github.sha }}
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
        run: |
          docker build -t $ECR_REGISTRY/api:$IMAGE_TAG .
          docker push $ECR_REGISTRY/api:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/api:$IMAGE_TAG" >> $GITHUB_OUTPUT
        id: build

      - name: Update manifest in GitOps repo
        env:
          GITHUB_TOKEN: ${{ secrets.GITOPS_TOKEN }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          # Clone the manifests repo
          git clone https://x-access-token:$GITHUB_TOKEN@github.com/yourorg/k8s-manifests.git
          cd k8s-manifests

          # Update the image tag in-place
          sed -i "s|image: .*api:.*|image: ${{ steps.build.outputs.image }}|" \
            apps/api-service/deployment.yaml

          git config user.email "deploy-bot@yourcompany.com"
          git config user.name "Deploy Bot"
          git add apps/api-service/deployment.yaml
          git commit -m "chore: bump api image to $IMAGE_TAG"
          git push
```

That `git push` to the manifests repo triggers ArgoCD. No webhooks to configure. No `kubectl` in your CI. ArgoCD just notices the repo changed within 3 minutes (or immediately if you configure webhooks) and syncs.

## Before vs. After: Our Team's Reality 📊

| Situation | Before GitOps | After GitOps |
|---|---|---|
| Who deployed what? | "Check Slack history" 😬 | `git log` on the manifests repo |
| Config drift in prod | Constant, invisible | Impossible — ArgoCD reverts it |
| Emergency rollback | Re-deploy old image manually | `git revert` + push (2 minutes) |
| Secrets in manifests | ...yes, it happened | Sealed Secrets / External Secrets |
| New developer onboarding | "Ask someone who knows the cluster" | Read the Git repo |
| Audit trail | Non-existent | Full PR history with reviewers |
| Friday deploy anxiety | Real and justified | Much lower — Git is the safety net |

## Common Pitfalls to Avoid 🪤

**Pitfall #1: Using `latest` as your image tag**

```yaml
# Bad — ArgoCD can't detect changes to this
image: yourregistry/api:latest

# Good — every commit gets a unique, immutable tag
image: yourregistry/api:a1b2c3d4e5f6
```

If you push `latest`, ArgoCD sees no manifest change and doesn't sync. Use commit SHAs or semantic version tags.

**Pitfall #2: Putting raw secrets in your GitOps repo**

Docker taught me the hard way that "I'll just not commit this to the public repo" is not a security strategy. Use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or the External Secrets Operator to store encrypted references in Git, not the secrets themselves.

```bash
# Sealed Secrets — encrypt a secret so only your cluster can decrypt it
kubectl create secret generic db-password \
  --from-literal=password=supersecret \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > apps/api-service/db-password-sealed.yaml

# This file is safe to commit — only your cluster's controller can decrypt it
```

**Pitfall #3: Not setting resource limits (ArgoCD will sync whatever's in Git)**

ArgoCD faithfully applies whatever is in your manifests — including manifests with no resource limits. Set them, or your pods will starve other workloads and you'll spend a weekend chasing OOMKilled errors.

**Pitfall #4: Sync waves and ordering**

If your API pod starts before the database migration job completes, you get errors. Use sync waves to sequence:

```yaml
# Run database migrations first
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-1"  # Lower = earlier
```

## TL;DR ✅

- GitOps = Git is the source of truth for your cluster; no more `kubectl apply` by hand
- ArgoCD watches your Git repo and keeps the cluster in sync — automatically
- `selfHeal: true` reverts unauthorized manual changes within minutes
- Use **two repos**: app code in one, Kubernetes manifests in another
- GitHub Actions builds the image and bumps the manifest; ArgoCD handles the rest
- Never use `latest` as your image tag — ArgoCD won't detect changes
- Encrypt secrets with Sealed Secrets before committing — Git repos are forever
- Set resource limits in your manifests, or your future self will not thank you

After countless deployments involving SSH sessions, rogue `kubectl` commands, and the existential dread of "is prod actually running what's in Git?"... ArgoCD is the answer I wish I'd found years earlier. Treat your cluster like code. Put everything in Git. Let the robot do the deploying.

The next time someone SSHes into production to "quickly fix something," you can smile and watch ArgoCD silently undo it three minutes later. 😇

---

**Running GitOps in production and want to compare notes?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always up for swapping war stories about configuration drift.

**Want the full setup?** My [GitHub](https://github.com/kpanuragh) has working ArgoCD app definitions and GitHub Actions workflows from real projects.

*If your production cluster has ever run code that wasn't in Git, you need this. No judgment — I've been there.* 🚀
