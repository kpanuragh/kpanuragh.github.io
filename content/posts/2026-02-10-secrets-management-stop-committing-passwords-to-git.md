---
title: "Secrets Management: Stop Committing Your API Keys to Git (We've All Done It) 🔐🙈"
date: "2026-02-10"
excerpt: "After 7 years of production deployments and one very public GitHub leak that cost us $3,000 in AWS charges, I learned that managing secrets isn't optional - it's survival. Here's how to stop hardcoding passwords like it's 2005!"
tags: ["devops", "security", "kubernetes", "deployment"]
featured: true
---

# Secrets Management: Stop Committing Your API Keys to Git (We've All Done It) 🔐🙈

**Real confession:** In 2019, I pushed code to a public GitHub repo with AWS credentials hardcoded in a config file. Within 14 minutes (yes, I timed it later), bots found it and spun up 47 EC2 instances mining cryptocurrency. My phone exploded with AWS billing alerts at 3 AM. Final damage: $3,127.43 before I shut everything down. 😱

**AWS Support:** "You committed credentials to a public repo."

**Me:** "Yeah, but I deleted the commit after 5 minutes!"

**AWS:** "Bots scan GitHub every 30 seconds. They got it in 2 minutes."

**Me:** "Can you... forgive the charges?"

**AWS:** "No, but we can teach you about secrets management."

**Me:** *Signs up for AWS Secrets Manager* 💸

Welcome to secrets management - where the difference between "works on my machine" and "leaked on GitHub" is one careless `git push`!

## What Are "Secrets" Anyway? 🤔

Think of secrets like your house keys - you don't leave them under the doormat or post them on Facebook!

**Secrets in production:**
- Database passwords
- API keys (Stripe, SendGrid, AWS, etc.)
- OAuth tokens
- Private SSH keys
- Encryption keys
- JWT signing secrets
- Third-party service credentials

**NOT secrets (but people treat them like secrets):**
- Public API endpoints
- Application settings
- Feature flags
- Non-sensitive config

**The golden rule:** If it grants access or costs money when leaked, IT'S A SECRET! 🔐

## The $3,000 Lesson I Learned the Hard Way 💀

After countless deployments, I thought I was careful. Then this happened:

**My "totally safe" config file:**

```javascript
// config/aws.js - COMMITTED TO PUBLIC GITHUB! 😱

module.exports = {
  aws: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',     // ❌ DANGER!
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', // ❌ DANGER!
    region: 'us-east-1',
    s3Bucket: 'my-awesome-app-uploads'
  },
  stripe: {
    secretKey: 'sk_live_51HcR9vK2lKp3R2lKp3...',  // ❌ LIVE CREDENTIALS!
    publishableKey: 'pk_live_51HcR9vK2lKp3R...'
  },
  database: {
    host: 'prod-db.abc123.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'SuperSecretPassword123!',  // ❌ PLAIN TEXT!
    database: 'production'
  }
};
```

**My thought process:**
```
Me: "This is a private repo, it's fine!"
Me: *Makes repo public to share with open source community*
Me: "Whoops, let me delete that file"
Me: *Commits deletion*
Me: "All good!"

Git history: "I remember everything! 🤖"
Bots: "FREE AWS CREDITS! 🎉"
My AWS bill: "💰💰💰"
```

**Timeline of disaster:**

```
2:37 AM - Push code to public GitHub
2:39 AM - Bot discovers credentials
2:41 AM - First EC2 instance launched (Bitcoin mining)
2:45 AM - 10 instances running
2:51 AM - First AWS billing alert (ignored - sleeping)
3:30 AM - 47 instances running across 5 regions
4:15 AM - Phone won't stop buzzing (billing alerts)
4:16 AM - Wake up, check AWS console: 😱
4:17 AM - Emergency: Rotate ALL credentials
4:25 AM - Terminate all instances
4:45 AM - Total damage: $3,127.43
4:46 AM - My sanity: 📉
```

**What made it worse:** I had to:
1. Rotate AWS credentials (production goes dark for 5 minutes)
2. Rotate Stripe keys (breaks payment processing during business hours)
3. Rotate database password (all app instances restart)
4. Notify security team (embarrassing meeting)
5. Write incident report (more embarrassing)
6. Pay the bill (most embarrassing)

**The lesson:** Secrets in code = Ticking time bomb! ⏰💣

## Solution #1: Environment Variables (The Basics) 🌍

