# Agent Note: Conditional skill bootstrap — auto-load a methodology skill for non-trivial work

Status: implemented

English | [中文](2026-09-05-skill-bootstrap.zh.md)

## Problem

`dsh-tool-skill` lists available skills and loads them only when the model decides a request matches. Superpowers-style methodology skills (brainstorming, test-driven-development, systematic-debugging, and their `using-superpowers` bootstrap) depend on the opposite: the bootstrap is injected up front so the model checks for applicable skills before its first response. Injecting that bootstrap on every session pays a full prompt of forceful instructions for trivial one-shot requests, which is exactly the noise progressive disclosure exists to avoid.

## Decision

`@deepseek-ai/dsh-skill-bootstrap` injects one named skill's complete body as a durable user-role message once per visible surface, gated to non-trivial multi-turn programming sessions. It is opt-in: mounting the plugin is the enablement, and the shipped presets leave it off.

The gate is a hybrid of two signals. The first turn opens it only when the step's direct user text matches a `programmingSignals` regex — the defaults match implementation intent, source-artifact references, and engineering-domain nouns. Any step at or past `escalateAtTurn` (default `2`) opens it unconditionally, so a trivial first request that grows into multi-turn work still receives the body, and a trivial one-shot request never does. Deduplication keys on the visible surface rather than the whole log: the listener skips a step whose batch or surface already carries a `skill-bootstrap` message, so compaction shadowing the message re-opens the gate on the next step. The injection reuses `renderSkillContent`, so the model sees the same `<skill_content>` shape the `skill` tool returns, and loads through `ctx.skills.get()` with the calling agent as scope, honoring `isModelInvocable`.

Configuration is `skillName` (default `using-superpowers`), `escalateAtTurn`, and the `programmingSignals` regex list. The first is validated with `isSkillName` and each signal is compiled at load so a malformed value fails loud instead of silently disabling the gate; `escalateAtTurn` is schema-validated.

## Alternatives considered

**Model-driven classification of the first request.** Rejected for this package: an extra classification call adds latency and a logged model step to every session, and the deterministic gate covers the stated requirement without it.

**Turn-count escalation alone.** Rejected because a multi-turn non-programming chat would open the gate; the first-turn signal keeps trivial and non-engineering sessions out.

**First-turn heuristic alone.** Rejected because a genuinely complex task can start with a terse first message; escalation catches sessions the heuristic misses.

**Inject at `agent/session-start`.** Rejected because the first request is not yet claimed there, so the gate could not read the text it classifies. The pre-step listener reads the claimed batch directly.

## Consequences

The skill family gains one opt-in injector between the registry and the catalog consumer ([skill-system](../../archived/feature/2026-07-05-skill-system.md)). It is the automatic counterpart to the explicit [`/name` gesture](../../archived/feature/2026-08-08-user-explicit-skill-invocation.md): the gesture injects a user-named skill, while the bootstrap injects a configured one only when the gate opens. The gate is deterministic and text-only, so a request that shares no `programmingSignals` pattern is treated as trivial regardless of workspace; deployments tune the regex list. The injected message is session history, not World State, matching the catalog consumer's durability posture.

## Deferred

Post-compaction re-injection relies on the surface no longer containing the shadowed message; there is no explicit `agent/session-start` compaction hook. A first-turn signal that inspects the workspace (project markers, an open repository) is not shipped — classification reads only the request text.
