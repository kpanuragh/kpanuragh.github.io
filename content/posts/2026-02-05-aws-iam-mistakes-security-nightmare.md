---
title: "AWS IAM: Stop Giving Your Lambda Function God Mode 🔑👑"
date: "2026-02-05"
excerpt: "Your Lambda has full admin access 'just to be safe'? Your access keys are hardcoded? After 7 years of AWS deployments, here are the IAM mistakes that will haunt you at 3 AM when you get the security breach notification!"
tags: ["aws", "cloud", "security", "iam"]
featured: true
---

# AWS IAM: Stop Giving Your Lambda Function God Mode 🔑👑

**Real talk:** The first time I deployed a Lambda function, I got a permissions error. "Access Denied." I Googled for 5 minutes, found a Stack Overflow answer that said "just give it AdministratorAccess," and boom - it worked! 🎉

Three months later, our security audit found a Lambda function with full AWS account access that only needed to read from one S3 bucket. The auditor asked, "Is this a joke?" Narrator: It was not a joke. 😅

Welcome to AWS IAM - where one wrong policy turns your carefully architected system into a security disaster waiting to happen!

## What Even Is IAM? (Beyond "AWS Permissions") 🤔

**IAM = Identity and Access Management** - The system that controls WHO can do WHAT in your AWS account.

**Think of it like:** A nightclub with bouncers, VIP lists, and wristbands. IAM is all three!

**Real components:**
- **Users:** Individual people (you, your team)
- **Roles:** Identities for services (Lambda, EC2, etc.)
- **Policies:** JSON rules defining permissions
- **Groups:** Collections of users with similar access

**Why IAM is confusing:** JSON policies with 10 different effect types, conditions, wildcards, and AWS's "documentation" that assumes you have a PhD in cloud security! 🤯

**Why IAM is critical:** One wrong permission = data breach, compliance violation, or unexpected $10K bill!

## The "AdministratorAccess" Horror Story 💀

When architecting our first serverless backend, I needed a Lambda to upload processed images to S3. Simple, right?

**What I lazily did:**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }]
}
```

**Translation:** "This Lambda can do LITERALLY ANYTHING in our AWS account!"

**What I ACTUALLY needed:**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::my-images-bucket/processed/*"
  }]
}
```

**Translation:** "This Lambda can ONLY upload files to ONE specific folder in ONE specific S3 bucket!"

**The difference:**

```
First policy:
- Delete all S3 buckets? ✅ Allowed
- Terminate all EC2 instances? ✅ Allowed
- Drop all RDS databases? ✅ Allowed
- Create new IAM admin users? ✅ Allowed
- Do the ONE thing it needs to do? ✅ Allowed

Second policy:
- Upload to specific S3 folder? ✅ Allowed
- Literally anything else? ❌ Denied
```

**What happened:** A security researcher found an SSRF vulnerability in our image processing. With the lazy policy, they could've nuked our entire AWS account. With the strict policy? They could upload some cat pictures to one folder. Big difference! 🐱

**In production, I've deployed** hundreds of Lambda functions. Every single one has a custom IAM role with ONLY the permissions it needs. Nothing more, nothing less! 🎯

## IAM Mistake #1: Hardcoded Access Keys in Code 🚨

**The disaster waiting to happen:**

```javascript
// NEVER DO THIS!
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',     // Hardcoded! 😱
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'  // Committed to Git!
});

exports.handler = async (event) => {
  return await s3.listBuckets().promise();
};
```

