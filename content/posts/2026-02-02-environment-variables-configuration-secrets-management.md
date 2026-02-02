---
title: "Environment Variables: Stop Hardcoding Secrets Like It's 1995 🔐"
date: "2026-02-02"
excerpt: "Committing API keys to Git? Hardcoding database passwords? Let's talk about managing configs and secrets the RIGHT way - because 'It works on my machine' isn't a deployment strategy!"
tags: ["devops", "security", "deployment", "configuration"]
featured: true
---

# Environment Variables: Stop Hardcoding Secrets Like It's 1995 🔐

**Real talk:** Early in my career, I deployed a Node.js app to production with the database password hardcoded in the source. Everything worked great! Then a junior dev accidentally pushed the entire codebase to a public GitHub repo. Within 3 hours, our database was wiped clean and replaced with a ransom note. 😱

My boss asked, "Why was the password in the code?" I had no good answer.

Welcome to the world where environment variables aren't optional - they're survival!

## What's an Environment Variable Anyway? 🤔

Think of environment variables like sticky notes on your server:

**Without env vars (Nightmare Mode):**
```javascript
// config.js - DISASTER WAITING TO HAPPEN!
module.exports = {
    database: {
        host: 'prod-db.company.com',
        user: 'admin',
        password: 'SuperSecret123!',  // Committed to Git! 💀
        port: 5432
    },
    apiKeys: {
        stripe: 'sk_live_51H7xKj2eZvKYlo2C...',  // In source control!
        sendgrid: 'SG.xxxxxxxxxxxxxxxxxxx',     // Everyone can see this!
        aws: 'AKIAIOSFODNN7EXAMPLE'              // Please hack me!
    }
};
```

**What's wrong?**
- Secrets in source control (Git history NEVER forgets!)
- Same config for dev/staging/prod (good luck debugging!)
- Can't change passwords without redeploying code
- Security audit = instant failure

**With env vars (Professional Mode):**
```javascript
// config.js - MUCH BETTER!
module.exports = {
    database: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,  // Injected at runtime!
        port: process.env.DB_PORT || 5432
    },
    apiKeys: {
        stripe: process.env.STRIPE_SECRET_KEY,
        sendgrid: process.env.SENDGRID_API_KEY,
        aws: process.env.AWS_ACCESS_KEY_ID
    },
    environment: process.env.NODE_ENV || 'development'
};
```

**.env file (NOT committed to Git!):**
```bash
# .env - This file is in .gitignore!
NODE_ENV=production
DB_HOST=prod-db.company.com
DB_USER=app_user
DB_PASSWORD=ActuallySecurePassword123!
DB_PORT=5432

STRIPE_SECRET_KEY=sk_live_51H7xKj2eZvKYlo2C...
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxx
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
```

**Translation:** Code knows WHAT it needs. Environment provides the VALUES! 🎯

## The Horror Story That Taught Me Everything 👻

After deploying my Laravel e-commerce backend, here's what went wrong:

**Monday 9 AM:**
```bash
# Me, deploying to staging
git push staging main
# App crashes immediately
# Error: "Database connection failed"
# Why? Because I used production DB credentials locally!
```

**Monday 10 AM:**
```bash
# Me, "fixing" it with hardcoded staging credentials
const DB_HOST = 'staging-db.company.com';  // Commit this!
git commit -m "Fix staging DB"
git push staging main
# Works! Ship it!
```

**Monday 2 PM:**
```bash
# Me, deploying the "fix" to production
git push production main
# Production now connects to STAGING database! 💥
# Real orders writing to staging DB!
# Staging overwrites production data!
# CEO's "test order" for $0.01 overwrites $50,000 real order!
```

**Monday 3 PM:** Resume updated. LinkedIn status: "Open to opportunities" 😅

**What I should have done:**
```bash
# staging/.env
NODE_ENV=staging
DB_HOST=staging-db.company.com
DB_USER=staging_user
DB_PASSWORD=StagingPass123

# production/.env
NODE_ENV=production
DB_HOST=prod-db.company.com
DB_USER=prod_user
DB_PASSWORD=ProductionSecurePass456
```

