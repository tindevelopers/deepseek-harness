---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-24-skill-bootstrap-attribution

English | [中文](2026-09-24-skill-bootstrap-attribution.zh.md)

## Summary

Adds the qualified attribution kind `skill-bootstrap` to the user/developer message source slot, so a conditionally injected skill body is attributed to its producer.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-24-skill-bootstrap-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-16-session-format-v4"
    after: "99faacb49bdc3fa638c9ccfa1e0361e1782290c10234cd33926e53cebf12d00f"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-16-session-format-v4"
    after: "a78a4ace16b27a4a33dcc9b4046799876d8773243d2047b5bc6bef96fa00729e"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-16-session-format-v4"
    after: "67e5b4d766d988ea91172557e15d10fa6efba8ecacdac2284501385e9e5d00d0"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-16-session-format-v4"
    after: "cdffc95957ecf796822c6d392df5276ce51edb5ecdfb4729d7cb160058020f35"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Older records remain readable unchanged. The kind is qualified for preservation: a reader without the producer preserves the recorded message and its JSON metadata, imposes no validation, replay, or authority requirement, and falls through the unknown kind. Only the producing listener inspects it, to suppress a repeated injection. No header, envelope, or existing payload changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/skill/skill-bootstrap/tests/skill-bootstrap.spec.ts: 13 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
