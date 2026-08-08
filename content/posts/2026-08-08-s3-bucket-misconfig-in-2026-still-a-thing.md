---
title: "🪣 S3 Bucket Misconfig in 2026: Still a Thing, Now With Extra Steps"
date: "2026-08-08"
excerpt: "Public S3 buckets aren't the meme they used to be — AWS locked the front door years ago. So how are people still leaking data? Turns out the misconfigs just moved to policies, presigned URLs, and cross-account trust."
tags: ["aws", "cloud-security", "s3", "infrastructure", "cybersecurity"]
featured: true
---

Remember 2018-2020, the golden age of "researcher finds unsecured S3 bucket containing 500 million customer records"? It happened so often it became a genre of tech journalism. AWS eventually got embarrassed enough to do something about it — Block Public Access became account-default in 2023, S3 Object Ownership defaults changed, and the classic "someone unchecked a box and now the internet can list your bucket" story mostly died out.

So we're safe now, right? I wish. The misconfig didn't disappear, it just moved up a layer. In 2026 the leaks aren't "bucket was public" — they're "bucket was *supposed* to be private but three other things made it reachable anyway." Same crime scene, smarter door lock, more windows.

## The front door is locked. Check the windows.

Block Public Access (BPA) is genuinely good — it's account and bucket-level, it overrides ACLs and policies, and AWS ships it on by default for new buckets. If your incident this year was "ACL set to public-read," that's on you specifically, because you had to go out of your way to disable a safety net that ships turned on.

But BPA only stops *public* access. It says nothing about:

- A bucket policy that grants `s3:GetObject` to `Principal: "*"` gated only by a condition you got wrong
- A presigned URL with a 7-day expiry that ends up in a Slack message, a GitHub issue, or a browser history sync
- A cross-account role trust that's broader than the account you meant to trust
- A CloudFront distribution using Origin Access Control pointed at a bucket, where the bucket policy *also* independently allows public reads "just in case," which nobody ever revisited

That last one bit a team I consulted with earlier this year. The bucket was never "public" in the S3 console sense — BPA was on, no ACLs, looked clean. But the bucket policy had a leftover statement from before CloudFront OAC was set up, allowing anonymous reads scoped to `/assets/*`. Nobody deleted it because nobody thought to check a policy that "worked fine" for two years. `/assets/*` quietly grew to include a misrouted export dump because a script used the same prefix convention by accident.

## The condition key that looks safe but isn't

This is the one I see most often now. Someone writes a bucket policy meant to restrict access to a specific VPC endpoint, using `aws:SourceVpce`. Looks locked down:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::company-reports/*",
  "Condition": {
    "StringEquals": {
      "aws:SourceVpce": "vpce-0123456789abcdef0"
    }
  }
}
```

Reasonable, if the VPC endpoint is genuinely private. But `Principal: "*"` plus a condition means the condition is doing *all* the security work. If that VPC endpoint's security group is looser than intended, or if a second VPC in a different account gets access to the same endpoint via a shared services VPC, the "restricted" bucket is now reachable from wherever that VPC's blast radius reaches. The policy reviewer sees `Principal: "*"` and a condition block and assumes it's fine, because it looks like the textbook pattern. It's the textbook pattern with the actual scope hidden a layer down in networking config that S3 IAM Access Analyzer won't flag, because from S3's perspective, the policy is exactly as written.

## Presigned URLs: the leak that isn't a "misconfig" at all

This one doesn't even need a mistake in IAM. Presigned URLs are *supposed* to grant temporary access, and that's exactly the problem — "temporary" is whatever expiry you set, and a lot of code defaults to something generous because nobody wants a support ticket about an expired download link.

```javascript
const command = new GetObjectCommand({ Bucket: "invoices", Key: key });
const url = await getSignedUrl(s3, command, { expiresIn: 604800 }); // 7 days
```

Seven days is an eternity for a URL that grants unauthenticated access to anyone who has it — including anyone who has the *log line* that has it, the email that forwarded it, or the analytics tool that scraped the referrer header when someone clicked it from a browser extension. I've seen presigned URLs show up in error-tracking tools because the frontend logged the full request URL on a 404. Nothing in IAM was wrong. The bucket policy was clean. The leak was a default parameter three services and one dependency away from the security review.

The fix isn't complicated, just unglamorous: shorten expiry to the actual task duration (minutes, not days), scope presigned URLs to single-use where you can pair them with a one-time token server-side, and audit anywhere `expiresIn` gets set to make sure nobody copy-pasted a tutorial's `604800` into production.

## What actually catches this stuff

At Cubet, we added S3 policy diffing to the same PR pipeline that already runs Terraform plan output through review — any change touching a bucket policy, ACL, or CloudFront OAC binding gets a plain-English summary of what principal gained what access, posted as a PR comment. It's not exotic tooling, it's `terraform plan` output piped through a small script that flags `Principal` changes and condition-key removals. Catches probably 80% of "wait, why does that grant public read" moments before merge, because a human actually reads a two-line summary instead of skimming 40 lines of HCL.

For the presigned URL problem, the closest thing to a real fix is treating expiry duration as a linted config value, not a magic number — fail CI if `expiresIn` exceeds some sane ceiling for the resource type, the same way you'd lint against `eval()`.

## The takeaway

"Public S3 bucket" as a headline is mostly dead because AWS made the obvious mistake hard to make. What's left is the interesting part: access control expressed across four different services (S3 policy, IAM, VPC endpoints, CloudFront), where each one is individually correct and the combination isn't. Auditing a single bucket policy in isolation tells you almost nothing anymore — you have to trace the whole path a request actually takes.

If your last S3 security review was "check Block Public Access is on and move on," it's worth another fifteen minutes to trace an actual request path end to end. You might be surprised what's still reachable.

---

Found a gnarly misconfig story of your own, or think I'm wrong about where the risk moved? Find me on [GitHub](https://github.com/kpanuragh), [LinkedIn](https://www.linkedin.com/in/anuragh-kp/), or [X/Twitter](https://twitter.com/kpanuragh) — always up for swapping cloud-security war stories.
