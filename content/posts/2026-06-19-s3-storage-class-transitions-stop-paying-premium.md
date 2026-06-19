---
title: "S3 Storage Class Transitions: Stop Paying Premium Prices for Data Nobody Reads"
date: "2026-06-19"
excerpt: "Your S3 bucket is silently draining your AWS bill. Learn how lifecycle policies and storage class transitions can cut object storage costs by up to 95% — without touching a single line of application code."
tags:
  - devops
  - aws
  - cloud-cost
  - s3
  - platform-engineering
featured: true
---

# S3 Storage Class Transitions: Stop Paying Premium Prices for Data Nobody Reads

Here's a fun finance exercise: open your AWS Cost Explorer, filter by S3, and stare at the number for a few seconds. Now ask yourself — when did anyone last actually *read* that 18-month-old log archive? Or those build artifacts from a sprint in 2024? Or those database backups from a feature branch that got abandoned?

Exactly. You're paying first-class airfare for cargo that's been sitting in baggage claim since before your last performance review.

S3 storage class transitions are the single lowest-effort, highest-ROI cost optimization move in cloud engineering. No code changes. No migrations. No scary prod deploys at 2 AM. Just a lifecycle policy that automatically demotes objects as they age — and your bill shrinks every month like magic.

At Cubet, after a routine cost audit, we found we were burning a non-trivial chunk on S3 Standard for data that hadn't been touched in over a year. Two hours of configuration later, we cut that specific line item by roughly 70%. Here's everything I wish I'd known before setting it up.

## The S3 Storage Class Hierarchy (and What It Actually Costs)

AWS offers a tiered set of storage classes, roughly ordered from "instant access, expensive" down to "wait a bit, very cheap":

| Class | Use case | Retrieval | Cost (approx) |
|---|---|---|---|
| **S3 Standard** | Frequently accessed | Milliseconds | $0.023/GB/month |
| **S3 Standard-IA** | Infrequent access | Milliseconds | $0.0125/GB/month |
| **S3 One Zone-IA** | Infrequent, single AZ | Milliseconds | $0.01/GB/month |
| **S3 Glacier Instant** | Archive, rare access | Milliseconds | $0.004/GB/month |
| **S3 Glacier Flexible** | Archive, hours ok | 1–12 hours | $0.0036/GB/month |
| **S3 Glacier Deep Archive** | Long-term cold storage | 12–48 hours | $0.00099/GB/month |

Glacier Deep Archive is **23x cheaper** than Standard. That's not a rounding error — that's a completely different budget category.

The catch: there's a minimum storage duration per class (30 days for Standard-IA, 90 days for Glacier), and retrieval isn't free. The pricing model is designed so that frequently accessed data stays in Standard, while cold data flows downhill. Lifecycle policies automate that flow.

## A Real Lifecycle Policy

Here's the pattern we use at Cubet for application log archives:

```json
{
  "Rules": [
    {
      "ID": "log-archive-tiering",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        },
        {
          "Days": 365,
          "StorageClass": "DEEP_ARCHIVE"
        }
      ],
      "Expiration": {
        "Days": 1095
      }
    }
  ]
}
```

Logs are hot for the first month (incidents, debugging). After 30 days they go to Standard-IA. After 90 days, Glacier Instant Retrieval — rare access but fast when needed. After a year, Deep Archive. After three years, they expire entirely. Set it and forget it.

The `Expiration` block is the part people forget. Without it, you're just slowly accumulating data across cheaper tiers forever. If you never need logs older than 3 years, delete them. The cheapest storage is no storage.

## Terraform: Because You Should Never Click This In the Console

```hcl
resource "aws_s3_bucket_lifecycle_configuration" "app_logs" {
  bucket = aws_s3_bucket.app_logs.id

  rule {
    id     = "log-tiering"
    status = "Enabled"

    filter {
      prefix = "logs/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = 1095
    }
  }
}
```

Apply this to your buckets via your usual Terraform pipeline. Lifecycle policies apply to *new* objects from that point — existing objects in the bucket also get evaluated against the rules based on their `Last-Modified` date, so you'll see transitions kick in for old objects too within the next 24 hours after the policy activates.

## The Gotchas That Will Bite You

**Minimum storage duration charges.** If you put an object into Standard-IA and delete it after 10 days, you still get billed for 30 days. Design your transition windows to reflect actual access patterns, not wishful thinking. If objects might be deleted within 30 days, don't transition them at all.

**Retrieval costs.** Glacier Flexible and Deep Archive are not free to read. A bulk retrieval from Deep Archive can still be cheap, but if someone writes a bug that reads cold data in a hot path — you will feel it on the bill. Tag your Glacier prefixes clearly and add S3 access point policies if needed to avoid accidental hot reads.

**Multipart upload orphans.** Incomplete multipart uploads silently accumulate on S3. They're not free, and they don't transition. Add an `AbortIncompleteMultipartUpload` rule to your lifecycle config:

```json
{
  "AbortIncompleteMultipartUpload": {
    "DaysAfterInitiation": 7
  }
}
```

This one rule alone sometimes finds surprising savings.

**S3 Intelligent-Tiering exists.** If your access patterns are truly unpredictable, AWS offers S3 Intelligent-Tiering, which automatically moves objects between tiers based on actual access patterns. It adds a small monitoring fee per object, so it's less optimal than a well-tuned manual policy for predictable workloads — but it's a solid default if you don't want to think about it.

## Where to Start

Don't try to optimize everything at once. Pick one bucket category:

1. **CI/CD build artifacts** — rarely needed after 7 days, almost never after 30.
2. **Application logs** — hot for a month, cold after that.
3. **Database backups** — you need recent ones fast; anything older than 90 days can go to Glacier.
4. **User-uploaded media** — depends entirely on your product, but old uploads often go cold fast.

Run an S3 Storage Lens analysis first (it's free at the basic tier). It'll show you per-bucket storage breakdown by class, request patterns, and object age distribution. That data tells you exactly which buckets are silently burning your budget.

## The Uncomfortable Truth

Most teams treat S3 as an infinite, free-ish dumping ground until the bill arrives. The bucket fills with build artifacts, logs, feature-flag exports, debug dumps, and one-off data migrations — and nobody asks whether any of it still needs to exist, let alone exist in Standard.

Lifecycle policies are the infrastructure equivalent of inbox zero. Automate the cleanup. Define the retention. Let the data flow downhill to cheaper storage and eventually expire.

Your future self — and your cloud budget — will thank you.

---

*Running an AWS cost review and want to know what else to look at? Check out my posts on workload identity and IAM least privilege — the security wins there often come with cost wins too.*