**The lesson:** Same code, different configs. Environment variables make this possible!

## The Right Way to Handle Env Vars 🚀

### Method #1: .env Files (Local Development)

**For local dev, I use dotenv:**

```bash
npm install dotenv
```

```javascript
// Load env vars at the very start of your app
require('dotenv').config();

// Now process.env has all your vars!
console.log(`Running in ${process.env.NODE_ENV} mode`);
console.log(`Database: ${process.env.DB_HOST}`);
```

**Project structure:**
```
my-app/
  ├── .env                  # Local config (in .gitignore!)
  ├── .env.example          # Template (committed to Git)
  ├── .env.staging          # Staging config (NOT in Git!)
  ├── .env.production       # Production config (NOT in Git!)
  ├── .gitignore            # Must include .env*
  └── src/
      └── config.js
```

**.env.example (committed):**
```bash
# Copy this to .env and fill in your values!
NODE_ENV=development
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=5432

STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG...
AWS_ACCESS_KEY_ID=AKIA...
```

**.gitignore (CRITICAL!):**
```bash
# Never commit secrets!
.env
.env.local
.env.*.local
.env.staging
.env.production

# But DO commit the template
!.env.example
```

**The workflow:**
1. Clone repo
2. Copy `.env.example` to `.env`
3. Fill in your actual credentials
4. Never commit `.env`!

### Method #2: Docker Env Files

**When deploying Laravel/Node.js apps with Docker:**

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]
# NO hardcoded secrets in Dockerfile!
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    env_file:
      - .env.production  # Load env vars from file
    environment:
      # Or define them directly
      NODE_ENV: production
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  postgres:
    image: postgres:14
    env_file:
      - .env.production
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

**Running it:**
```bash
# Development
docker-compose up

# Production (different env file)
docker-compose --env-file .env.production up -d
```

**In production, I've learned:** Docker + env files = clean separation of code and config! 🎯

### Method #3: CI/CD Secrets (GitHub Actions)

**After countless deployments, here's my GitHub Actions setup:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      env:
        # Inject secrets from GitHub!
        DB_HOST: ${{ secrets.TEST_DB_HOST }}
        DB_USER: ${{ secrets.TEST_DB_USER }}
        DB_PASSWORD: ${{ secrets.TEST_DB_PASSWORD }}
      run: npm test

    - name: Deploy to production
      env:
        # Production secrets
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
      run: |
        echo "Deploying with environment: production"
        npm run deploy:prod
```

**Setting GitHub Secrets:**
1. Go to repo → Settings → Secrets → Actions
2. Click "New repository secret"
3. Add `DB_PASSWORD`, `STRIPE_SECRET_KEY`, etc.
4. Use in workflows as `${{ secrets.SECRET_NAME }}`

**Why this is beautiful:**
- ✅ Secrets never in code
- ✅ Encrypted at rest
- ✅ Masked in logs (GitHub redacts them!)
- ✅ Team members can't see secret values (only you can)
- ✅ Easy to rotate without code changes

**A CI/CD pipeline that saved our team:** I set this up once, and now deploys are secure by default! 🔒

### Method #4: AWS Parameter Store / Secrets Manager

**For production AWS deployments, I use AWS Secrets Manager:**

```javascript
// config/secrets.js
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });

async function getSecret(secretName) {
    try {
        const data = await secretsManager.getSecretValue({
            SecretId: secretName
        }).promise();

        if (data.SecretString) {
            return JSON.parse(data.SecretString);
        }
    } catch (err) {
        console.error('Error fetching secret:', err);
        throw err;
    }
}

// Usage
async function loadConfig() {
    const dbCreds = await getSecret('prod/database/credentials');
    const apiKeys = await getSecret('prod/api/keys');

    return {
        database: {
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password
        },
        stripe: apiKeys.stripe,
        sendgrid: apiKeys.sendgrid
    };
}

