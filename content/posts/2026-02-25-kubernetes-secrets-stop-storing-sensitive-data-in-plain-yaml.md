---
title: "Kubernetes Secrets: Stop Storing Sensitive Data in Plain YAML 🔐"
date: "2026-02-25"
excerpt: "Discovered a team committing base64-encoded database passwords directly to their Git repo and calling it 'secure'. Kubernetes Secrets are not as safe as you think — here's how to actually protect sensitive data in your cluster."
tags: ["devops", "kubernetes", "security", "ci-cd"]
featured: true
---

# Kubernetes Secrets: Stop Storing Sensitive Data in Plain YAML 🔐

Let me tell you about the worst code review I've ever done.

A developer sent me a PR with this in it:

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
data:
  password: cGFzc3dvcmQxMjM=
```

"It's fine," they said. "It's base64 encoded," they said.

I decoded it on the spot. `password123`. Committed. To a public GitHub repo. With 6 months of git history. 😐

**Base64 is not encryption.** Base64 is a polite way of pretending your secrets aren't visible. `echo "cGFzc3dvcmQxMjM=" | base64 -d` — two seconds, done. Your database is now everyone's database.

Let's fix this properly.

## Why Kubernetes Secrets Are Secretly (pun intended) Terrible by Default 🤔

Here's what Kubernetes Secrets actually are out of the box:

- **Stored in etcd as base64** — which is just encoding, not encryption
- **Accessible to anyone with `kubectl get secret`** in that namespace
- **Happily committed to Git** if you're not careful
- **Visible in logs** if your app helpfully prints its config at startup

Kubernetes gives you the *mechanism* for secrets. It does NOT give you the security. That's your job.

**The four horsemen of secrets mismanagement:**

1. Committing `secrets.yaml` to Git (very common, very bad)
2. Using base64 and thinking it's encrypted (rookie mistake)
3. Giving every pod access to every secret (blast radius nightmare)
4. Never rotating secrets (your 2019 database password is still running production)

## Approach #1: Seal Your Secrets Before Committing 🦭

**Sealed Secrets** by Bitnami lets you encrypt your secrets with a public key. Only the controller running in your cluster can decrypt them. Now you CAN safely commit to Git.

```bash
# Install the controller into your cluster
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system

# Install the CLI tool
brew install kubeseal  # or use the binary from GitHub releases
```

**Create a regular secret first (don't apply it yet!):**

```yaml
# secret.yaml (DO NOT COMMIT THIS)
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: production
type: Opaque
stringData:
  DB_PASSWORD: "supersecurepassword"
  DB_HOST: "prod-db.internal"
```

**Now seal it:**

```bash
# Seal it using your cluster's public key
kubeseal \
  --controller-namespace kube-system \
  --format yaml \
  < secret.yaml \
  > sealed-secret.yaml

# sealed-secret.yaml is NOW SAFE TO COMMIT ✅
cat sealed-secret.yaml
```

The output looks like this:

```yaml
# sealed-secret.yaml (SAFE TO COMMIT TO GIT ✅)
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  encryptedData:
    DB_PASSWORD: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEq...
    DB_HOST: AgCH1pX8Ek3VpnRQ7zGW3y9kJ2mNd4Y...
```

**That encrypted blob is useless outside your cluster.** Commit away. Push it to GitHub. Put it on a billboard. Nobody can decrypt it without your cluster's private key.

```bash
# Apply the sealed secret
kubectl apply -f sealed-secret.yaml

# Kubernetes automatically creates the real secret
kubectl get secret db-credentials -n production
```

**The lesson I learned the hard way:** Sealed Secrets lets you do GitOps properly — all your config, including secrets, lives in Git with actual security. This is now my default for every cluster I manage.

## Approach #2: External Secrets with AWS Secrets Manager 🔑

For teams already on AWS, this is the pro move. Store secrets in AWS Secrets Manager (or Parameter Store), then sync them into Kubernetes automatically.

**Install External Secrets Operator:**

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace
```

**Create an AWS secret first:**

```bash
aws secretsmanager create-secret \
  --name "production/myapp/database" \
  --secret-string '{"password":"actuallySecure!","host":"prod-db.internal"}'
```

**Then tell Kubernetes to pull it:**

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  refreshInterval: 1h           # Sync every hour
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: db-credentials        # Creates this K8s Secret
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD    # Key in K8s Secret
      remoteRef:
        key: production/myapp/database   # AWS secret name
        property: password               # JSON field
    - secretKey: DB_HOST
      remoteRef:
        key: production/myapp/database
        property: host
```

**Why this is actually amazing:**

- ✅ Secrets live in AWS (proper encryption at rest, access logs, rotation)
- ✅ Kubernetes gets fresh copies automatically (rotate in AWS → syncs to K8s)
- ✅ Zero secrets in Git, ever
- ✅ IAM controls who can access what (not just "anyone in the namespace")
- ✅ Full audit trail in CloudTrail

```bash
kubectl apply -f external-secret.yaml

