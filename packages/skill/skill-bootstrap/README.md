---
description: "The conditional skill bootstrap injector for users and maintainers enabling automatic skill loading for non-trivial multi-turn programming sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-bootstrap

English | [中文](README.zh.md)

## Summary

Agents can receive one skill's full instructions automatically — not through the catalog or the `skill` tool, but as a durable injected message — and only when the session is non-trivial programming work. The gate opens at the first turn when the request matches a `programmingSignals` pattern, or once the session reaches `escalateAtTurn` (a multi-turn session), and the injection reappears after compaction hides it. A trivial one-shot request never receives it. Mount the plugin to enable it; the shipped presets leave it off.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin alongside the skill registry to inject one named skill's body automatically, gated to non-trivial multi-turn programming requests. It requires `ctx.skills`.

### When to choose it

Use it when agents should auto-load a methodology skill (for example `using-superpowers`) for engineering work without the model having to call the `skill` tool first. Skip it when the session catalog and `skill` tool already cover discovery, or when every request should receive the skill body unconditionally — this package's whole purpose is the conditional gate.

### Mount and configure

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-filesystem'
- name: '@deepseek-ai/dsh-tool-skill'
- name: '@deepseek-ai/dsh-skill-bootstrap'
```

| Field | Default | Meaning |
|---|---|---|
| `skillName` | `using-superpowers` | Kebab-case skill injected when the gate opens |
| `escalateAtTurn` | `2` | First turn number that opens the gate unconditionally (a multi-turn session) |
| `programmingSignals` | three built-in patterns | Case-insensitive regex sources; a first request matching any is a non-trivial programming request |

The default signals match implementation intent (for example `implement`, `fix`, `refactor`, `migrate`, `debug`), source-artifact references (a code file extension or a `src`/`packages`/`tests`/`apps` path), and engineering-domain nouns (for example `bug`, `typecheck`, `lint`, `pull request`, `schema`, `test suite`). The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-skill-bootstrap) is the exhaustive source for every field.

### Gate and deduplication

The bootstrap injects at most once per visible surface. The first turn opens the gate only when its direct user text matches a `programmingSignals` pattern; any later step at or past `escalateAtTurn` opens it regardless, so a trivial first request that grows into multi-turn work still receives the body. The listener appends the injection to the accepted step's message batch and skips a step whose batch or visible surface already carries a `skill-bootstrap` message. Compaction shadows the message from the surface, so the next step re-injects.

### Observable success and failures

A gate-opening step whose named skill is present and model-invocable appends one `skill-bootstrap` message containing the canonical `<skill_content>` block. A closed gate, an absent skill, a skill disabled for model invocation, or an already-visible injection all append nothing, with no diagnostic to distinguish the causes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: gate, dedup, skill loading, and the pre-step injection listener |
| — | No runtime invariant companion is published; this adapter has no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |

### Design concept

The plugin is one `agent/pre-step` waterfall listener that appends a loaded skill body after the step's other injected context. It separates three decisions: whether the gate is open (turn-based heuristic plus escalation), whether the body is already visible (batch plus surface scan), and whether the skill loads as model-invocable (registry `get()` with the calling agent as scope). The injected message reuses `renderSkillContent`, so the model sees the same `<skill_content>` shape the `skill` tool returns.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — the family map including the conditional bootstrap injection contract.
- [skill package](../skill/README.md) — the registry this plugin reads from.
- [tool-skill package](../tool-skill/README.md) — the session catalog and `skill` tool that coexist with the bootstrap.

-----

<a id="model-experience"></a>
## Model Experience

### Bootstrap injection

#### What the model sees

One user-role message appended to the accepted step's batch, carrying the bootstrapped skill's complete instructions rendered by the shared `renderSkillContent` wrapper (`<skill_content>` → `<skill_resources>` → `<skill_instructions>`). The body is provider-owned and therefore summarized here; the wrapper is the same canonical shape the `skill` tool returns. The message source records `kind: 'skill-bootstrap'`, the skill `name`, and `form: 'instructions'` for transcript consumers, while the rendered text is the model's contract.

#### Token effect

Conditional. Zero when the gate is closed, the skill is absent or not model-invocable, or the body is already visible; otherwise one retained injected message with the full skill body.

#### KV Cache effect

Append-only. The injection adds one message to the batch once per visible surface; a later compaction that shadows it appends a fresh injection. Body-only edits to the skill change later injections, not this package's visibility decision.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The first-turn signal is text-only** — a request that references no `programmingSignals` pattern is treated as trivial even when the workspace is clearly a codebase; deployments tune the regex list to their own notion of non-trivial.
- **Escalation is turn-count, not content** — a multi-turn non-programming chat opens the gate at `escalateAtTurn`; the injected skill body is low-harm there only because the model finds no applicable skill.
- **Artifact references can trigger on read/summarize requests** — a code-file extension or directory marker matches even a one-shot "explain this file" request; the gate has no intent classifier beyond the configured patterns.
- **No content classifier beyond patterns** — the gate is deterministic and makes no model call, so it cannot distinguish subtle trivial from non-trivial phrasing that shares no signal.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