module.exports = { loadConfig };
```

**Create secret via AWS CLI:**
```bash
# Store database credentials
aws secretsmanager create-secret \
    --name prod/database/credentials \
    --secret-string '{
        "host": "prod-db.company.com",
        "username": "app_user",
        "password": "SuperSecurePassword123!"
    }'

# Store API keys
aws secretsmanager create-secret \
    --name prod/api/keys \
    --secret-string '{
        "stripe": "sk_live_...",
        "sendgrid": "SG...",
        "aws": "AKIA..."
    }'
```

**Benefits:**
- ✅ Centralized secret management
- ✅ Automatic secret rotation
- ✅ Audit logs (who accessed what, when)
- ✅ Fine-grained IAM permissions
- ✅ Encrypted at rest and in transit

**Cost:** ~$0.40/secret/month + $0.05 per 10,000 API calls

**When architecting serverless backends, I learned:** AWS Secrets Manager is worth the cost for production! 💰

### Method #5: Kubernetes Secrets

**For Kubernetes deployments:**

```bash
# Create secret from literal values
kubectl create secret generic app-secrets \
    --from-literal=DB_PASSWORD=SuperSecret123 \
    --from-literal=STRIPE_KEY=sk_live_...

# Or from a file
kubectl create secret generic app-secrets \
    --from-env-file=.env.production
```

**Use in deployment:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: my-app:latest
        env:
        - name: DB_HOST
          value: "postgres.default.svc.cluster.local"
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: DB_PASSWORD
        - name: STRIPE_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: STRIPE_KEY
```

**Secrets are base64 encoded (NOT encrypted!):**
```bash
# Decode a secret (this is why K8s secrets aren't enough!)
kubectl get secret app-secrets -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
# Outputs: SuperSecret123

# For real encryption, use Sealed Secrets or External Secrets Operator!
```

## Common Mistakes (I Made Them All) 🚨

### Mistake #1: Committing .env to Git

**Bad:**
```bash
git add .
git commit -m "Add config"
# .env is now in Git history FOREVER!
```

**Good:**
```bash
# BEFORE your first commit
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "!.env.example" >> .gitignore

git add .gitignore
git commit -m "Add .gitignore"
```

**Already committed secrets?** You need to:
```bash
# Remove from history (NUCLEAR OPTION!)
git filter-branch --index-filter \
    'git rm --cached --ignore-unmatch .env' HEAD

# Force push (dangerous!)
git push origin --force --all

# THEN rotate ALL compromised secrets!
# Change every password, regenerate every API key!
```

**Docker taught me the hard way:** Once secrets are in Git, assume they're public! Rotate immediately! 🔄

### Mistake #2: Logging Secrets

**Bad:**
```javascript
console.log('Starting app with config:', {
    dbPassword: process.env.DB_PASSWORD,  // DON'T LOG THIS!
    stripeKey: process.env.STRIPE_SECRET_KEY  // OR THIS!
});
```

**Good:**
```javascript
console.log('Starting app with config:', {
    dbHost: process.env.DB_HOST,
    dbUser: process.env.DB_USER,
    dbPassword: '***REDACTED***',  // Mask sensitive values
    stripeKey: '***REDACTED***',
    nodeEnv: process.env.NODE_ENV
});
```

**Better - Use a config logger:**
```javascript
function logConfig(config) {
    const SENSITIVE_KEYS = ['password', 'secret', 'key', 'token', 'api'];

    const sanitized = {};
    for (const [key, value] of Object.entries(config)) {
        const isSensitive = SENSITIVE_KEYS.some(s =>
            key.toLowerCase().includes(s)
        );
        sanitized[key] = isSensitive ? '***REDACTED***' : value;
    }

    console.log('Config loaded:', sanitized);
}

logConfig(process.env);
// Output: { DB_PASSWORD: '***REDACTED***', DB_HOST: 'localhost', ... }
```

### Mistake #3: Not Validating Environment Variables