# Watch the magic happen
kubectl get externalsecret db-credentials -n production
# STATUS: SecretSynced ✅
```

**After migrating three production clusters to External Secrets**, the best part was watching secrets rotation become a non-event. Update in AWS Secrets Manager → wait an hour → done. No `kubectl` commands. No deployment restarts. Just works.

## Approach #3: Use Your Secrets Correctly in Pods 📦

Even with proper secrets management, I've seen teams defeat themselves by mounting secrets wrong:

**Bad: Environment variables from secrets (the old way):**

```yaml
# This works but logs and process listings can expose env vars
containers:
  - name: myapp
    env:
      - name: DB_PASSWORD
        valueFrom:
          secretKeyRef:
            name: db-credentials
            key: DB_PASSWORD
```

**Better: Mount as files, read programmatically:**

```yaml
containers:
  - name: myapp
    volumeMounts:
      - name: secrets
        mountPath: /run/secrets
        readOnly: true

volumes:
  - name: secrets
    secret:
      secretName: db-credentials
      defaultMode: 0400   # Owner read-only
```

Your app reads `/run/secrets/DB_PASSWORD` at startup. No environment variable exposure. Kubernetes automatically updates the file if the secret rotates (eventually consistent, ~1 minute lag).

**Also: Lock down RBAC so not everything can read everything:**

```yaml
# Only your app's ServiceAccount can read its secrets
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: myapp-secrets-reader
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["db-credentials"]  # ONLY this secret
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp-secrets-reader-binding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: myapp-sa
roleRef:
  kind: Role
  name: myapp-secrets-reader
  apiGroup: rbac.authorization.k8s.io
```

**A real lesson from a security audit:** The default ServiceAccount in Kubernetes can read ALL secrets in its namespace. If your app gets compromised and runs `kubectl get secrets`, it can read every secret in that namespace — your database password, your third-party API keys, everything. Scope your RBAC tightly.

## The Quick Audit: Find Your Secrets Sins Right Now 🔍

Run these in your repo before anything else:

```bash
# Check if any secrets.yaml files are committed
git log --all --full-history -- "*secret*" "*Secret*"

# Scan git history for base64 patterns (password-like strings)
git log -p | grep -E "^\\+.*[A-Za-z0-9+/]{40,}={0,2}$" | head -20

# Check what's actually in your cluster (run this in CI to catch drift)
kubectl get secrets --all-namespaces -o json | \
  jq '.items[] | select(.type != "kubernetes.io/service-account-token") |
  {name: .metadata.name, namespace: .metadata.namespace}'
```

If that first command shows results, you have a problem older than your current team members have been here. Time to rotate credentials AND rewrite history (or go nuclear with `git filter-repo`).

## The Bottom Line 💡

Kubernetes Secrets out of the box are a starting point, not a finish line. The default behavior — base64 in etcd, accessible to anyone in the namespace, happily committed to Git — is a liability waiting to become an incident.

**The hierarchy of secrets maturity:**

| Level | Approach | What you get |
|-------|----------|--------------|
| 😬 | Plain YAML in Git | A future breach |
| 🤔 | `kubectl create secret` (no Git) | Better, but no GitOps |
| ✅ | Sealed Secrets | GitOps-safe encryption |
| 🚀 | External Secrets + AWS/Vault | Full audit trail, rotation |

Pick the one that matches where your team is, then plan to level up.

The developer from my code review story? They refactored to Sealed Secrets that same week. Rotated the leaked password. Enabled etcd encryption at rest on the cluster. Now they're the person who gives the "don't commit secrets" talk at team onboarding.

Growth is beautiful. 🌱

## Your Action Plan 🚀

**Today:**
1. Audit your repo: `git log --all --full-history -- "*secret*"`
2. Check if etcd encryption is enabled: `kubectl get apiserver -o yaml | grep encryption`
3. Rotate any secrets that may have been exposed

**This week:**
1. Install Sealed Secrets or External Secrets Operator
2. Migrate your existing `secrets.yaml` files
3. Add a `.gitignore` rule for `*secret*.yaml` as a safety net
4. Tighten RBAC so pods only access their own secrets

**This month:**
1. Enable automatic secret rotation
2. Set up CloudTrail/audit logs for secret access
3. Add secret scanning to your CI pipeline (GitHub Advanced Security or `truffleHog`)
4. Document your secrets management runbook

---

**Still storing passwords in base64 YAML?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — let's talk before your next security audit finds it for you!

**Want to see real GitOps secret management setups?** Check out my [GitHub](https://github.com/kpanuragh) for production-ready Sealed Secrets and External Secrets configurations.

*Now go rotate those credentials.* 🔐✨
