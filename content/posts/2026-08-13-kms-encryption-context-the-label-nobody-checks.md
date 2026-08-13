---
title: "🏷️ Encryption Context: The KMS Field That Notices When Your Ciphertext Wanders Off"
date: "2026-08-13"
excerpt: "KMS lets you attach a plaintext label to every encrypt/decrypt call, and if that label doesn't match at decrypt time, KMS refuses — even with a perfectly valid key. That's encryption context, and it quietly closes a hole most envelope-encryption setups leave wide open."
tags:
  - security
  - cryptography
  - kms
  - aws
  - secrets-management
featured: true
---

Quick quiz: if an attacker in your multi-tenant SaaS can't read plaintext, can't steal your KMS key, but *can* swap two rows in your database — Tenant A's encrypted blob into Tenant B's record — is that a problem?

If you're just doing plain envelope encryption, yes. Wildly. The ciphertext decrypts fine. KMS has no idea the blob it just handed back plaintext for belongs to the wrong tenant, because as far as KMS is concerned, a valid encrypted DEK is a valid encrypted DEK. It doesn't know what the DEK was "for."

That's the gap encryption context closes, and it's one of those KMS features that's sitting right there in the API docs, costs nothing extra, and almost nobody wires up until after the incident review.

## What Encryption Context Actually Is

Encryption context is a set of key-value pairs you pass alongside your `Encrypt` and `Decrypt` calls — plain strings like `{"tenant_id": "4471", "purpose": "invoice-pdf"}`. Here's the part that matters: **KMS doesn't encrypt this context.** It's not secret. It shows up in cleartext in your CloudTrail logs. What KMS does instead is bind it cryptographically into the ciphertext using it as Additional Authenticated Data (AAD) in the AES-GCM operation.

That means if you encrypt a DEK with context `{"tenant_id": "4471"}`, and later try to decrypt that same blob while passing context `{"tenant_id": "9982"}` — or no context at all — KMS rejects the call outright. Not "returns garbage." Rejects it. The GCM authentication tag simply won't verify, because the AAD used at decrypt time doesn't match what was used at encrypt time.

You're not encrypting the label. You're stapling it to the envelope in a way that can't be peeled off and reattached to a different envelope.

## Why This Is Different From "Just Check the Tenant ID in Your Code"

The obvious objection: "I already check `tenant_id` matches before I decrypt anything, why do I need KMS to check it too?"

Because the check happening in *your* application code and the check happening inside KMS's cryptographic boundary are not the same guarantee. Your app-layer check can be skipped by a bug, a bypassed authorization branch, a refactor that drops the `if` statement, or a completely different code path someone wrote six months later that goes straight from "fetch row" to "decrypt." Encryption context makes the binding non-optional — there is no code path, buggy or otherwise, where a mismatched context produces a successful decrypt. The check isn't something you remembered to write; it's a property of the ciphertext itself.

## What It Looks Like

Here's the multi-tenant pattern in Python, extending straightforward envelope encryption:

```python
import boto3

kms = boto3.client("kms", region_name="us-east-1")
KEY_ID = "alias/tenant-data-key"

def encrypt_dek(tenant_id: str):
    ctx = {"tenant_id": tenant_id, "purpose": "invoice-pdf"}
    resp = kms.generate_data_key(
        KeyId=KEY_ID,
        KeySpec="AES_256",
        EncryptionContext=ctx,
    )
    return resp["Plaintext"], resp["CiphertextBlob"], ctx

def decrypt_dek(encrypted_dek: bytes, tenant_id: str):
    ctx = {"tenant_id": tenant_id, "purpose": "invoice-pdf"}
    resp = kms.decrypt(
        CiphertextBlob=encrypted_dek,
        EncryptionContext=ctx,   # must match encrypt-time context exactly
    )
    return resp["Plaintext"]
```

If someone swaps `encrypted_dek` between two tenant records in your database, the decrypt call for the "wrong" tenant fails with `InvalidCiphertextException` — no plaintext is ever produced, no matter how valid the IAM permissions are.

## The IAM Bonus You Get for Free

Once you're passing encryption context, you can reference it directly in IAM policy conditions:

```json
{
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "arn:aws:kms:us-east-1:111122223333:key/abcd-1234",
  "Condition": {
    "StringEquals": {
      "kms:EncryptionContext:tenant_id": "${aws:PrincipalTag/tenant_id}"
    }
  }
}
```

Now the *authorization* layer and the *cryptographic* layer are enforcing the same rule from two different directions. A role scoped to Tenant A's tag literally cannot decrypt Tenant B's DEK — not because your code is well-written, but because IAM denies the call before it even reaches the crypto check.

We started tagging encryption context by service and environment (`service: billing, env: prod`) on a multi-tenant piece of our stack at Cubet mostly for the free CloudTrail searchability — being able to grep "who decrypted anything tagged `tenant_id: 4471` last Tuesday" turned out to be more useful for incident response than the confused-deputy protection itself, though we got both for the price of a dictionary literal.

## The Two Mistakes People Make With It

**Treating it as a secret.** It isn't one, and it shouldn't contain PII, credentials, or anything sensitive — it's logged in plaintext to CloudTrail on every call. Tenant IDs and purpose tags are fine. Email addresses and SSNs are not.

**Forgetting it has to match *exactly*.** Same keys, same values, same casing, every time, on both encrypt and decrypt. If your context includes something that legitimately changes — a timestamp, a request ID — decrypt will fail forever, and you'll spend an afternoon staring at `InvalidCiphertextException` before you realize your "context" wasn't actually constant.

If you're already doing envelope encryption and stopped there, encryption context is a five-line addition that turns "a stolen or misrouted ciphertext blob decrypts fine" into "a stolen or misrouted ciphertext blob is cryptographically inert." That's a genuinely good trade for the cost of a dictionary literal.

---

Run into a confused-deputy bug that encryption context would've caught — or a war story about mismatched context locking you out of your own data? Find me on [Twitter/X](https://x.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh).
