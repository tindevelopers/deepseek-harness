---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-24-skill-bootstrap-attribution

[English](2026-09-24-skill-bootstrap-attribution.md) | 中文

## 概述

在 user/developer 消息来源槽位新增受限定的来源类型 `skill-bootstrap`，使条件式注入的 skill 主体可归属到其生产方。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

既有记录仍可原样读取。该类型按「保留优先」限定：不具备该生产方的读取方会保留已记录的消息及其 JSON 元数据，不施加校验、回放或授权要求，并将未知类型直接穿透。只有产生该消息的监听器会检查该类型，以抑制重复注入。文件头、事件封套和既有载荷均无变化。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/skill/skill-bootstrap/tests/skill-bootstrap.spec.ts：13 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
