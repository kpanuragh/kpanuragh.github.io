---
title: "AWS CDK: Stop Writing YAML and Write Infrastructure in Actual Code ☁️🛠️"
date: "2026-03-08"
excerpt: "I spent two years writing CloudFormation YAML by hand. 4,000 lines. Four digits. I once spent an entire afternoon debugging a misaligned space. Then I discovered AWS CDK and I genuinely cannot go back."
tags: ["\\\"aws\\\"", "\\\"cloud\\\"", "\\\"cdk\\\"", "\\\"infrastructure-as-code\\\"", "\\\"serverless\\\""]
featured: "true"
---

# AWS CDK: Stop Writing YAML and Write Infrastructure in Actual Code ☁️🛠️

**True story:** At my last job, we had a single CloudFormation template that had grown to 4,000+ lines of YAML. Nobody fully understood it. The guy who wrote it had left. We were too scared to touch it. We called it "The Monolith" — not the architecture pattern, just the file itself.

One day I added a missing space. The entire stack refused to deploy. An entire afternoon, gone.

Then I discovered AWS CDK and quietly cried at my desk — out of relief.

## What Even Is AWS CDK? 🤔

AWS CDK (Cloud Development Kit) lets you define your AWS infrastructure using **real programming languages** — TypeScript, Python, Java, Go, C#. You write code. CDK synthesizes it into CloudFormation. AWS deploys it.

The key word there is *real*. Variables. Loops. Functions. IDE autocomplete. Unit tests. Everything your brain already knows how to use.

**Before CDK — CloudFormation YAML:**

```yaml
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-app-uploads
      VersioningConfiguration:
        Status: Enabled
      NotificationConfiguration:
        LambdaConfigurations:
          - Event: "s3:ObjectCreated:*"
            Function: !GetAtt ProcessUploadFunction.Arn

  MyBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref MyBucket
      PolicyDocument:
        # ... 30 more lines
```

**After CDK — TypeScript:**

```typescript
const bucket = new s3.Bucket(this, 'MyBucket', {
  versioned: true,
});

bucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(processUploadFn)
);
```

Same infrastructure. A third of the lines. And if I mistype something, my IDE tells me immediately — not after a 10-minute CloudFormation deployment that rolls back at line 3,847.

## The Moment I Was Convinced 💡

In production, I've deployed a serverless e-commerce backend where every environment (dev, staging, prod) needed slightly different configurations — different Lambda memory sizes, different RDS instance types, different retention policies for logs.

In raw CloudFormation: I had three nearly-identical YAML files with parameters spread everywhere and conditions that would make your eyes cross.

In CDK:

```typescript
const isProd = props.stage === 'prod';

const api = new lambda.Function(this, 'Api', {
  memorySize: isProd ? 1024 : 256,
  tracing: isProd ? lambda.Tracing.ACTIVE : lambda.Tracing.DISABLED,
  logRetention: isProd
    ? logs.RetentionDays.THREE_MONTHS
    : logs.RetentionDays.ONE_WEEK,
});
```

One file. Real logic. No `!If [IsProd, 1024, 256]` YAML gymnastics.

**When architecting on AWS, I learned:** the moment your infrastructure has conditional logic, YAML becomes a trap. CDK sets you free.

## The Construct Model: Lego Blocks for Cloud ☁️🧱

CDK's superpower is **Constructs** — reusable, composable infrastructure components.

Think: instead of copy-pasting the same Lambda + API Gateway + CloudWatch alarm setup for every microservice, you build it once:

```typescript
// Your team's standard "API service" construct
export class ApiService extends Construct {
  constructor(scope: Construct, id: string, props: ApiServiceProps) {
    super(scope, id);

    const fn = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(props.codePath),
      environment: props.environment,
    });

    // Auto-wired API Gateway, every time
    new apigw.LambdaRestApi(this, 'Endpoint', { handler: fn });

    // Auto-wired CloudWatch alarm, every time
    fn.metricErrors().createAlarm(this, 'ErrorAlarm', {
      threshold: 5,
      evaluationPeriods: 1,
    });
  }
}
```

Now every team member spins up a new service in 5 lines:

```typescript
new ApiService(this, 'CheckoutService', {
  codePath: './src/checkout',
  environment: { STRIPE_KEY: process.env.STRIPE_KEY! },
});
```

