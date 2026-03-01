---
title: "AWS Cognito: Stop Rolling Your Own Auth (I Learned This the Hard Way) 🔐⚡"
date: "2026-03-01"
excerpt: "I once spent three weeks building a custom JWT auth system for our serverless backend. It had refresh token rotation, device tracking, forgot-password flows, and at least four security vulnerabilities I didn't know about until a penetration tester found them. Then someone showed me Cognito. I cried a little."
tags: ["aws", "serverless", "cognito", "cloud", "authentication"]
featured: true
---

# AWS Cognito: Stop Rolling Your Own Auth (I Learned This the Hard Way) 🔐⚡

**Unpopular opinion:** The worst thing you can do in a serverless app is build your own authentication system. The second worst thing is not knowing AWS Cognito exists.

I know this because I did both. Three weeks. Custom JWT issuance, token refresh logic, password reset emails, rate limiting, session invalidation. I was *very proud* of it. Our penetration tester was less impressed — she found a token replay vulnerability in about twenty minutes.

The next morning I ripped it all out and deployed Cognito. Two hours. Done.

**When architecting on AWS, I learned** that authentication is the exact category of problem where you should absolutely not be clever. Let someone else handle it. AWS spends more money on Cognito security than your entire engineering payroll. Outsource this problem immediately.

## What Is Cognito and Why Does It Exist? 🤔

Cognito is AWS's managed authentication and authorization service. It handles:

- **User registration and login** — email/password, social login (Google, Facebook, Apple), SAML SSO
- **JWT token management** — issues ID tokens, access tokens, refresh tokens automatically
- **MFA** — SMS, TOTP, or email-based second factors
- **Password policies** — complexity rules, expiration, breach detection
- **Token refresh** — rotating refresh tokens handled for you
- **User management** — account verification, password reset, admin disable

And it does all of this at AWS scale. 50,000 monthly active users are free. After that, it's $0.0055 per MAU — so 100k users costs about $275/month. For a managed auth system that's SOC 2 compliant. That's cheaper than the AWS support plan, let alone building it yourself.

## User Pools vs. Identity Pools: The Confusion Trap 🪤

This is the first thing that confuses everyone, including me for an embarrassingly long time.

**User Pool** = where your users live. Think of it as a user database + auth server combined.

- Users register, verify email, set passwords here
- You get JWTs back after login
- Your API Lambdas verify those JWTs

**Identity Pool** = converts Cognito JWTs (or Google, Facebook, etc.) into temporary AWS credentials.

- Use this when users need to directly call AWS services (e.g., upload files directly to S3)
- Gives users scoped IAM credentials via STS
- Not needed if users only talk to your API

**My rule of thumb:**

```
Just need auth for your API?         → User Pool only
Users need to call AWS directly?     → User Pool + Identity Pool
```

In production, I've deployed e-commerce backends that only use User Pools. The mobile app authenticates with Cognito, gets a JWT, sends it to API Gateway, Lambda verifies it, done. Identity Pools only entered the picture when we let users upload product photos directly to S3 — then they needed scoped S3 credentials.

## The Setup That Actually Works 🏗️

Here's the architecture that saved us from ourselves:

```
Mobile App / Browser
  → POST /auth/login → Cognito User Pool
    → Returns { idToken, accessToken, refreshToken }
      → API calls → API Gateway (with Cognito Authorizer)
        → Lambda (token already verified by API Gateway)
          → Your business logic, never touches auth
```

The key insight: **API Gateway can verify Cognito JWTs for you.** Zero Lambda code for auth.

```yaml
# SAM / serverless.yml
UserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: my-app-users
    AutoVerifiedAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 12
        RequireUppercase: true
        RequireNumbers: true

UserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    UserPoolId: !Ref UserPool
    GenerateSecret: false        # false for web/mobile (can't store secrets)
    ExplicitAuthFlows:
      - ALLOW_USER_SRP_AUTH      # Secure Remote Password — never send plaintext passwords
      - ALLOW_REFRESH_TOKEN_AUTH
    AccessTokenValidity: 1       # hours
    RefreshTokenValidity: 30     # days
```

