---
title: "🔑 Envelope Encryption: Why KMS Never Actually Touches Your Data"
date: 2026-05-28
excerpt: "KMS doesn't encrypt your data — it encrypts the key that encrypts your data. That's envelope encryption, and once it clicks, cloud secrets management makes total sense."
tags: [security, cryptography, kms, aws, secrets-management, encryption]
featured: true
---

Here's a thing I learned the embarrassing way: when you use AWS KMS (or Google Cloud KMS, or Azure Key Vault), KMS does **not** encrypt your actual data.

It encrypts the *key* that encrypts your data.

That distinction sounds like splitting hairs until you're staring at a 4 MB payload and wondering why the KMS API is returning a 400 error complaining about your object being too large. (Spoiler: KMS has a hard 4 KB limit on plaintext. Your database backup is slightly larger than that.)

So let's talk about envelope encryption — the pattern that every cloud KMS is built around, why it exists, and how to actually use it correctly.

---

## The Two-Key Trick

Envelope encryption uses two layers of keys:

1. **Data Encryption Key (DEK)** — a symmetric key (usually AES-256) that actually encrypts your data. You generate this yourself, locally, per-object or per-session.
2. **Key Encryption Key (KEK)** — your KMS master key (AWS calls it a CMK / KMS Key). It *only* ever encrypts or decrypts your DEK. It never touches your actual data.

The flow looks like this:

```
Your Data  →  [encrypted with DEK]  →  Ciphertext Blob
Your DEK   →  [encrypted with KEK]  →  Encrypted DEK
```

You store the ciphertext blob *together with* the encrypted DEK. To decrypt, you ask KMS to decrypt the encrypted DEK (KMS checks your IAM permissions here), then use the recovered plaintext DEK to decrypt the blob locally.

The "envelope" is the encrypted DEK wrapping the ciphertext like a seal on a letter.

---

## Why Not Just Use KMS Directly?

A few reasons, and they're all legitimate:

**Size limits.** KMS `Encrypt` accepts up to 4 KB. Your S3 object, database dump, or large config file is almost certainly larger.

**Performance.** Every KMS API call is a network round-trip. Encrypting 10,000 database rows by sending each one to KMS would be catastrophically slow and expensive. With envelope encryption, you make *one* KMS call per session to get a DEK, then do the rest locally in microseconds.

**Cost.** AWS KMS charges per API call. At Cubet, we process a lot of event payloads per day — sending each through KMS would be a billing disaster. One DEK per batch is a completely different story.

**Key rotation without re-encrypting everything.** When you rotate your KMS key, you only need to re-encrypt the DEKs, not all your data. That's a tiny operation compared to re-encrypting terabytes.

---

## What It Looks Like in Code

Here's a minimal Python example using boto3:

```python
import boto3
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client("kms", region_name="us-east-1")
KEY_ID = "alias/my-app-key"

def encrypt(plaintext: bytes) -> dict:
    # Ask KMS for a fresh data key
    response = kms.generate_data_key(KeyId=KEY_ID, KeySpec="AES_256")
    
    plaintext_dek = response["Plaintext"]       # use this, then discard
    encrypted_dek = response["CiphertextBlob"]  # store this alongside ciphertext
    
    # Encrypt locally — KMS never sees your data
    nonce = os.urandom(12)
    ciphertext = AESGCM(plaintext_dek).encrypt(nonce, plaintext, None)
    
    # Wipe the plaintext DEK from memory as soon as we're done
    plaintext_dek = b"\x00" * len(plaintext_dek)
    
    return {"encrypted_dek": encrypted_dek, "nonce": nonce, "ciphertext": ciphertext}

def decrypt(envelope: dict) -> bytes:
    # Ask KMS to decrypt just the DEK
    response = kms.decrypt(CiphertextBlob=envelope["encrypted_dek"])
    plaintext_dek = response["Plaintext"]
    
    return AESGCM(plaintext_dek).decrypt(envelope["nonce"], envelope["ciphertext"], None)
```

Notice what KMS receives: only the encrypted DEK blob during decryption, and zero bytes of your actual data during encryption. Your plaintext stays local the entire time.

---

## The Security Guarantees This Buys You

**IAM is the gate.** The only way to decrypt your data is to first call `kms:Decrypt`, which requires IAM permissions on that specific KMS key. Steal the ciphertext blob? Useless without KMS access. Steal the encrypted DEK? Also useless — it's encrypted by KMS. An attacker needs both the stored blob *and* AWS credentials with KMS permissions to do anything.

**Audit trail without data exposure.** Every `kms:Decrypt` call lands in CloudTrail with the caller's identity, timestamp, and source IP. You get a full log of who decrypted what and when, without KMS ever touching the actual data.

**Key rotation is surgical.** AWS KMS supports automatic annual rotation of the underlying cryptographic material while keeping the same key ID. Your encrypted DEKs remain valid — KMS keeps track of which key version was used to encrypt each DEK and uses the right one automatically. No data re-encryption required.

**Least privilege is enforceable.** You can give your application `kms:GenerateDataKey` (encrypt path) but not `kms:Decrypt` (decrypt path) — useful for write-only ingestion services that should never be able to read back what they wrote.

---

## Common Mistakes

**Reusing a DEK forever.** Generate a new DEK per object, per session, or at a reasonable boundary. Reusing one DEK across millions of records is a crypto antipattern — it inflates the blast radius if the DEK is ever exposed.

**Storing the plaintext DEK.** Only store the *encrypted* DEK. The plaintext DEK should exist in memory only for the duration of the encrypt/decrypt operation, then be overwritten. Most languages won't garbage-collect secrets reliably, so actively zero them out.

**Not validating the key ARN on decrypt.** When decrypting, check that the KMS key used matches what you expect. KMS returns the key ARN in the `Decrypt` response — assert on it. Otherwise a confused-deputy scenario could let a different key decrypt your data.

---

## The One-Sentence Summary

KMS is a key management service, not a data encryption service — it manages the key that encrypts the key that encrypts your data. Once that sentence makes sense to you, envelope encryption goes from confusing to obvious.

If you're building anything that handles sensitive data in the cloud and you're not using envelope encryption, you're either hitting KMS limits you don't know about yet, or you'll be scrambling to rotate a key that's also touching all your data. Either way — worth fixing before it's an incident.

---

Got questions or horror stories about KMS foot-guns? Hit me up on [Twitter/X](https://x.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). I read everything, even the ones that start with "you're wrong and here's why."
