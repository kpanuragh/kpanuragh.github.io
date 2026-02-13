---
title: "Kubernetes Secrets: Stop Storing Passwords in ConfigMaps Like a Rookie 🔐☸️"
date: "2026-02-13"
excerpt: "After 7 years deploying to production Kubernetes clusters, I've seen developers treat ConfigMaps like password managers. Here's why your 'secrets' aren't secret at all - and how to actually protect them!"
tags: ["devops", "kubernetes", "security", "deployment"]
featured: true
---

# Kubernetes Secrets: Stop Storing Passwords in ConfigMaps Like a Rookie 🔐☸️

**Real confession:** In 2019, I deployed my first production app to Kubernetes. Put the database password in a ConfigMap because "it's just configuration, right?" Three weeks later, a junior dev ran `kubectl get configmap -o yaml` and accidentally committed it to a public GitHub repo. Our production database credentials were on the internet for 6 hours before we noticed. 😱

**Senior DevOps engineer:** "Why didn't you use Secrets?"

**Me:** "I did! They're in the ConfigMap!"

**Him:** *facepalm*

Welcome to the day I learned that Kubernetes Secrets and ConfigMaps are NOT the same thing!

## What's the Difference Between ConfigMaps and Secrets? 🤔

**The confusion:** They look almost identical in YAML. They both hold key-value pairs. Why does it matter?

**ConfigMaps (For non-sensitive config):**
```yaml
# ConfigMap - Fine for this stuff
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_NAME: "MyAwesomeApp"
  LOG_LEVEL: "info"
  API_URL: "https://api.example.com"
  FEATURE_FLAG: "true"
```

**Secrets (For sensitive data):**
```yaml
# Secret - Use for passwords/tokens/keys
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  # Values are base64 encoded (NOT encrypted!)
  DB_PASSWORD: c3VwZXJzZWNyZXQxMjM=
  API_KEY: YWJjZGVmZ2hpamtsbW5vcA==
stringData:
  # Or use stringData for plain text (K8s encodes it)
  JWT_SECRET: "my-super-secret-jwt-key"
```

**The truth bomb:** Kubernetes Secrets are just base64-encoded ConfigMaps. They're NOT encrypted by default! 🤯

**Translation:** `echo "supersecret123" | base64` doesn't make it secure - it just makes it LOOK secure!

## The Production Horror Story That Taught Me This 💀

After countless AWS deployments, I thought I understood security. Then Kubernetes humbled me:

**Black Friday 2020, 10 PM (Peak traffic!):**

```bash
Me: "Let me check why the API is slow..."
kubectl describe pod api-5f8c9d-xyz
# Output shows ALL environment variables, including:
# DB_PASSWORD: supersecret123
# API_KEY: sk_live_actual_stripe_key
# All visible in plain text! 😱
```

**What happened:**
- Any developer with `kubectl` access could see production secrets
- Secrets were in pod descriptions (visible to anyone)
- Logs accidentally printed environment variables
- Our Stripe API key was exposed in multiple places
- My stress level: 📈📈📈

**Cost of this mistake:**
- Emergency key rotation at 11 PM on Black Friday
- 20 minutes of downtime while redeploying
- $4,000 in lost sales
- One very angry CTO
- One lesson learned FOREVER

**After implementing proper secrets management:**
- Secrets encrypted at rest
- RBAC limiting who can view secrets
- External secrets manager (AWS Secrets Manager)
- No more sleeping with one eye open! 😅

## Kubernetes Secrets 101: The Basics 🎓

### Creating Secrets (The Right Way)

**Method 1: From literal values**
```bash
# Create secret from command line
kubectl create secret generic db-creds \
  --from-literal=username=admin \
  --from-literal=password=supersecret123

# Better: Use environment variables (don't store in bash history!)
kubectl create secret generic db-creds \
  --from-literal=username=$DB_USER \
  --from-literal=password=$DB_PASSWORD
```

**Method 2: From files**
```bash
# Store secrets in files (DON'T commit to Git!)
echo -n "supersecret123" > ./password.txt
echo -n "admin" > ./username.txt

kubectl create secret generic db-creds \
  --from-file=username=./username.txt \
  --from-file=password=./password.txt

# Clean up files immediately!
rm ./password.txt ./username.txt
```

**Method 3: From YAML (use with GitOps - but encrypt first!)**
```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
  namespace: production
type: Opaque
stringData:
  # Use stringData - K8s will encode it
  username: admin
  password: supersecret123
```

```bash
# Apply it
kubectl apply -f secret.yaml

# WARNING: Don't commit this to Git unencrypted!
# Use Sealed Secrets or SOPS (more on this later!)
```