**Bad:**
```javascript
// App crashes at random points with cryptic errors
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// If STRIPE_SECRET_KEY is undefined, this fails silently!
```

**Good:**
```javascript
// Validate env vars at startup
function validateEnv() {
    const required = [
        'DB_HOST',
        'DB_USER',
        'DB_PASSWORD',
        'STRIPE_SECRET_KEY',
        'SENDGRID_API_KEY',
        'NODE_ENV'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('FATAL: Missing required environment variables:');
        missing.forEach(key => console.error(`  - ${key}`));
        process.exit(1);  // Fail fast!
    }

    console.log('✅ All required environment variables present');
}

// Call at app startup
validateEnv();
```

**Even better - Use a validation library:**
```javascript
const Joi = require('joi');

const envSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'staging', 'production')
        .required(),
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USER: Joi.string().required(),
    DB_PASSWORD: Joi.string().min(8).required(),
    STRIPE_SECRET_KEY: Joi.string()
        .pattern(/^sk_/)
        .required(),
}).unknown(true);

const { error, value } = envSchema.validate(process.env);

if (error) {
    console.error('Environment validation failed:', error.message);
    process.exit(1);
}

console.log('✅ Environment validated successfully');
module.exports = value;
```

### Mistake #4: Using Default Values in Production

**Bad:**
```javascript
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';  // YIKES!
```

**Why it's bad:** If `JWT_SECRET` is undefined in production, you're using `'default-secret'` which every hacker knows!

**Good:**
```javascript
const PORT = process.env.PORT || 3000;  // Default port is OK

// But NEVER default security-critical values!
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required!');
}
```

## The Perfect .env Setup (Copy This!) 🎯

**My template for every project:**

```bash
# .env.example - Commit this to Git!

# ──────────────────────────────────────────────────
# Application
# ──────────────────────────────────────────────────
NODE_ENV=development
APP_NAME=my-awesome-app
APP_URL=http://localhost:3000
PORT=3000
LOG_LEVEL=debug

# ──────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp_dev
DB_USER=postgres
DB_PASSWORD=your_password_here

# ──────────────────────────────────────────────────
# Redis Cache
# ──────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ──────────────────────────────────────────────────
# Authentication
# ──────────────────────────────────────────────────
JWT_SECRET=generate_a_long_random_string
JWT_EXPIRY=7d
SESSION_SECRET=generate_another_random_string

# ──────────────────────────────────────────────────
# External APIs
# ──────────────────────────────────────────────────
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

SENDGRID_API_KEY=SG...
SENDGRID_FROM_EMAIL=noreply@example.com

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=my-app-uploads

# ──────────────────────────────────────────────────
# Feature Flags
# ──────────────────────────────────────────────────
ENABLE_SIGNUP=true
ENABLE_PAYMENTS=false
MAINTENANCE_MODE=false
```

**README.md setup instructions:**
```markdown
## Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual values:
   ```bash
   # Generate secure random strings
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. NEVER commit `.env` to Git!

4. For production, use AWS Secrets Manager or similar.
```

## The Security Checklist 🛡️

Before deploying:

- [ ] `.env` is in `.gitignore`
- [ ] No secrets hardcoded in source
- [ ] All secrets use env vars
- [ ] Required env vars are validated at startup
- [ ] Secrets are never logged
- [ ] Different configs for dev/staging/prod
- [ ] Secrets are encrypted at rest (AWS Secrets Manager)
- [ ] Team uses secret management tool (not shared .env files)
- [ ] CI/CD uses encrypted secrets (GitHub Secrets, etc.)
- [ ] Secrets are rotated regularly

## Tools I Actually Use 🔧

**1. dotenv** - Local development
```bash
npm install dotenv
```

**2. dotenv-vault** - Encrypted .env files for teams
```bash
npx dotenv-vault new
npx dotenv-vault push
```

**3. AWS Secrets Manager** - Production secrets

**4. GitHub Secrets** - CI/CD secrets

**5. 1Password CLI** - Team secret sharing
```bash
# Store secret in 1Password
op create item --category=login \
    --title="Production DB" \
    --field="password=SuperSecret123"