**A pattern that saved us:** We built a shared internal CDK library. Spinning up a new compliant, monitored, alarmed microservice went from a half-day of YAML wrestling to 10 minutes. 🎯

## Testing Your Infrastructure — Yes, Really ✅

Here's something CloudFormation YAML can't do: **unit tests**.

```typescript
import { Template } from 'aws-cdk-lib/assertions';

test('Checkout Lambda has enough memory for prod', () => {
  const app = new cdk.App();
  const stack = new MyStack(app, 'TestStack', { stage: 'prod' });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    MemorySize: 1024,
  });
});

test('S3 bucket has versioning enabled', () => {
  // ...
});
```

I caught a misconfigured IAM policy in CI before it ever touched a real account. That one test saved us from a production outage.

## The Cost Reality 💰

CDK itself is free. You pay for whatever AWS resources it creates — same as always.

But here's the indirect cost savings I've measured over two years of using CDK:

| Situation | Before CDK | After CDK |
|---|---|---|
| New microservice setup | 4–6 hours | 30–45 minutes |
| Cross-env config changes | 3 files to update | 1 conditional |
| Catching IAM misconfigs | In production 😱 | In CI ✅ |
| Onboarding a new dev to infra | 2 days | Half a day |

The ROI isn't in the tool's price — it's in the hours your team stops burning on YAML archaeology.

## Common Gotchas I Hit 🪤

### Gotcha #1: CDK isn't magic — it still deploys CloudFormation

If something goes wrong at the CloudFormation level, you'll still see CloudFormation error messages. Learn to read them. CDK doesn't abstract away the AWS internals, it just removes the YAML authoring pain.

### Gotcha #2: Don't mix CDK and manual console changes

If you create something in the AWS console and CDK doesn't know about it, your next deploy might try to create a duplicate — or worse, delete things it thinks it "owns."

**Rule:** If CDK manages a resource, never touch it in the console.

### Gotcha #3: Versions drift across teams

CDK releases frequently. If Team A pins `aws-cdk-lib@2.50.0` and Team B is on `2.130.0`, sharing constructs breaks.

```json
// Always pin your CDK version in package.json
{
  "dependencies": {
    "aws-cdk-lib": "2.135.0",
    "constructs": "^10.0.0"
  }
}
```

Lock it. Update it intentionally. Don't let it drift.

### Gotcha #4: `cdk destroy` is very literal

```bash
cdk destroy MyStack
```

This deletes everything. Including your RDS instance. Including your S3 bucket (if retention isn't configured).

**Before running destroy on anything non-dev:**

```typescript
// Protect stateful resources from accidental deletion
const db = new rds.DatabaseInstance(this, 'Db', {
  // ...
  deletionProtection: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

I've seen grown adults cry over a `cdk destroy` they ran by mistake. Configure `removalPolicy: RETAIN` on anything you actually care about. 🙏

## Getting Started in 10 Minutes 🚀

```bash
# Install CDK CLI
npm install -g aws-cdk

# Bootstrap your AWS account (one-time setup per region)
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1

# Create a new app
mkdir my-infra && cd my-infra
cdk init app --language typescript

# Your first stack is in lib/my-infra-stack.ts
# Edit it, then:
cdk synth    # Preview CloudFormation output
cdk diff     # See what will change
cdk deploy   # Ship it
```

That's it. Your first CDK deployment is genuinely that quick.

## TL;DR 🎯

AWS CDK replaces YAML infrastructure definitions with real programming code. You get:

- **Autocomplete and type safety** — catch mistakes before deployment
- **Loops, variables, and conditions** — no more YAML gymnastics
- **Reusable Constructs** — build once, use everywhere
- **Unit tests for infrastructure** — catch misconfigs in CI
- **Same end result** — CDK synthesizes to CloudFormation under the hood

If you're still hand-writing CloudFormation templates or copy-pasting Terraform HCL for every new service, CDK is worth an afternoon of your time to try.

After two years of using it in production, going back to raw YAML feels the same as going back to writing CSS without a linter. Technically possible. Emotionally damaging.

---

**Migrated from raw CloudFormation to CDK?** Tell me your horror stories on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have a dedicated folder for CloudFormation trauma.

**Check out my infra patterns on** [GitHub](https://github.com/kpanuragh) — I keep reusable CDK Constructs there for anyone who wants them.

*Now go write some TypeScript that builds actual cloud infrastructure. It's genuinely fun.* ☁️🛠️