**The pattern:** Store secrets outside your code!

**Before (Dangerous):**

```javascript
// app.js - ❌ BAD!
const stripe = require('stripe')('sk_live_51HcR9vK2lKp3R2lKp3...');

const db = mysql.createConnection({
  host: 'prod-db.amazonaws.com',
  user: 'admin',
  password: 'SuperSecretPassword123!'
});
```

**After (Better):**

```javascript
// app.js - ✅ GOOD!
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Validation (IMPORTANT!)
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required!');
}
```

**.env file (NEVER commit this!):**

```bash
# .env - Local development only!
STRIPE_SECRET_KEY=sk_test_51HcR9vK2lKp3R2lKp3...
DB_HOST=localhost
DB_USER=dev_user
DB_PASSWORD=local_dev_password
API_KEY=test_api_key_123
```

**.gitignore (CRITICAL!):**

```bash
# .gitignore - Protect your secrets!
.env
.env.local
.env.production
*.pem
*.key
config/secrets.json
credentials.json
```

**.env.example (Safe to commit):**

```bash
# .env.example - Template for team
STRIPE_SECRET_KEY=your_stripe_secret_key_here
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
API_KEY=your_api_key_here
```

**Why this helps:**
- ✅ Secrets not in Git history
- ✅ Different secrets per environment (dev/staging/prod)
- ✅ Easy to rotate without code changes
- ✅ Team members use their own credentials

**The catch:**
- ⚠️ Still stored in plain text on server
- ⚠️ Visible in process list (`ps aux | grep node`)
- ⚠️ Can leak in error logs
- ⚠️ No audit trail of who accessed what

**In production on AWS**, environment variables are step 1, but NOT the final answer!

## Solution #2: AWS Secrets Manager (The Pro Move) ☁️

**The pattern:** Store secrets in AWS, fetch at runtime!

**Setting up Secrets Manager:**

```bash
# Create a secret
aws secretsmanager create-secret \
  --name prod/myapp/database \
  --description "Production database credentials" \
  --secret-string '{
    "host": "prod-db.abc123.us-east-1.rds.amazonaws.com",
    "username": "admin",
    "password": "SuperSecretPassword123!",
    "database": "production"
  }'

# Create Stripe secret
aws secretsmanager create-secret \
  --name prod/myapp/stripe \
  --secret-string '{
    "secretKey": "sk_live_51HcR9vK2lKp3R...",
    "webhookSecret": "whsec_abc123..."
  }'
```

**Fetching secrets in Node.js:**

```javascript
// config/secrets.js
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });

class SecretsService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getSecret(secretName) {
    // Check cache first (reduce API calls)
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`✅ Cache HIT: ${secretName}`);
      return cached.value;
    }

    console.log(`🔍 Fetching secret: ${secretName}`);

    try {
      const data = await secretsManager.getSecretValue({
        SecretId: secretName
      }).promise();

      const secret = JSON.parse(data.SecretString);

      // Cache it
      this.cache.set(secretName, {
        value: secret,
        timestamp: Date.now()
      });

      return secret;
    } catch (error) {
      console.error(`❌ Failed to fetch secret ${secretName}:`, error);
      throw error;
    }
  }

  async getDatabaseConfig() {
    return await this.getSecret('prod/myapp/database');
  }

  async getStripeConfig() {
    return await this.getSecret('prod/myapp/stripe');
  }
}

module.exports = new SecretsService();
```

**Using it in your app:**

```javascript
// app.js
const secrets = require('./config/secrets');

async function initialize() {
  // Fetch secrets on startup
  const dbConfig = await secrets.getDatabaseConfig();
  const stripeConfig = await secrets.getStripeConfig();

  // Initialize services
  const db = mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  });

  const stripe = require('stripe')(stripeConfig.secretKey);

  console.log('✅ Secrets loaded successfully!');
}

initialize().catch(error => {
  console.error('Failed to initialize app:', error);
  process.exit(1);
});
```