# Retrieve in scripts
export DB_PASSWORD=$(op read "op://Production/Database/password")
```

## Real-World DevOps Workflow 🚀

**How I manage configs across environments:**

```bash
my-app/
  ├── .env.example          # Template (Git)
  ├── .env                  # Local dev (NOT in Git)
  ├── config/
  │   ├── development.js    # Dev config (Git)
  │   ├── staging.js        # Staging config (Git)
  │   └── production.js     # Prod config (Git)
  └── .github/
      └── workflows/
          └── deploy.yml    # Uses GitHub Secrets
```

**config/production.js:**
```javascript
// Code is in Git, but references env vars (which are NOT in Git)
module.exports = {
    app: {
        name: process.env.APP_NAME,
        url: process.env.APP_URL,
        env: 'production'
    },
    database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: true,  // Always use SSL in production
        pool: { min: 2, max: 10 }
    },
    logging: {
        level: 'info',  // Less verbose in production
        pretty: false    // JSON logs for log aggregators
    }
};
```

**Deployment workflow:**
1. Code is in Git (no secrets)
2. Secrets are in AWS Secrets Manager
3. CI/CD fetches secrets at deploy time
4. App loads config from environment
5. Never store secrets in code!

## The Bottom Line 💡

Environment variables aren't just "best practice" - they're the difference between:
- ✅ Secure deployments vs. 💀 Public data breaches
- ✅ Easy config management vs. 😱 Deployment nightmares
- ✅ Sleep at night vs. 🚨 3 AM emergency calls

**The golden rules:**
1. **NEVER commit secrets to Git** (seriously, never!)
2. **Use different configs for different environments**
3. **Validate env vars at startup** (fail fast!)
4. **Never log sensitive values**
5. **Use a secret manager for production** (AWS, HashiCorp Vault, etc.)
6. **Rotate secrets regularly**

**After countless deployments**, I learned this: "It works on my machine" stops being funny when production is down because of config issues! Environment variables are how you make "works on my machine" become "works everywhere!" 🌍

You don't need perfect security from day one - but you DO need to stop hardcoding secrets! Start with `.env` files, graduate to secret managers! 🎓

## Your Action Plan 🎯

**Right now:**
1. Add `.env` to `.gitignore` (if not already)
2. Create `.env.example` template
3. Move ALL secrets from code to `.env`
4. Validate required env vars at startup

**This week:**
1. Set up different configs for dev/staging/prod
2. Add env var validation library (Joi/Yup)
3. Audit code for hardcoded secrets
4. Set up GitHub Secrets for CI/CD

**This month:**
1. Migrate production secrets to AWS Secrets Manager
2. Implement secret rotation
3. Add monitoring for missing env vars
4. Document env setup in README
5. Celebrate never hardcoding secrets again! 🎉

## Resources Worth Your Time 📚

**Tools:**
- [dotenv](https://github.com/motdotla/dotenv) - Load .env files
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [HashiCorp Vault](https://www.vaultproject.io/) - Enterprise secret management

**Reading:**
- [The Twelve-Factor App](https://12factor.net/config) - Config best practices
- [OWASP Secrets Management](https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password)

**Real talk:** The best secret management is the one you'll actually use! Start simple with `.env`, upgrade as needed!

---

**Still committing secrets to Git?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk about secure deployment strategies!

**Want to see my config setups?** Check out my [GitHub](https://github.com/kpanuragh) - I've learned these lessons the hard way so you don't have to!

*Now go forth and stop hardcoding secrets!* 🔐✨

---

**P.S.** If you're thinking "I'll just encrypt my secrets in Git" - don't! That's how you end up with the decryption key... also in Git! 🤦‍♂️

**P.P.S.** I once spent 6 hours debugging why staging was broken. Turns out I was using production DB credentials in staging. Environment variables would've prevented this. Learn from my pain! 😅
