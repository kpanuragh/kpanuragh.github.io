---
title: "🔓 Kubernetes Secrets: Base64 Is Not Encryption (And Other Lies We Tell Ourselves)"
date: 2026-09-05
excerpt: "A Kubernetes Secret sounds safe. It's not — it's a labeled envelope with your password written in a font only computers can read easily. Here's what actually protects it, and what doesn't."
tags: ["kubernetes", "security", "cloud-security", "secrets-management", "devsecops"]
featured: true
---

Somewhere out there, right now, a developer is `kubectl get secret db-password -o yaml`-ing a value, base64-decoding it in their terminal, and feeling a small pang of guilt — like they just picked a lock instead of using a key. They shouldn't feel guilty. Base64 was never a lock. It's a translation, not a vault. `echo "hunter2" | base64` takes three milliseconds to decode by anyone with eyes and a terminal, and yet the word "Secret" in the Kubernetes API convinces otherwise-careful engineers that something cryptographic just happened.

It didn't. And the gap between what people *assume* a Kubernetes Secret does and what it *actually* does is where a surprising number of real incidents live.

## What a Secret actually is

A Kubernetes Secret is a ConfigMap with a costume on. Same storage mechanism (etcd), same access model (the Kubernetes API and RBAC), same lack of built-in encryption. The only functional differences are that kubelet mounts Secrets as `tmpfs` instead of writing them to disk on the node, and `kubectl get` doesn't print the value inline by default. That's it. That's the whole security model, out of the box.

```bash
kubectl create secret generic db-password --from-literal=password=hunter2
kubectl get secret db-password -o jsonpath='{.data.password}' | base64 -d
# hunter2
```

Anyone who can run that second command — anyone with `get` on secrets in that namespace — has your database password. No decryption key, no vault unseal, no MFA prompt. Just RBAC standing between "authenticated user" and "plaintext credential." If your RBAC is loose (and on more clusters than anyone wants to admit, `view` roles quietly include `secrets`), you've effectively published your credentials to everyone with read access to the namespace.

## Where it actually lives

The part that surprises people more is where that value sits at rest: unencrypted, by default, in etcd. If someone gets a copy of your etcd snapshot — a misconfigured backup bucket, a compromised control-plane node, an etcd instance with no authentication because "it's internal" — they get every Secret in the cluster in one file, no cluster access required at all. I've seen etcd snapshots land in an S3 bucket with the same lax permissions as build artifacts, because whoever wrote the backup job didn't think of it as "a database full of your production credentials." It is exactly that.

The fix here is `EncryptionConfiguration` on the API server, which encrypts Secret data before it's written to etcd:

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources: ["secrets"]
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}
```

Managed clusters (EKS, GKE, AKS) increasingly turn this on by default or make it a one-flag enable — check before assuming, because plenty of clusters spun up a couple of years ago predate the safer defaults and were never retrofitted.

## The GitOps trap

The other place this bites teams is source control. GitOps workflows want everything declared in Git, which is great for infrastructure and terrible for secrets, because "everything in Git" now includes your database password, sitting in plaintext YAML, in a repo with a commit history that never forgets. `git rm` doesn't undo `git log`.

This is what tools like **Sealed Secrets** and the **External Secrets Operator** actually solve — not "secrets in Kubernetes are insecure" in the abstract, but "secrets in *Git* are insecure" specifically. Sealed Secrets encrypts the value client-side with a public key before it ever touches your repo; only the controller in-cluster holds the private key to decrypt it back into a real Secret. External Secrets Operator skips Git entirely and pulls live from Vault, AWS Secrets Manager, or similar, syncing into a Secret object on a schedule:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-password
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: db-password
  data:
    - secretKey: password
      remoteRef:
        key: prod/db/password
```

Neither of these changes the etcd-at-rest story — you still need `EncryptionConfiguration` — but they close the much more commonly exploited hole: secrets ending up somewhere permanent and widely readable that was never meant to hold them.

## What I actually check now

At Cubet, when I'm reviewing a new cluster or auditing an existing one, the checklist is short but non-negotiable: is etcd encryption enabled, does any RBAC role grant broad `get`/`list` on secrets to something wider than it needs, and is there a raw secret value anywhere in Git history. That third one has caught more real exposure than the first two combined — because RBAC misconfigurations get reviewed, and encryption flags get checked in cluster hardening docs, but nobody greps their entire Git history until something goes wrong.

Base64 was never the villain here — it's just an encoding, doing exactly what it says on the tin. The villain is treating "Secret" as a promise the object never made.

---

If you've got a Kubernetes secrets horror story — or a cluster hardening tip I missed — I'd genuinely like to hear it. Find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