**IAM permissions (CRITICAL!):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/myapp/*"
      ]
    }
  ]
}
```

**Why Secrets Manager is amazing:**
- ✅ Encrypted at rest and in transit
- ✅ Automatic rotation (database passwords rotate every 30 days!)
- ✅ Audit trail (who accessed what, when)
- ✅ Fine-grained IAM permissions
- ✅ Versioning (rollback to previous secrets)
- ✅ No secrets in code or environment variables

**The catch:**
- ⚠️ Costs money ($0.40/secret/month + $0.05/10,000 API calls)
- ⚠️ Adds latency to startup (network call to AWS)
- ⚠️ Requires AWS IAM setup
- ⚠️ More complex than environment variables

**After setting up CI/CD for dozens of AWS projects**, I learned: Secrets Manager is worth EVERY penny for production! 💰

## Solution #3: Kubernetes Secrets (For K8s Deployments) ☸️

**The pattern:** Store secrets in Kubernetes, inject as environment variables or files!

**Creating Kubernetes secrets:**

```bash
# From literal values
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=SuperSecretPassword123!

# From file
kubectl create secret generic stripe-keys \
  --from-file=secret-key=./stripe-secret-key.txt

# From YAML (base64 encoded)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  db-password: U3VwZXJTZWNyZXRQYXNzd29yZDEyMyE=  # base64 encoded
  stripe-key: c2tfdGVzdF81MUhjUjl2...            # base64 encoded
EOF
```

**Using secrets in deployment:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
        env:
          # Inject as environment variables
          - name: DB_USER
            valueFrom:
              secretKeyRef:
                name: db-credentials
                key: username

          - name: DB_PASSWORD
            valueFrom:
              secretKeyRef:
                name: db-credentials
                key: password

          - name: STRIPE_SECRET_KEY
            valueFrom:
              secretKeyRef:
                name: app-secrets
                key: stripe-key

        # Or mount as files
        volumeMounts:
        - name: secret-volume
          mountPath: /etc/secrets
          readOnly: true

      volumes:
      - name: secret-volume
        secret:
          secretName: app-secrets
```

**Accessing mounted secrets:**

```javascript
// app.js - Reading secrets from mounted files
const fs = require('fs').promises;

async function loadSecrets() {
  const dbPassword = await fs.readFile('/etc/secrets/db-password', 'utf8');
  const stripeKey = await fs.readFile('/etc/secrets/stripe-key', 'utf8');

  return {
    dbPassword: dbPassword.trim(),
    stripeKey: stripeKey.trim()
  };
}
```

**Why Kubernetes Secrets work:**
- ✅ Native to Kubernetes
- ✅ Easy to inject into pods
- ✅ Can mount as files or env vars
- ✅ Free (part of K8s)
- ✅ Namespace isolation

**The catch:**
- ⚠️ Stored in etcd in base64 (NOT encrypted by default!)
- ⚠️ Anyone with kubectl access can view them
- ⚠️ No audit trail
- ⚠️ No automatic rotation

**When deploying on Kubernetes**, I learned: Use K8s Secrets + external secret store (AWS Secrets Manager, Vault) for best of both worlds!

## Solution #4: External Secrets Operator (The Best of Both Worlds) 🔄

**The pattern:** Sync secrets from AWS/Vault INTO Kubernetes automatically!

**Installing External Secrets Operator:**

```bash
# Install via Helm
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets
```

**Configure AWS Secrets Manager backend:**

```yaml
# secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
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

**Create ExternalSecret (syncs from AWS to K8s):**

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 1h  # Sync every hour
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore

  target:
    name: app-secrets  # K8s secret name
    creationPolicy: Owner

  data:
  - secretKey: db-password
    remoteRef:
      key: prod/myapp/database
      property: password

  - secretKey: stripe-key
    remoteRef:
      key: prod/myapp/stripe
      property: secretKey
```

**Use like normal K8s secrets:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
        env:
          - name: DB_PASSWORD
            valueFrom:
              secretKeyRef:
                name: app-secrets  # Synced from AWS!
                key: db-password
```

**Why External Secrets Operator is brilliant:**
- ✅ Single source of truth (AWS Secrets Manager)
- ✅ Automatic sync to Kubernetes
- ✅ Encrypted at rest in AWS
- ✅ Audit trail in AWS CloudTrail
- ✅ Automatic rotation support
- ✅ Works with Vault, GCP, Azure too!

**A deployment pattern that saved our team:** Secrets live in AWS (secure, audited, rotated). External Secrets Operator syncs to K8s (easy to use). Best of both worlds! 🎯

## Secret Rotation: Don't Set and Forget! 🔄

**The problem:** Old secrets become stale and risky!

**Rotation strategy:**

```javascript
// services/secret-rotation.js
const secrets = require('./config/secrets');

class SecretRotationService {
  constructor() {
    this.rotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  async rotateDatabase Password() {
    console.log('🔄 Rotating database password...');

    // 1. Generate new password
    const newPassword = this.generateStrongPassword();

    // 2. Update database user password
    await this.updateDatabaseUser('admin', newPassword);

    // 3. Update AWS Secrets Manager
    await this.updateSecret('prod/myapp/database', {
      password: newPassword
    });

    // 4. Trigger rolling restart of app instances
    await this.restartApplications();

    console.log('✅ Database password rotated successfully!');
  }

  generateStrongPassword() {
    // Use crypto.randomBytes for security
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('base64');
  }

  async updateDatabaseUser(username, newPassword) {
    const db = await this.getDatabaseConnection();
    await db.query(`ALTER USER '${username}' IDENTIFIED BY '${newPassword}'`);
  }

  async updateSecret(secretName, updates) {
    const AWS = require('aws-sdk');
    const secretsManager = new AWS.SecretsManager();

    // Get current secret
    const current = await secretsManager.getSecretValue({
      SecretId: secretName
    }).promise();

    const currentData = JSON.parse(current.SecretString);

    // Merge updates
    const updated = { ...currentData, ...updates };

    // Put new version
    await secretsManager.putSecretValue({
      SecretId: secretName,
      SecretString: JSON.stringify(updated)
    }).promise();
  }
}
```

**Automatic rotation with AWS Lambda:**

```javascript
// lambda/rotate-secrets.js
exports.handler = async (event) => {
  const secretId = event.SecretId;
  const token = event.ClientRequestToken;
  const step = event.Step;

  switch (step) {
    case 'createSecret':
      // Generate new secret version
      const newPassword = generatePassword();
      await putSecretValue(secretId, token, newPassword);
      break;

    case 'setSecret':
      // Update database with new password
      await updateDatabasePassword(newPassword);
      break;

    case 'testSecret':
      // Test new password works
      await testDatabaseConnection(newPassword);
      break;

    case 'finishSecret':
      // Mark as current version
      await finishRotation(secretId, token);
      break;
  }
};
```

**Rotation schedule (my production setup):**

```javascript
const ROTATION_SCHEDULE = {
  // Critical secrets: Rotate monthly
  databasePasswords: 30, // days
  apiKeys: 30,

  // High-value secrets: Rotate quarterly
  stripeKeys: 90,
  encryptionKeys: 90,

  // Low-risk secrets: Rotate yearly
  readOnlyApiKeys: 365,
  webhookSecrets: 365
};
```

**When setting up CI/CD pipelines**, I learned: Automate rotation or it NEVER happens! 🔄

## Common Mistakes (Learn from My $3K Lesson!) 🚨

### Mistake #1: "I'll Delete It from Git History"

```bash
# ❌ WRONG: Git never forgets!
git rm config/secrets.js
git commit -m "Remove secrets"
git push

# Secrets still in history at commit abc123!
# Bots already found it!
```

**Right way:**

```bash
# 1. Rotate ALL exposed credentials IMMEDIATELY
aws secretsmanager rotate-secret --secret-id prod/myapp/database

# 2. Use BFG Repo-Cleaner to rewrite history
bfg --delete-files secrets.js
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 3. Force push (breaks everyone's checkout)
git push --force

# 4. Notify team to re-clone
```

**Better:** Don't commit secrets in the first place! 🛡️

### Mistake #2: Base64 ≠ Encryption

```yaml
# ❌ WRONG: Base64 is NOT encryption!
apiVersion: v1
kind: Secret
data:
  password: U3VwZXJTZWNyZXRQYXNzd29yZA==  # Just base64!

# Anyone can decode it:
# echo "U3VwZXJTZWNyZXRQYXNzd29yZA==" | base64 -d
# Output: SuperSecretPassword
```

**Right way:** Enable encryption at rest in Kubernetes!

```yaml
# kube-apiserver config
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

### Mistake #3: Logging Secrets

```javascript
// ❌ BAD: Secrets in logs!
console.log('Connecting to database:', {
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password  // 😱 PASSWORD IN LOGS!
});

// ❌ BAD: Secrets in error messages
try {
  await stripe.charges.create({ ... });
} catch (error) {
  console.error('Stripe error:', error);  // Contains API key!
}
```

**Right way:** Redact secrets from logs!

```javascript
// ✅ GOOD: Redacted logging
const redact = (obj, keys) => {
  const copy = { ...obj };
  keys.forEach(key => {
    if (copy[key]) copy[key] = '***REDACTED***';
  });
  return copy;
};

console.log('Connecting to database:', redact(dbConfig, ['password']));

// ✅ GOOD: Safe error logging
try {
  await stripe.charges.create({ ... });
} catch (error) {
  console.error('Stripe error:', {
    message: error.message,
    type: error.type,
    // Don't log error.rawRequest or error.headers!
  });
}
```

### Mistake #4: Sharing .env Files

```bash
# ❌ WRONG: Sending .env via Slack
"Hey, here's the production .env file! 📎"

# ❌ WRONG: Storing in Dropbox
~/Dropbox/prod-env-files/.env

# ❌ WRONG: Email attachment
"Subject: Prod credentials for new developer"
```

**Right way:** Use proper secret management!

```bash
# ✅ GOOD: Grant IAM access
aws iam attach-user-policy \
  --user-name new-developer \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlySecrets

# ✅ GOOD: Share via 1Password/LastPass
# ✅ GOOD: Use temporary credentials
```

## The Ultimate Secrets Checklist ✅

**Before going to production:**

- [ ] All secrets in `.gitignore`
- [ ] No secrets in environment variables (use secret manager)
- [ ] Secrets encrypted at rest
- [ ] IAM policies limit who can access secrets
- [ ] Audit logging enabled
- [ ] Rotation schedule defined
- [ ] Secrets validated on startup
- [ ] Error handling doesn't leak secrets
- [ ] Logs don't contain secrets
- [ ] No secrets in container images

**If you leaked a secret:**

- [ ] Rotate it IMMEDIATELY (< 5 minutes)
- [ ] Check CloudTrail/logs for unauthorized access
- [ ] Notify security team
- [ ] Update incident runbook
- [ ] Review how it happened
- [ ] Add preventive measures

## The Bottom Line 💡

Secrets management isn't just about security - it's about sleeping at night without $3K AWS bills!

**The essentials:**
1. **Never commit secrets** to Git (use `.gitignore`)
2. **Use environment variables** for development
3. **Use secret managers** for production (AWS, Vault, K8s + ESO)
4. **Rotate secrets** regularly (30-90 days)
5. **Monitor access** (audit logs)
6. **Validate on startup** (fail fast if missing)

**The truth about secrets:**

It's not "hide secrets in environment variables" - it's "store secrets in encrypted, audited, rotated secret managers with proper IAM controls!"

**After 7 years deploying production applications**, I learned this: The $3K AWS bill taught me more about secrets management than any course! Don't learn the hard way - use proper secret management from day one! 🔐

You don't need Enterprise™ solutions from day one - start with environment variables + `.gitignore`. Graduate to AWS Secrets Manager when you go to production! 🚀

## Your Action Plan 🎯

**Right now:**
1. Check if `.env` is in `.gitignore`
2. Search GitHub for accidental commits: "remove password"
3. Audit current secrets management
4. If you find exposed secrets: ROTATE IMMEDIATELY!

**This week:**
1. Move all secrets to environment variables
2. Create `.env.example` for team
3. Set up AWS Secrets Manager (or equivalent)
4. Update deployment to fetch from secret manager

**This month:**
1. Enable encryption at rest (K8s/AWS)
2. Set up automatic secret rotation
3. Configure audit logging
4. Train team on secret management
5. Create incident response runbook

## Resources Worth Your Time 📚

**Tools I use daily:**
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) - Managed secrets with rotation
- [HashiCorp Vault](https://www.vaultproject.io/) - Self-hosted secret management
- [External Secrets Operator](https://external-secrets.io/) - Sync secrets to K8s
- [git-secrets](https://github.com/awslabs/git-secrets) - Prevent committing secrets

**Reading:**
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [12-Factor App: Config](https://12factor.net/config)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)

**Real talk:** The best secret management is the one that prevents you from committing secrets in the first place!

---

**Committed secrets to Git?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - we've all been there!

**Want to see my production setup?** Check out my [GitHub](https://github.com/kpanuragh) - secret management patterns from real projects!

*Now go forth and manage secrets like a pro!* 🔐✨

---

**P.S.** If your AWS credentials are in your code, you're not writing software - you're playing Russian roulette with your credit card! Use secret managers! 💳

**P.P.S.** That $3K AWS bill? Best investment in my career. Now I'm paranoid about secrets management, and that's a GOOD thing. Learn from my mistake - don't commit secrets! 😅