```yaml
# API Gateway authorizer — one setting, all your Lambdas are protected
CognitoAuthorizer:
  Type: AWS::ApiGateway::Authorizer
  Properties:
    Type: COGNITO_USER_POOLS
    ProviderARNs:
      - !GetAtt UserPool.Arn
    IdentitySource: method.request.header.Authorization
```

That's it. Every Lambda in your API is now auth-protected with zero code.

## Reading User Data in Lambda ⚡

After API Gateway verifies the JWT, your Lambda gets the user's claims for free:

```javascript
export const handler = async (event) => {
  // No JWT verification code needed — API Gateway did it
  const { sub, email, 'custom:role': role } = event.requestContext.authorizer.claims;

  // sub is the unique Cognito user ID — use this as your FK in the database
  const orders = await db.orders.findAll({ where: { userId: sub } });

  return {
    statusCode: 200,
    body: JSON.stringify(orders)
  };
};
```

**A serverless pattern that saved us:** We store the Cognito `sub` (user ID) as the primary key across all our tables. Never store usernames or emails as FKs — they can change. The `sub` is immutable and unique per user. This one decision saved us a migration nightmare when a customer wanted to change their email.

## Social Login in 20 Minutes (Not 3 Days) 🔗

Adding Google login to a custom auth system is genuinely painful. With Cognito, it's configuration:

```json
{
  "UserPoolId": "us-east-1_abc123",
  "IdentityProviders": [
    {
      "ProviderName": "Google",
      "ProviderType": "Google",
      "ProviderDetails": {
        "client_id": "your-google-client-id",
        "client_secret": "your-google-secret",
        "authorize_scopes": "email profile openid"
      },
      "AttributeMapping": {
        "email": "email",
        "name": "name",
        "picture": "picture"
      }
    }
  ]
}
```

Cognito handles the OAuth2 dance, token exchange, user creation (or linking if email matches), and returns you a regular Cognito JWT. Your Lambda doesn't care if the user authenticated with a password or Google — same JWT, same `sub`, same database query.

**In production, I've deployed** this for an e-commerce platform where 60% of users signed up via Google. The alternative — building OAuth2 ourselves — would have taken two weeks and probably introduced three bugs in the token exchange flow. It took forty minutes with Cognito.

## Custom Attributes: Cognito's Hidden Superpower 🦸

You can add custom attributes to user tokens that propagate through your entire system:

```javascript
// When creating a user (admin or post-registration trigger)
await cognito.adminUpdateUserAttributes({
  UserPoolId: process.env.USER_POOL_ID,
  Username: userId,
  UserAttributes: [
    { Name: 'custom:plan', Value: 'pro' },
    { Name: 'custom:tenant_id', Value: 'acme-corp' },
    { Name: 'custom:role', Value: 'admin' }
  ]
}).promise();
```

These custom attributes appear in the JWT and in your Lambda's claims. Your entire authorization model — "is this user a pro subscriber?", "which tenant do they belong to?" — flows through the token automatically. No database lookup on every request.

**Gotcha:** Custom attributes are read-only from the client by default. Users can't forge their own `plan: pro`. Good.

## Lambda Triggers: Cognito's Escape Hatch 🚪

Cognito isn't magic — sometimes you need custom logic. Lambda triggers let you hook into auth flows:

```
Pre Sign-up          → Validate email domains, block disposable emails
Post Confirmation    → Create a database record for the new user
Pre Token Generation → Add custom claims to every JWT
Post Authentication  → Log logins, update last-seen
Custom Message       → Customize verification email content
```

The one I use on every project:

```javascript
// Pre Token Generation trigger — runs every time a token is issued
export const handler = async (event) => {
  // Add custom claims from your database to every JWT
  const user = await db.users.findOne({ cognitoId: event.userName });

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        plan: user.subscriptionPlan,        // "free" | "pro" | "enterprise"
        storeId: user.defaultStoreId,       // for multi-tenant apps
        onboardingComplete: String(user.onboardingComplete)
      }
    }
  };

  return event;
};
```

Now every JWT has your business data baked in. Lambdas make authorization decisions without touching the database. At Black Friday scale, this matters.

