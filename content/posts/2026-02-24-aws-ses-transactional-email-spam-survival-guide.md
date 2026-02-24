---
title: "AWS SES: Your Order Confirmation Emails Are Going to Spam (And You Have No Idea) ✉️☁️"
date: "2026-02-24"
excerpt: "I spent three days debugging why our e-commerce order confirmation emails had a 40% open rate — until I realized 40% is amazing when the other 60% was silently landing in spam. Here's everything I learned about not destroying your sender reputation on AWS SES."
tags: ["aws", "cloud", "serverless", "ses", "email"]
featured: true
---

# AWS SES: Your Order Confirmation Emails Are Going to Spam (And You Have No Idea) ✉️☁️

Here's a situation nobody warns you about when you're building your first e-commerce backend on AWS: you deploy your shiny serverless order confirmation flow, everything looks green in the console, customers complete purchases — and then you get a Slack message from your client at 2 AM asking why nobody received their order receipt.

The Lambda ran. The SES API returned a `MessageId`. No errors anywhere.

The emails just... vanished into the spam void.

**In production, I've deployed** transactional email systems for e-commerce backends handling thousands of orders per month, and the AWS SES gotchas nearly got me every single time. Let me save you the 2 AM debugging sessions.

## The Sandbox Prison 🔒

Every new AWS SES account starts in the **Sandbox**. In Sandbox mode:

- You can **only send emails to verified email addresses** — i.e., addresses you've manually confirmed in the SES console
- Your daily sending limit is **200 emails per day**
- Your maximum send rate is **1 email per second**

This sounds reasonable for testing. What catches people off guard is that **"it works in staging"** and then they push to production and... still in Sandbox. Because Sandbox is per-region, and they deployed to `us-east-1` for prod while testing in `eu-west-1`.

**Getting out of Sandbox requires a support request** where you explain your use case, your email list practices, and your bounce/complaint handling. AWS reviews it manually. It takes 24–48 hours.

Do this **before** you're 3 days from launch. Don't ask me how I know.

```bash
# Check if you're still in Sandbox:
aws sesv2 get-account

# Look for "ProductionAccessEnabled": false — that's your problem.
# If false, go file the production access request NOW.
```

## Domain Verification and DKIM: Don't Skip This 🔐

Before you send a single email, verify your domain in SES and set up DKIM. Without DKIM, Gmail, Outlook, and every other major provider will either reject or spam-folder your emails immediately.

**When architecting on AWS, I learned** to use Easy DKIM with 2048-bit keys (not 1024). The setup is straightforward:

```bash
# Create email identity for your domain
aws sesv2 create-email-identity \
  --email-identity mail.yourdomain.com \
  --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT
```

SES gives you three CNAME records to add to your DNS. After propagation (can take up to 72 hours — not 5 minutes, no matter what the console says), your domain shows as verified.

**One gotcha:** use a **subdomain** for transactional email, not your root domain. Send from `noreply@mail.yourdomain.com` or `orders@mail.yourdomain.com`. This way, if your sender reputation takes a hit (it will at some point), it doesn't tank your main domain's reputation for regular business email.

Also set your `Mail-From` domain to match. Without a custom MAIL FROM, your emails show the `amazonses.com` domain in headers — not ideal for a professional e-commerce brand.

## Bounce and Complaint Handling: The Thing That Will Destroy You ☠️

This is the big one. **AWS will literally disable your SES account** if your bounce rate exceeds 10% or your complaint rate exceeds 0.5%.

Not throttle it. Not warn you. **Disable it.** With customers waiting for order confirmations.

**A serverless pattern that saved us:** Set up SNS notifications for bounces and complaints immediately, before you send a single production email.

```bash
# Create SNS topic for bounce notifications
aws sns create-topic --name ses-bounces

# Create SNS topic for complaint notifications
aws sns create-topic --name ses-complaints

# Configure SES to publish bounce notifications to SNS
aws sesv2 put-configuration-set-event-destination \
  --configuration-set-name my-transactional \
  --event-destination-name bounces \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["BOUNCE", "COMPLAINT"],
    "SnsDestination": {
      "TopicArn": "arn:aws:sns:us-east-1:123456789:ses-bounces"
    }
  }'
```

Then hook a Lambda to that SNS topic and store bounces and complaints in a database table. **Any email address that bounces hard must never be emailed again** — SES actually has a suppression list for this, but you want your own copy for audit purposes.

```python
def handle_ses_notification(event, context):
    message = json.loads(event['Records'][0]['Sns']['Message'])
    notification_type = message['notificationType']

    if notification_type == 'Bounce':
        bounce = message['bounce']
        for recipient in bounce['bouncedRecipients']:
            email = recipient['emailAddress']
            bounce_type = bounce['bounceType']  # 'Permanent' or 'Transient'

            if bounce_type == 'Permanent':
                # Hard bounce — NEVER email this address again
                mark_email_as_bounced(email)

    elif notification_type == 'Complaint':
        complaint = message['complaint']
        for recipient in complaint['complainedRecipients']:
            email = recipient['emailAddress']
            # Someone marked your email as spam — unsubscribe them immediately
            unsubscribe_email(email)
```

**The thresholds to watch:**
- Bounce rate > 2%: AWS sends you a warning
- Bounce rate > 5%: Your account gets reviewed
- Bounce rate > 10%: Account suspended
- Complaint rate > 0.08%: Warning
- Complaint rate > 0.5%: Suspended