**What happens:**
1. Code gets pushed to GitHub (even if it's "private")
2. GitHub's secret scanner finds it (sometimes)
3. Or worse - a security researcher finds it first
4. They download your entire S3, spin up crypto miners on EC2, or ransomware your databases
5. You wake up to a $50,000 AWS bill and a compliance nightmare

**Real example from 2020:** Company hardcoded keys in a public repo. Someone found them, spun up 100 p3.16xlarge instances (GPU servers), and mined cryptocurrency. Bill: **$78,000 in 3 days**! 💸

**The CORRECT approach - Use IAM Roles:**

```javascript
// Lambda automatically gets credentials from its IAM role!
const AWS = require('aws-sdk');
const s3 = new AWS.S3();  // No credentials needed!

exports.handler = async (event) => {
  // AWS SDK automatically uses the Lambda's execution role
  return await s3.listBuckets().promise();
};
```

**IAM Role for Lambda:**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:ListAllMyBuckets",
    "Resource": "*"
  }]
}
```

**How it works:**
- Lambda assumes its IAM role when it starts
- AWS provides temporary credentials (rotated automatically!)
- No hardcoded keys, no Git commits, no security nightmares!

**For EC2 instances - Use Instance Profiles:**

```bash
# Create role for EC2
aws iam create-role \
  --role-name ec2-s3-reader \
  --assume-role-policy-document file://ec2-trust-policy.json

# Attach policy
aws iam attach-role-policy \
  --role-name ec2-s3-reader \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Create instance profile
aws iam create-instance-profile --instance-profile-name ec2-s3-reader

# Add role to instance profile
aws iam add-role-to-instance-profile \
  --instance-profile-name ec2-s3-reader \
  --role-name ec2-s3-reader

# Launch EC2 with instance profile
aws ec2 run-instances \
  --instance-type t3.micro \
  --iam-instance-profile Name=ec2-s3-reader \
  --image-id ami-12345
```

**Now your EC2 code is secure:**

```python
import boto3

# Automatically uses instance profile credentials!
s3 = boto3.client('s3')
response = s3.list_buckets()
```

**A security pattern that saved us:** NEVER hardcode credentials. Use IAM roles for EVERYTHING. If you need keys for local dev, use AWS CLI profiles! 🔒

## IAM Mistake #2: Overly Permissive Wildcard Policies 🌟

**The problem:**

```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "*"
}
```

**Translation:** "You can do ANYTHING to ANY S3 bucket!"

**What could go wrong:**
- Delete production buckets? ✅
- Make sensitive data public? ✅
- Download confidential files? ✅
- Modify bucket policies? ✅

**Better - Specific actions:**

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ],
  "Resource": "arn:aws:s3:::my-specific-bucket/*"
}
```

**Even better - Add conditions:**

```json
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::user-uploads/${aws:username}/*",
  "Condition": {
    "StringEquals": {
      "s3:x-amz-server-side-encryption": "AES256"
    },
    "NumericLessThan": {
      "s3:content-length": 10485760
    }
  }
}
```