**After deploying dozens of Node.js and Laravel apps**, I learned: Never type secrets in YAML files unless they're encrypted! 🔒

## Using Secrets in Your Pods 🚀

### Pattern #1: Environment Variables

**The deployment:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: myapp:latest
        env:
        # Individual secret values
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: password

        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: username

        # Or import ALL keys from secret
        envFrom:
        - secretRef:
            name: app-secrets
```

**Your app code:**
```javascript
// config.js
const config = {
  database: {
    host: process.env.DB_HOST,
    username: process.env.DB_USERNAME,    // From secret!
    password: process.env.DB_PASSWORD,    // From secret!
    database: process.env.DB_NAME
  }
};
```

**Why I use this:** Simple, works everywhere, familiar to developers! ✅

**The catch:** Secrets are visible in pod descriptions and process listings! ⚠️

### Pattern #2: Volume Mounts (More Secure!)

**Mount secrets as files:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
      - name: api
        image: myapp:latest
        volumeMounts:
        - name: secrets
          mountPath: "/etc/secrets"
          readOnly: true

      volumes:
      - name: secrets
        secret:
          secretName: db-creds
          items:
          - key: password
            path: db-password    # Creates /etc/secrets/db-password
          - key: username
            path: db-username    # Creates /etc/secrets/db-username
```

**Your app reads from files:**
```javascript
// config.js
const fs = require('fs');

const config = {
  database: {
    username: fs.readFileSync('/etc/secrets/db-username', 'utf8').trim(),
    password: fs.readFileSync('/etc/secrets/db-password', 'utf8').trim(),
  }
};
```

**Why this is better:**
- ✅ Secrets not in environment variables
- ✅ Not visible in process listings
- ✅ Can rotate without restarting pods (with subPath!)
- ✅ More secure!

**A Kubernetes pattern that saved our team:** Volume mounts are the production-ready way! Use them for sensitive credentials! 🎯

## The Base64 Trap (Secrets Aren't Encrypted!) 🪤

**The rookie mistake:**
```bash
# "Encrypt" password
echo -n "supersecret123" | base64
# Output: c3VwZXJzZWNyZXQxMjM=

# "It's encrypted!" (NO IT'S NOT!)
```

**Anyone can decode it:**
```bash
echo "c3VwZXJzZWNyZXQxMjM=" | base64 -d
# Output: supersecret123
# 😱 That was easy!
```

**The reality check:**
```bash
# View all secrets in namespace
kubectl get secrets -o yaml

# Output shows base64 values
# Anyone with kubectl access can decode them!
data:
  password: c3VwZXJzZWNyZXQxMjM=

# Decode instantly
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
# Output: supersecret123
```

**Docker taught me the hard way:** Base64 encoding is NOT encryption! It's just obfuscation! 🎭

## Strategy #1: Encrypt Secrets at Rest (ETCD Encryption) 🔐

**The problem:** By default, secrets are stored in plain base64 in etcd (Kubernetes database)!

**Enable encryption at rest:**

```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <32-byte base64 encoded key>
      - identity: {}  # Fallback for reading old secrets
```

**Generate encryption key:**
```bash
# Generate 32-byte random key
head -c 32 /dev/urandom | base64
```

**Configure API server:**
```bash
# Add to kube-apiserver flags
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

**Verify encryption:**
```bash
# Create a test secret
kubectl create secret generic test --from-literal=key=value

# Check if it's encrypted in etcd
ETCDCTL_API=3 etcdctl get /registry/secrets/default/test

# Should see encrypted garbage, not plain text!
```

**In production AWS EKS clusters**, I always enable encryption at rest! It's 10 minutes of setup for peace of mind! 🛡️

## Strategy #2: External Secrets Operators (The Pro Move) 🚀

**The concept:** Don't store secrets in Kubernetes at all! Pull them from external vaults!

### Option A: AWS Secrets Manager + External Secrets Operator

**Install External Secrets Operator:**
```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets
```

**Create AWS Secrets Manager secret:**
```bash
# Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name production/database \
  --secret-string '{"username":"admin","password":"supersecret123"}'
```

**Configure SecretStore:**
```yaml
# secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
```

**Create ExternalSecret:**
```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-creds
  namespace: production
spec:
  refreshInterval: 1h  # Sync every hour
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: db-creds  # Creates this K8s secret
    creationPolicy: Owner
  data:
  - secretKey: username
    remoteRef:
      key: production/database
      property: username
  - secretKey: password
    remoteRef:
      key: password
      property: password