Yes, **0.5% complaint rate**. If 5 out of 1,000 people click "Mark as Spam" in Gmail, you're in trouble. This is why you only email people who opted in, and why every email needs a clear unsubscribe link.

## The SES Suppression List Gotcha 🚫

SES has an **account-level suppression list** that automatically adds addresses after a hard bounce or spam complaint. This is actually great — it protects your reputation automatically.

**But here's the gotcha:** if an email address is on the suppression list, SES will return a success response when you try to send to it — and then silently not deliver the email.

No error. No bounce. Just... nothing.

I spent an entire afternoon wondering why a specific customer wasn't receiving their order confirmation. Their address was on the account-level suppression list from a previous bounce. SES happily accepted my API call and then did absolutely nothing with it.

```bash
# Check if an email is on your suppression list
aws sesv2 get-suppressed-destination \
  --email-address customer@example.com

# Remove an address if they're re-confirming their email
aws sesv2 delete-suppressed-destination \
  --email-address customer@example.com
```

Build a flow where customers can verify/re-confirm their email after a failed delivery, then remove them from the suppression list. E-commerce especially — a customer might have changed email providers.

## Sending Rate Limits and the SES Queue 📬

Once you're out of Sandbox, SES is generous. The default limit is **50,000 emails/day** and **14 emails/second** — plenty for most applications. But for high-volume bursts (flash sales, everybody-gets-a-receipt situations), you need to be careful.

**When architecting on AWS, I learned** to never call SES directly from the Lambda that processes the order. Instead, queue the email sends through SQS:

```
Order Lambda → SQS Queue → Email Lambda → SES
```

The Email Lambda can be rate-limited using the SQS `MaximumConcurrency` setting:

```yaml
# SAM template
EmailSenderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Events:
      SQSEvent:
        Type: SQS
        Properties:
          Queue: !GetAtt EmailQueue.Arn
          BatchSize: 10
          ScalingConfig:
            MaximumConcurrency: 10  # Max 10 concurrent executions = ~100 emails/second
```

This decouples your order processing from email sending and naturally rate-limits against SES throttling.

## Cost: SES is Criminally Cheap 💰

This is one of the few AWS services where the pricing is genuinely good:

- **$0.10 per 1,000 emails** sent
- **First 3,000 emails per month are free** (if sent from Lambda or EC2)
- Attachments cost $0.12 per GB

Compare that to SendGrid ($89.95/month for 100,000 emails) or Mailgun ($35/month for 50,000). For a transactional email system on an e-commerce backend, SES pays for itself on day one.

**A serverless pattern that saved us:** For marketing emails we still use a dedicated ESP (Email Service Provider) with better deliverability tools and list management. SES is for transactional — order confirmations, password resets, shipping notifications. Split the two, manage them differently, protect your transactional sender reputation fiercely.

## The Reputation Dashboard You Should Check Weekly 📊

SES has a **Reputation Metrics** dashboard. Bookmark it. Check it every week.

```bash
# Get your account sending statistics
aws sesv2 get-account

# Check reputation dashboard for your domain
# (This one you need to check in the AWS Console — no CLI equivalent for the full dashboard)
```

Watch your:
- **Bounce rate** — should stay under 2%
- **Complaint rate** — should stay under 0.08%
- **Delivery rate** — anything under 95% is worth investigating

**In production, I've deployed** a weekly Lambda that queries SES statistics and posts a summary to Slack. Takes 20 minutes to set up, saves you from finding out about reputation problems when customers start complaining.

## Common Pitfalls Checklist ⚠️

Before you go live with SES:

- [ ] **Request production access** — don't wait until launch week
- [ ] **Verify your domain with DKIM 2048-bit** — not just individual email addresses
- [ ] **Set up a custom MAIL FROM subdomain** — don't use `amazonses.com` in your headers
- [ ] **Configure SNS bounce/complaint notifications** and handle them in a Lambda
- [ ] **Build suppression list management** — let customers re-verify their email
- [ ] **Queue email sends through SQS** — don't call SES synchronously from order processing
- [ ] **Set up Configuration Sets** — for tracking opens, clicks, and delivery metrics
- [ ] **Test in Sandbox first** with your actual templates — SES renders HTML email differently than you expect

## TL;DR ✉️

AWS SES is the cheapest transactional email service you'll find, but it punishes you fast if you get lazy about hygiene:

1. **Get out of Sandbox** before you're close to launch — it's a manual review process
2. **Set up DKIM and custom MAIL FROM** — without this, you're spam by default
3. **Handle bounces and complaints immediately** — SES will disable your account at 10% bounce rate
4. **Check the suppression list** when a specific customer isn't getting emails — SES silently swallows sends to suppressed addresses
5. **Queue sends through SQS** — never call SES directly from your transaction-critical code
6. **Watch your Reputation Dashboard** weekly — problems creep up slowly then hit fast

The 2 AM email debugging panic is completely avoidable. Set up the monitoring first, then enjoy $0.10/1,000 emails for the rest of your life. ✉️☁️

---

**Hit an SES deliverability problem I didn't cover?** I'm on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the bounce handling stories from production are always a horror show. Let's compare notes.

**Want the full SES monitoring Lambda** (weekly reputation report to Slack + bounce/complaint handler)? Check [GitHub](https://github.com/kpanuragh) — the one I use in production for e-commerce backends.

*Go check your SES Reputation Dashboard right now. Something in there is probably creeping toward a threshold.* ✉️
