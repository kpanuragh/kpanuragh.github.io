---
title: "🔐 Kubernetes Secrets: base64 Is Not Encryption (And Your etcd Knows It)"
date: "2026-06-02"
excerpt: "Storing secrets as base64 in Kubernetes is like locking your house and leaving the key taped to the door. Here's how to actually manage secrets with External Secrets Operator, Vault, and Sealed Secrets."
tags:
  - kubernetes
  - secrets-management
  - devops
  - security
  - platform-engineering
featured: true
---

Let me tell you about the moment I realized Kubernetes secrets are not secret.

It was during an internal audit at Cubet. Someone ran `kubectl get secret my-db-creds -o jsonpath='{.data.password}' | base64 -d` and our production database password printed cleanly to the terminal. No decryption key. No 2FA prompt. No dramatic music. Just... there it was.

That's the dirty secret about Kubernetes secrets: they're base64-encoded, not encrypted. And if your etcd isn't encrypted at rest — which it isn't by default in many managed clusters — anyone with etcd access has all your credentials. Every API key. Every database password. Every OAuth client secret. All of it.

It's 2026. We can do better.

## Why Base64 Is a Lie You Keep Telling Yourself

`base64` is an encoding, not encryption. It's reversible by design. The entire point of base64 is to make binary data printable — not to hide it.

```bash
# This is not "secure". This is just base64.
$ echo -n "supersecretpassword" | base64
c3VwZXJzZWNyZXRwYXNzd29yZA==

# And back again, trivially:
$ echo "c3VwZXJzZWNyZXRwYXNzd29yZA==" | base64 -d
supersecretpassword
```

Kubernetes Secrets at rest in etcd are stored exactly like this. No additional encryption unless you've explicitly configured [EncryptionConfiguration](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/) on your API server. On GKE, EKS, and AKS the etcd *volumes* are encrypted by the cloud provider, but the secrets inside are still stored as plaintext bytes within that volume.

There's also the GitOps problem: the moment you commit a `Secret` YAML to git (even accidentally), you've leaked it. Forever. Because git history is forever.

So what do we actually do about this?

## Option 1: External Secrets Operator (The One We Use at Cubet)

[External Secrets Operator](https://external-secrets.io/) (ESO) is my current favourite solution. The idea is elegant: don't store secrets in Kubernetes at all. Store them in a real secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, Azure Key Vault), and let ESO sync them into native Kubernetes Secrets just-in-time.

Your git repo never sees secret values. Your CI pipeline never sees them. Only the cluster — via a service account with limited IAM permissions — can fetch them.

Here's a minimal ESO setup pointing at AWS Secrets Manager:

```yaml
# SecretStore: tells ESO how to authenticate with AWS
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: ap-south-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
---
# ExternalSecret: what to fetch and where to put it
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: db-creds          # creates a native K8s Secret with this name
    creationPolicy: Owner
  data:
    - secretKey: password   # key in the K8s Secret
      remoteRef:
        key: prod/myapp/db  # AWS Secrets Manager path
        property: password  # JSON property within the secret
```

Your pods mount `db-creds` exactly like any other Kubernetes Secret — no application changes required. But the actual value lives in AWS Secrets Manager, version-controlled, with full audit logs, and rotatable without touching a YAML file.

The `refreshInterval: 1h` means ESO polls AWS every hour. Rotate the secret in Secrets Manager, and within an hour your pods are using the new value. Add a rolling restart annotation if you need zero-lag rotation.

## Option 2: Sealed Secrets (When You Love GitOps Too Much to Give It Up)

If your team is deeply committed to storing *everything* in git, [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) from Bitnami is a pragmatic middle ground.

The controller generates a public/private keypair. You encrypt secrets locally using `kubeseal` with the public key, producing a `SealedSecret` resource that's safe to commit. Only the controller in your cluster — which holds the private key — can decrypt it.

```bash
# Install kubeseal CLI, then:
kubectl create secret generic db-creds \
  --from-literal=password='supersecretpassword' \
  --dry-run=client -o yaml \
  | kubeseal \
    --controller-name=sealed-secrets-controller \
    --controller-namespace=kube-system \
    --format yaml \
  > sealed-db-creds.yaml

# sealed-db-creds.yaml is safe to commit — it's encrypted
# The controller decrypts it and creates a real Secret automatically
```

The tradeoff: if you lose the controller's private key (e.g., cluster gets nuked), you lose the ability to decrypt those sealed secrets. Back up the key. Seriously.

Sealed Secrets is great for small teams doing GitOps without a cloud secrets manager. ESO is better for larger setups where you want centralized rotation, versioning, and cross-cluster sharing.

## The etcd Encryption-at-Rest You're Probably Missing

Even if you adopt ESO or Sealed Secrets, it's worth enabling encryption at rest for etcd on self-managed clusters. On managed Kubernetes (EKS, GKE, AKS), the cloud provider handles volume encryption, but you can add an application-level encryption layer on top:

```yaml
# /etc/kubernetes/encryption-config.yaml (API server flag: --encryption-provider-config)
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}  # fallback for unencrypted reads during migration
```

After applying this, new secrets are encrypted in etcd with AES-CBC. Existing secrets need a forced rewrite: `kubectl get secrets --all-namespaces -o json | kubectl replace -f -`. Annoying, but worthwhile.

## What I Actually Recommend

Based on what we've rolled out at Cubet across several client clusters:

1. **Greenfield projects**: Start with ESO + AWS/GCP Secrets Manager. It's the cleanest architecture and costs almost nothing at small scale.
2. **GitOps-heavy teams**: Sealed Secrets + encrypted etcd is a solid combo. Just document the key backup procedure before it's too late.
3. **HashiCorp Vault already in the mix**: Use ESO's Vault provider or Vault Agent Injector. Don't run a second secrets system unnecessarily.
4. **Every cluster**: Enable etcd encryption-at-rest. There's no good reason not to.

The pattern I'd avoid: plain Kubernetes Secrets hand-written into YAML files, committed to git, and rotated manually. That's where credentials leak. That's how breach post-mortems start with "an attacker obtained credentials from our repository".

## The Uncomfortable Truth

Most teams don't get compromised because their encryption algorithm was broken. They get compromised because a developer committed a `.env` file, or a Secret YAML, or because someone with too-broad RBAC ran `kubectl get secrets`. The attack surface for Kubernetes secrets is almost entirely operational, not cryptographic.

External Secrets Operator doesn't make secrets magically safe — it makes the *operational habits* safer by default. Secrets stay in one authoritative, auditable, access-controlled place. The cluster knows where to find them. Your git history doesn't.

That's the shift worth making.

---

**What's your current secrets setup?** Still on raw K8s Secrets? Already running ESO or Vault? I'm curious what patterns are working (or not) for other teams — drop a thought in the issues or find me on X.