```

**What happens:**
1. External Secrets Operator runs in cluster
2. Watches for ExternalSecret resources
3. Fetches secrets from AWS Secrets Manager
4. Creates/updates Kubernetes Secrets automatically
5. Rotates secrets when they change in AWS!

**Why I love this:**
- ✅ Secrets never stored in Git
- ✅ Central secret management (AWS/Vault)
- ✅ Automatic rotation
- ✅ Audit logging (who accessed what)
- ✅ Can use same secrets across multiple clusters

**After setting up CI/CD for dozens of projects**, I learned: External Secrets is the gold standard! 🏆

### Option B: HashiCorp Vault

```yaml
# vault-secret.yaml
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultStaticSecret
metadata:
  name: db-creds
spec:
  type: kv-v2
  mount: secret
  path: production/database
  destination:
    name: db-creds
    create: true
  refreshAfter: 60s
```

## Strategy #3: Sealed Secrets (GitOps-Friendly) 📦

**The problem:** Want to store secrets in Git for GitOps, but can't commit plain secrets!

**The solution:** Sealed Secrets - encrypt secrets that only your cluster can decrypt!

**Install Sealed Secrets controller:**
```bash
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Install kubeseal CLI
brew install kubeseal
```

**Create and seal a secret:**
```bash
# Create normal secret (don't apply yet!)
kubectl create secret generic db-creds \
  --from-literal=password=supersecret123 \
  --dry-run=client \
  -o yaml > secret.yaml

# Seal it (encrypt)
kubeseal < secret.yaml > sealed-secret.yaml

# Now sealed-secret.yaml is SAFE to commit to Git!
```

**The sealed secret:**
```yaml
# sealed-secret.yaml - SAFE to commit!
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-creds
spec:
  encryptedData:
    password: AgBpQ9x7K... (encrypted blob)
```

**Apply to cluster:**
```bash
kubectl apply -f sealed-secret.yaml

# Controller decrypts and creates regular Secret
kubectl get secret db-creds
# Works like a normal secret!
```

**Why Sealed Secrets rock:**
- ✅ Can commit to Git safely
- ✅ Works with GitOps (ArgoCD, Flux)
- ✅ Only YOUR cluster can decrypt
- ✅ Simple to use

**A deployment pattern that saved our team:** Sealed Secrets made GitOps actually work for production! 🎯

## RBAC: Who Can View Your Secrets? 👀

**The scary truth:**
```bash
# If you have this permission, you can read ALL secrets
kubectl get secrets -o yaml
# 😱 All passwords visible!
```

**Create read-only role (no secrets access):**
```yaml
# rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: developer
rules:
# Can view pods, services, deployments
- apiGroups: ["", "apps"]
  resources: ["pods", "services", "deployments"]
  verbs: ["get", "list", "watch"]

# CANNOT view secrets or configmaps!
- apiGroups: [""]
  resources: ["secrets", "configmaps"]
  verbs: []  # No access!
```

**Bind role to developers:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developer-binding
  namespace: production
subjects:
- kind: User
  name: junior-dev@company.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: developer
  apiGroup: rbac.authorization.k8s.io
```

**After countless deployments to production**, I learned: Limit secret access to only those who NEED it! 🔒

## Common Mistakes (Learn from My Pain!) 🚨

### Mistake #1: Logging Secrets

**Bad:**
```javascript
// app.js - DON'T DO THIS!
console.log('Starting app with config:', {
  dbHost: process.env.DB_HOST,
  dbPassword: process.env.DB_PASSWORD,  // 😱 LOGGED!
  apiKey: process.env.API_KEY           // 😱 LOGGED!
});
```

**Good:**
```javascript
// app.js
console.log('Starting app with config:', {
  dbHost: process.env.DB_HOST,
  dbPassword: '***',  // Redacted
  apiKey: '***'       // Redacted
});
```

### Mistake #2: Secrets in Pod Descriptions

**The leak:**
```bash
kubectl describe pod api-xyz

# Environment:
#   DB_PASSWORD: supersecret123  ← Visible to anyone!
```

**The fix:** Use volume mounts instead of env vars for sensitive data!

### Mistake #3: Not Rotating Secrets

**Bad practice:**
```bash
# Set once, never change
kubectl create secret generic db-creds \
  --from-literal=password=supersecret123

# 3 years later, still using same password 💀
```

**Good practice:**
```bash
# Rotate quarterly (or monthly!)
# 1. Create new secret version
kubectl create secret generic db-creds-v2 \
  --from-literal=password=newsecret456

# 2. Update deployment to use new secret
# 3. Delete old secret after grace period
kubectl delete secret db-creds
```

### Mistake #4: Committing Secrets to Git