**Translation:**
- Can only upload to YOUR folder (not other users' folders)
- Files MUST be encrypted
- Files MUST be smaller than 10MB

**This saved us from:** Users uploading 50GB video files, unencrypted sensitive documents, and accessing each other's data! 🛡️

## IAM Mistake #3: Long-Lived Access Keys 🕰️

**The problem:**

```bash
# Created access key in 2019
aws iam create-access-key --user-name developer

# Gave it to contractor
# Contractor leaves company in 2020
# Key still active in 2026! 😱
```

**Why this is bad:**
- Ex-employees retain access
- Keys shared via Slack/email (never expires!)
- If compromised, attacker has permanent access
- No way to track who's using the key

**Check your ancient keys:**

```bash
# List all access keys for all users
aws iam list-users --output text | \
  awk '{print $NF}' | \
  xargs -I {} aws iam list-access-keys --user-name {} --output table

# Output showing keys from 2019:
# UserName: old-developer
# AccessKeyId: AKIAIOSFODNN7EXAMPLE
# CreateDate: 2019-03-15T12:00:00Z
# Status: Active
#
# "Why is this still active?!" 💀
```

**The fix - Rotate regularly:**

```bash
# Set up key rotation policy
aws iam update-account-password-policy \
  --max-password-age 90

# Better - Use AWS SSO instead of access keys!
aws sso login --profile production

# Or use temporary credentials with STS
aws sts get-session-token --duration-seconds 3600
```

**My production setup:**
- **Developers:** AWS SSO (no long-lived keys!)
- **CI/CD:** OIDC integration with GitHub Actions (no keys!)
- **Services:** IAM roles (temporary credentials!)
- **Emergency access:** Break-glass IAM user with MFA required

**When architecting on AWS, I learned:** The best access key is NO access key! Use roles and SSO wherever possible! 🎯

## IAM Mistake #4: No MFA on Root Account 🔓

**The nightmare scenario:**

```
Your AWS root account:
├── Email: admin@company.com
├── Password: Company123! (leaked in data breach)
├── MFA: None 😱
└── Access: Full control over EVERYTHING

Hacker:
1. Finds leaked password in breach database
2. Logs into your AWS root account
3. Creates admin IAM user for persistence
4. Deletes all S3 buckets
5. Terminates all EC2 instances
6. Downloads customer database
7. Ransom note: "Pay 100 BTC or we publish customer data"
```

**Enable MFA RIGHT NOW:**

```bash
# 1. Go to AWS Console → IAM → Your Security Credentials
# 2. Enable MFA device
# 3. Scan QR code with Google Authenticator/Authy
# 4. Enter two consecutive MFA codes
# 5. Done! Root account now requires MFA!

# Enforce MFA for all IAM users
aws iam create-policy \
  --policy-name RequireMFA \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }]
  }'
```

**Enforce MFA for destructive actions:**

```json
{
  "Effect": "Deny",
  "Action": [
    "s3:DeleteBucket",
    "rds:DeleteDBInstance",
    "ec2:TerminateInstances"
  ],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {
      "aws:MultiFactorAuthPresent": "false"
    }
  }
}
```

**Translation:** Can't delete critical resources without MFA! 🔒

**Real incident this prevented:** Developer's laptop was stolen. Thieves had AWS credentials cached. Tried to delete everything for ransom. MFA policy blocked them! 🛡️

## IAM Mistake #5: Using Root Account for Daily Operations 🙈

**What I see too often:**

```
Engineer's daily workflow:
1. Log into AWS root account
2. Deploy Lambda functions
3. Create S3 buckets
4. Modify RDS databases
5. "Why would I use IAM users? Root works fine!"
```

**Why this is INSANE:**
- Root account has UNLIMITED access (can't be restricted!)
- No audit trail for WHO did WHAT
- Can't enforce MFA policies on root
- If compromised, attacker owns your ENTIRE AWS account
- Can't rotate root credentials easily

**The proper setup:**

```bash
# 1. Secure root account
aws iam update-account-password-policy \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --require-symbols \
  --require-numbers \
  --minimum-password-length 16

# Enable MFA
# Store root password in company password manager (1Password, etc.)
# NEVER use root for daily operations!

# 2. Create admin IAM user for yourself
aws iam create-user --user-name john.admin

# 3. Create admin group
aws iam create-group --group-name Administrators
aws iam attach-group-policy \
  --group-name Administrators \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 4. Add user to group
aws iam add-user-to-group \
  --user-name john.admin \
  --group-name Administrators

# 5. Enable MFA for IAM user
# 6. Use IAM user for daily work, root only for emergencies!
```

**When to use root account:**
- Closing your AWS account
- Changing AWS support plan
- Restoring IAM user permissions if you locked yourself out
- That's it! Everything else = IAM users/roles!

**In production, I've deployed** infrastructure where root credentials are in a sealed envelope in the company safe. Never needed to break the seal in 3 years! 🎉

## IAM Mistake #6: Not Using IAM Policy Conditions 📋

**Basic policy (too permissive):**

```json
{
  "Effect": "Allow",
  "Action": "ec2:*",
  "Resource": "*"
}
```

**Translation:** Can launch ANY EC2 instance type, in ANY region, at ANY time! 💸

**Better - With conditions:**

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:RunInstances",
    "ec2:TerminateInstances"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "ec2:InstanceType": [
        "t3.micro",
        "t3.small",
        "t3.medium"
      ],
      "aws:RequestedRegion": "us-east-1"
    },
    "DateGreaterThan": {
      "aws:CurrentTime": "2024-01-01T00:00:00Z"
    },
    "DateLessThan": {
      "aws:CurrentTime": "2024-12-31T23:59:59Z"
    }
  }
}
```

**Translation:**
- Can only launch t3.micro/small/medium (no expensive instances!)
- Only in us-east-1 (no accidental expensive regions!)
- Only valid in 2024 (policy expires automatically!)

**Prevent accidental crypto mining:**

```json
{
  "Effect": "Deny",
  "Action": "ec2:RunInstances",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "ec2:InstanceType": [
        "p3.16xlarge",
        "p4d.24xlarge",
        "g4dn.metal"
      ]
    }
  }
}
```

**Translation:** Can NEVER launch GPU instances (even with admin access!)

**This saved us from:** Junior dev accidentally launching p3.16xlarge ($24/hour!) instead of t3.micro ($0.01/hour). Would've cost $17K/month! 😱

## IAM Mistake #7: Ignoring IAM Access Analyzer 🔍

**The problem:** You don't know what your policies ACTUALLY allow!

```json
{
  "Effect": "Allow",
  "Action": "s3:*",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

**You think:** "This allows access to my bucket."

**Reality:** This policy does NOTHING because it doesn't include the bucket itself, only objects!

**AWS IAM Access Analyzer to the rescue:**

```bash
# Enable Access Analyzer
aws accessanalyzer create-analyzer \
  --analyzer-name my-analyzer \
  --type ACCOUNT

# Check findings
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:123456789:analyzer/my-analyzer
```

**What Access Analyzer finds:**
- S3 buckets shared with external accounts
- IAM roles assumable by third parties
- KMS keys accessible outside your account
- Secrets Manager secrets shared externally

**Real finding from our audit:**

```
Finding: S3 bucket "production-backups" is public!
Resource: arn:aws:s3:::production-backups
External Principal: *
Access: s3:GetObject

"Wait, WHAT?! Our database backups are PUBLIC?!" 💀
```

**How it happened:** A developer testing bucket policies accidentally made it public. Forgot to revert. Access Analyzer caught it!

**Use IAM Policy Simulator:**

```bash
# Test if a policy allows a specific action
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789:user/developer \
  --action-names s3:DeleteBucket \
  --resource-arns arn:aws:s3:::production-data

# Output:
# EvaluationResult: denied
# "Phew, they CAN'T delete production!" ✅
```

**A debugging pattern that saved us:** Before deploying IAM changes, simulate them! Caught dozens of overly permissive policies before they hit production! 🎯

## The IAM Security Checklist 🛡️

Before going to production:

- [ ] **No hardcoded access keys** (use IAM roles!)
- [ ] **Root account has MFA** (and is NEVER used daily)
- [ ] **All IAM users have MFA** (enforce with policy)
- [ ] **Least privilege policies** (no wildcards unless needed)
- [ ] **Access keys rotated** (90 days max, or use SSO!)
- [ ] **IAM Access Analyzer enabled** (catch public resources)
- [ ] **CloudTrail logging enabled** (audit who did what)
- [ ] **Unused IAM users removed** (quarterly cleanup)
- [ ] **Service roles are scoped** (one role per function)
- [ ] **Conditions in policies** (restrict instance types, regions, etc.)

## The Least Privilege Policy Template 📄

Here's my battle-tested Lambda IAM policy template:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsPermissions",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:123456789:log-group:/aws/lambda/my-function*"
    },
    {
      "Sid": "S3ReadPermissions",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::my-input-bucket/*"
    },
    {
      "Sid": "S3WritePermissions",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-output-bucket/processed/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    },
    {
      "Sid": "DynamoDBPermissions",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789:table/MyTable"
    }
  ]
}
```

**Why this is good:**
- ✅ Specific actions only (no wildcards)
- ✅ Specific resources (no `*`)
- ✅ CloudWatch logs for debugging
- ✅ Encrypted S3 uploads enforced
- ✅ No delete permissions (safer!)

## Common IAM Mistakes I Made (So You Don't Have To) 🪤

### Mistake #1: Trust Policy vs Permission Policy Confusion

**What I learned:** IAM roles have TWO policies!

**Trust Policy (WHO can assume this role):**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "lambda.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
```

**Permission Policy (WHAT the role can do):**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "*"
  }]
}
```

**I spent 2 hours debugging** why my Lambda couldn't assume a role. Turns out the trust policy was missing! 🤦‍♂️

### Mistake #2: Forgetting `s3:ListBucket` vs `s3:GetObject`

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

**This allows:** Downloading files (if you know the filename!)

**This does NOT allow:** Listing files in the bucket!

**Need both:**

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:ListBucket"
  ],
  "Resource": "arn:aws:s3:::my-bucket"
},
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject"
  ],
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

**Note the difference:** `my-bucket` vs `my-bucket/*`! 🎯

### Mistake #3: Not Using IAM Roles Anywhere

**What I used to do:**

```javascript
// BAD: Environment variables with access keys
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
```

**What I do now:**

```javascript
// GOOD: IAM role (automatic credentials!)
const AWS = require('aws-sdk');
const s3 = new AWS.S3();  // Uses execution role!
```

**Everywhere I use IAM roles now:**
- Lambda functions
- EC2 instances
- ECS tasks
- CodeBuild projects
- GitHub Actions (OIDC)

**Nowhere do I use access keys anymore!** 🎉

## The Bottom Line 💡

IAM is AWS's most important service - and the most misunderstood!

**The essentials:**
1. **Never hardcode credentials** (use roles!)
2. **Least privilege always** (grant minimum permissions needed)
3. **MFA everywhere** (root, IAM users, destructive actions)
4. **Use conditions** (restrict instance types, regions, etc.)
5. **Enable Access Analyzer** (catch misconfigurations)
6. **Audit regularly** (remove unused users/keys)

**The truth about IAM:**

It's not "just permissions" - it's the foundation of AWS security! One wrong policy can expose your data, drain your wallet, or end your career!

**When architecting our e-commerce backend**, I learned: IAM is like seat belts - annoying to set up, but you'll be REALLY glad you did when things go wrong! Start with least privilege. Use roles everywhere. Enable MFA. Test policies before deploying. And for the love of all that is holy, NEVER use root for daily operations! 🙏

You don't need perfect IAM from day one - you need SECURE defaults that follow least privilege! 🚀

## Your Action Plan 🎯

**This week:**
1. Enable MFA on root account (DO THIS NOW!)
2. Audit IAM users (remove unused ones)
3. Check for hardcoded access keys (search codebase for "AKIA")
4. Enable IAM Access Analyzer

**This month:**
1. Rotate all access keys (or migrate to SSO!)
2. Review Lambda IAM policies (remove wildcards)
3. Add conditions to EC2 launch policies
4. Enable CloudTrail for audit logging

**This quarter:**
1. Migrate to AWS SSO (no more access keys!)
2. Implement automatic key rotation
3. Add MFA requirements for destructive actions
4. Become the IAM security guru on your team! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [IAM Policy Simulator](https://policysim.aws.amazon.com/) - Test policies before deploying
- [IAM Access Analyzer](https://aws.amazon.com/iam/access-analyzer/) - Find overly permissive policies
- [Parliament](https://github.com/duo-labs/parliament) - Lint IAM policies

**Reading list:**
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM Policy Reference](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies.html)

**Real talk:** The best IAM strategy is least privilege by default, roles everywhere, MFA required!

---

**Still giving your Lambda AdministratorAccess?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your IAM horror stories!

**Want to see my IAM policy templates?** Check out my [GitHub](https://github.com/kpanuragh) - production-ready examples!

*Now go forth and lock down those permissions!* 🔒☁️

---

**P.S.** If you've never checked your IAM Access Analyzer findings, do that RIGHT NOW. I'll wait. Seriously. I once found a production S3 bucket that was public for 8 months. Nobody knew. Access Analyzer found it in 30 seconds! 🚨

**P.P.S.** I once gave a Lambda `s3:*` permission and it accidentally deleted a production bucket during a bug. Moral: Even one Lambda with god mode can ruin your day. LEAST PRIVILEGE EVERYTHING! 💸