## Gotchas That Will Ruin Your Day 🔥

**Gotcha 1: Refresh tokens don't rotate by default**

By default, Cognito refresh tokens don't rotate. If one is stolen, it's valid for 30 days. Enable rotation:

```json
{
  "PreventUserExistenceErrors": "ENABLED",
  "EnableTokenRevocation": true
}
```

**Gotcha 2: The JWT clock skew problem**

Cognito JWTs expire based on the issuer's clock. If your Lambda server clock is even slightly off, you'll get spurious "token expired" errors. Always use `Date.now()` from AWS infrastructure, not hardcoded timestamps.

**Gotcha 3: User pool App Client secrets**

If you create a Cognito App Client with a secret (for server-to-server), you must include a `SECRET_HASH` with every auth call. Forget this and you get a mysterious `NotAuthorizedException`. For web and mobile apps, just don't generate a secret — they can't safely store it anyway.

```javascript
// Computing the secret hash (only if your client has a secret)
const crypto = require('crypto');
const secretHash = crypto
  .createHmac('sha256', CLIENT_SECRET)
  .update(username + CLIENT_ID)
  .digest('base64');
```

**Gotcha 4: Cognito Hosted UI has its own domain**

The managed login UI lives on `your-domain.auth.us-east-1.amazoncognito.com`. You can use a custom domain, but it requires an ACM certificate in `us-east-1` specifically, even if your app is in another region. Burned an afternoon on this.

**Gotcha 5: Deleting a User Pool is instant and irreversible**

Yes. All users gone. No "are you sure?" dialog. I have not personally done this but I have worked with someone who did, and the silence in the Slack channel was deafening.

## Cost Reality: Cheaper Than You Think 💰

```
Monthly Active Users → Cognito Cost
0 – 50,000          → $0.00 (free tier)
50,001 – 100,000    → ~$0.0055/MAU = ~$275/month
100,001 – 1,000,000 → $0.0046/MAU
1,000,001+          → $0.00325/MAU
```

For our e-commerce backend with 30,000 monthly active users: **$0/month**.

Compare that to the engineering cost of maintaining a custom auth system: vulnerability patching, MFA implementation, refresh token rotation, compliance audits. At $0, Cognito wins before the analysis is even finished.

## TL;DR 💡

Rolling your own auth is a trap. You'll spend weeks building something that's less secure than what AWS gives you for free.

**Start here:**
1. Create a User Pool (5 minutes in the console)
2. Set up an App Client with SRP auth (no stored secrets for public clients)
3. Add a Cognito Authorizer to API Gateway (one setting protects all routes)
4. Store `sub` as your user FK everywhere
5. Use the Pre Token Generation trigger for custom claims

What you get: registration, login, MFA, social login, password reset, JWT issuance, token refresh, and logout — all handled, all compliant, all $0 until you hit 50k users.

**In production, I've deployed** this pattern across multiple serverless e-commerce backends. The time savings — versus building auth ourselves — is measured in weeks per project. The security improvement is immeasurable (in both senses of the word — very good, and also I genuinely can't measure all the vulnerabilities we avoided).

Stop writing auth code. Let AWS be paranoid about security on your behalf. They're very good at it. 🔐

---

**Building a serverless backend and want to talk through the auth architecture?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to nerd out about this stuff.

**Want to see the full Cognito + API Gateway + Lambda setup?** Check [GitHub](https://github.com/kpanuragh) for the complete IaC template.

*Now go delete that `users` table with the `password_hash` column.* 🗑️

---

**P.S.** Cognito has a Hosted UI that handles the entire login flow in a browser without you writing a single line of frontend code. It's not the prettiest thing in the world, but for internal tools and MVPs it means you're protected from day one. Ugly and secure beats beautiful and breachable every time. 🛡️

**P.P.S.** If you're building a multi-tenant SaaS, look into Cognito's identity pools with role mapping. You can give different users different IAM roles based on their Cognito group — so your "admin" users automatically get write access to your S3 buckets and your "viewer" users get read-only. IAM-based multi-tenancy, handled by Cognito, for free. Mind-blowing when you first see it work. 🤯