**The disaster:**
```bash
# Create secret
cat > secret.yaml <<EOF
apiVersion: v1
kind: Secret
data:
  password: $(echo -n "supersecret" | base64)
EOF

# Commit it (NOOO!)
git add secret.yaml
git commit -m "Add secrets"
git push

# 😱 Secret is now in Git history FOREVER!
```

**The fix:** Use `.gitignore` and Sealed Secrets!

```bash
# .gitignore
secret.yaml
*.secret.yaml
*-secret.yaml

# Only commit sealed secrets
sealed-secret.yaml  # This is safe!
```

## The Production-Ready Secrets Setup 🏭

**My battle-tested approach for Node.js/Laravel apps:**

```yaml
# 1. External Secrets Operator with AWS Secrets Manager
---
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-production
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 5m
  secretStoreRef:
    name: aws-production
  target:
    name: app-secrets
  data:
  - secretKey: DATABASE_URL
    remoteRef:
      key: production/database-url
  - secretKey: API_KEY
    remoteRef:
      key: production/api-key

---
# 2. Deployment using secrets as volumes
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
      - name: api
        image: myapp:latest
        volumeMounts:
        - name: secrets
          mountPath: /etc/secrets
          readOnly: true
        env:
        - name: SECRETS_PATH
          value: /etc/secrets

      volumes:
      - name: secrets
        secret:
          secretName: app-secrets

---
# 3. RBAC - limit access
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: developer
rules:
- apiGroups: [""]
  resources: ["pods", "services"]
  verbs: ["get", "list"]
# NO access to secrets!
```

**Why this works:**
- ✅ Secrets in AWS Secrets Manager (encrypted, audited)
- ✅ Auto-synced to Kubernetes (5 min refresh)
- ✅ Mounted as files (not env vars)
- ✅ RBAC limits who can view
- ✅ Can rotate in AWS without touching K8s

## The Bottom Line 💡

Kubernetes Secrets are NOT secure by default - they're just base64-encoded!

**The essentials:**
1. **Never use ConfigMaps for passwords** - Use Secrets
2. **Enable encryption at rest** - Protect etcd
3. **Use external secrets managers** - AWS Secrets Manager, Vault
4. **Mount as volumes, not env vars** - More secure
5. **Use Sealed Secrets for GitOps** - Safe to commit
6. **Implement RBAC** - Limit who can view secrets
7. **Rotate regularly** - Don't use same password for 3 years!

**The truth about Kubernetes secrets:**

It's not "are my secrets in Kubernetes?" - it's "how are my secrets protected?"

**In my 7 years deploying production applications to Kubernetes**, I learned this: Base64 is not encryption! Treat secrets like the nuclear codes - multiple layers of protection! 🛡️

## Your Action Plan 🎯

**Right now:**
1. Audit your secrets: `kubectl get secrets -A`
2. Check for passwords in ConfigMaps (fix them!)
3. Enable etcd encryption at rest
4. Set up RBAC to limit secret access

**This week:**
1. Install External Secrets Operator
2. Move secrets to AWS Secrets Manager or Vault
3. Convert env var secrets to volume mounts
4. Add `.gitignore` rules for secret files

**This month:**
1. Set up Sealed Secrets for GitOps
2. Implement secret rotation policy
3. Audit who has secret access
4. Document your secrets workflow
5. Train team on proper secret management!

## Resources Worth Your Time 📚

**Tools I use daily:**
- [External Secrets Operator](https://external-secrets.io/) - Sync secrets from AWS/Vault/GCP
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) - GitOps-friendly encryption
- [HashiCorp Vault](https://www.vaultproject.io/) - Enterprise secret management
- [SOPS](https://github.com/mozilla/sops) - Encrypt YAML files

**Reading:**
- [Kubernetes Secrets Docs](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Encrypting Secret Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
- [External Secrets Guide](https://external-secrets.io/latest/guides/getting-started/)

**Real talk:** The best secrets management is the one your team will actually use! Start simple, add complexity as needed! 🎯

---

**Still storing passwords in ConfigMaps?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk Kubernetes security!

**Want to see my K8s configs?** Check out my [GitHub](https://github.com/kpanuragh) - Real production manifests with proper secret management!

*Now go encrypt those secrets properly!* 🔐☸️✨

---

**P.S.** If you can decode your Kubernetes secrets with `base64 -d`, so can an attacker! Use External Secrets or Sealed Secrets - your future self will thank you! 🛡️

**P.P.S.** I once found production database credentials in a ConfigMap that was accidentally committed to a public repo. The company didn't find out until I reported it through their bug bounty program. Don't be that company - use proper secrets management! 😅
