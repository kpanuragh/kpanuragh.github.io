---
title: "📖 Runbook Automation: The Wiki Page Nobody Reads at 3AM"
date: "2026-08-22"
excerpt: "Your runbooks are markdown files sitting in a wiki that nobody opens during an actual incident. Here's how to turn them into executable code the on-call engineer can run with one command instead of reading with panicked eyes."
tags:
  - sre
  - devops
  - reliability
  - platform-engineering
featured: true
---

Every team I've worked with has runbooks. Beautifully written ones, even. "Step 1: Check the dashboard. Step 2: If CPU is above 80%, SSH into the box. Step 3: Run `systemctl restart whatever-service`. Step 4: If that doesn't work, page the secondary."

And every single time an incident actually happens, nobody reads them. Not because the runbooks are bad — because at 3AM with a pager screaming and a Slack channel filling up with "is prod down??", nobody has the executive function to open Confluence, find the right page (which was last updated four reorgs ago), and follow ten manual steps correctly under pressure. You get tunnel vision, you skip step 3 because you're sure you remember it, and you restart the wrong service.

The fix isn't "write better runbooks." It's "stop making runbooks something a human has to read and turn them into something a computer can run."

## The Runbook Is Actually a Script Wearing a Costume

Look at almost any runbook and you'll notice it's already 90% pseudocode:

```markdown
## High memory on payment-worker

1. Check current memory: `kubectl top pod -l app=payment-worker`
2. If any pod > 90% of limit, cordon the node
3. Drain connections gracefully: `kubectl exec <pod> -- curl -X POST localhost:8080/drain`
4. Wait 30s, then delete the pod
5. Verify replacement pod is Ready
6. If step 2 recurs within 10 minutes, escalate to secondary
```

That's not documentation. That's a program with comments, and someone is manually acting as the interpreter, badly, while stressed. The move is to actually make it a program:

```python
# runbooks/high_memory_payment_worker.py
def remediate(pod_name: str) -> RunbookResult:
    usage = k8s.top_pod(pod_name)
    if usage.memory_pct < 90:
        return RunbookResult.skip("memory under threshold, no action taken")

    k8s.cordon_node(usage.node)
    k8s.exec(pod_name, "curl -X POST localhost:8080/drain")
    time.sleep(30)
    k8s.delete_pod(pod_name)

    if not k8s.wait_ready(replacement_of(pod_name), timeout=60):
        return RunbookResult.escalate("replacement pod not ready after 60s")

    return RunbookResult.resolved(f"recycled {pod_name}, node {usage.node} cordoned")
```

Same logic. Same decisions a human would make. The difference is this version doesn't have a step where a half-awake engineer typos the pod name into a `kubectl delete` command against the wrong namespace. It also *reports back* — `RunbookResult` isn't decoration, it's what gets posted into the incident channel automatically, so the whole team sees exactly what happened without anyone typing "ok I ran step 3, drained connections, restarting now" by hand.

## Wire It to the Thing That Pages You

The part people skip is the last mile: connecting the runbook to the alert, so the human doesn't even have to remember which runbook applies. At Cubet, we hooked this into our alerting so remediation scripts run automatically for anything rated "safe to auto-remediate," and everything else gets a single-click "run this runbook" button in the incident tool instead of a link to a doc.

```yaml
# alerting/rules/payment-worker-memory.yaml
alert: PaymentWorkerHighMemory
expr: container_memory_working_set_bytes{pod=~"payment-worker.*"} / container_spec_memory_limit_bytes > 0.9
for: 2m
labels:
  severity: warning
  runbook: high_memory_payment_worker   # <-- maps directly to the script above
annotations:
  summary: "payment-worker memory pressure"
  auto_remediate: "true"
```

The `runbook` label isn't cosmetic — our alert router reads it, looks up `runbooks/high_memory_payment_worker.py`, and either runs it automatically (if `auto_remediate: true` and it's within blast-radius rules) or drops a "Run runbook" button into the PagerDuty/Slack message. Either way, the on-call engineer's job shrinks from "figure out what to do" to "confirm the thing that already ran did the right thing."

## The Guardrails That Keep This From Becoming a New Way to Break Prod

This is the part where people get nervous, correctly. Auto-remediation is just automation with a blast radius, and a buggy runbook that runs unattended is worse than a slow human, because it fails at machine speed. A few rules that kept us out of trouble:

- **Every runbook is dry-run-able.** Same function, a flag that logs what it *would* do instead of doing it. We ran every new runbook in shadow mode against real alerts for a week before flipping it to live.
- **Idempotency is non-negotiable.** If the alert fires twice because the pager is flaky, running the same runbook twice must not double-drain or double-delete anything.
- **Escalation is a first-class outcome, not a fallback.** A runbook that can't converge on a fix should say "I don't know, waking a human" loudly and quickly — not spin retrying for 20 minutes while the incident clock runs.
- **Version everything next to the alert.** The runbook lives in the same repo as the alert rule, same PR, same review. A runbook and its trigger condition drifting apart is exactly how you get automation that fires on the wrong thing.

None of this requires a fancy platform. It's a directory of small, testable Python functions, a mapping from alert to function, and the discipline to treat that mapping like production code — because it is production code, it just happens to run during your worst moments instead of your best ones.

If your team's incident response still routes through "someone finds the wiki page," you already have the runbook. You're just missing the fifteen minutes it takes to turn the markdown into a function. Start with the alert that pages you most often — it's usually the same three steps every time, which is exactly why it's the easiest one to automate first.
