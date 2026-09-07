/**
 * Conditional skill bootstrap injection for non-trivial multi-turn programming sessions.
 *
 * Injects one named skill's full instructions as durable model-facing context once per
 * session, gated so a trivial one-shot request never receives it: the first turn opens
 * the gate only when the request matches a programming signal, and any session that
 * survives to the escalation turn opens it regardless. The injection reappears after
 * compaction hides its message from the visible surface.
 *
 * @module @deepseek-ai/dsh-skill-bootstrap
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { isModelInvocable, isSkillName, renderSkillContent } from '@deepseek-ai/dsh-skill'

export const name = 'skill-bootstrap'
export const inject = ['skills']

const DEFAULT_SKILL_NAME = 'using-superpowers'
const DEFAULT_ESCALATE_AT_TURN = 2
const DEFAULT_PROGRAMMING_SIGNALS = [
  // Implementation or change intent aimed at the codebase.
  '\\b(implement|reimplement|fix|fixes|fixing|refactor|rewrite|rework|migrate|debug|optimize|integrate|wire|extend|rename|remove|patch|port|convert|expose|publish|deploy|repair|upgrade|downgrade|pin|bump)\\b',
  // Reference to a source artifact or a code-bearing directory.
  '\\b\\S+\\.(tsx?|jsx?|mjs|cjs|py|rs|go|java|kt|c|cc|cpp|h|hpp|cs|rb|php|swift|scala|sh|sql|prisma|toml|ya?ml|json)\\b|[/\\\\]?(src|packages|lib|tests?|spec|apps?)[/\\\\]',
  // Engineering-domain nouns that name non-trivial work.
  '\\b(bug|regression|crash|failure|typecheck|lint|compile|compilation|refactor|test suite|unit test|integration test|end-to-end|ci pipeline|pull request|merge request|dependency|dependencies|schema|migration|api endpoint|endpoint|feature|test coverage|benchmark|race condition|deadlock|leak)\\b',
]

/** Durable source for the bootstrap message this plugin injects. */
export interface SkillBootstrapSource {
  readonly kind: 'skill-bootstrap'
  /** Bootstrapped skill name, resolved model-invocable at the injecting boundary. */
  readonly name: string
  /** Injected skill bodies are instructions for the model to follow. */
  readonly form: 'instructions'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A skill body injected automatically by the conditional bootstrap. */
    'skill-bootstrap': SkillBootstrapSource
  }
}

/** Model-facing conditional skill bootstrap configuration. */
export interface Config {
  /** Skill injected when the gate opens; a kebab-case skill name. */
  skillName?: string
  /** Turn at which the session escalates and injects regardless of the first-request heuristic. */
  escalateAtTurn?: number
  /** Case-insensitive regex sources; a first request matching any is a non-trivial programming request. */
  programmingSignals?: string[]
}

/** Validate and default the conditional bootstrap configuration. */
export const Config: z<Config> = z.object({
  skillName: z.string().default(DEFAULT_SKILL_NAME),
  escalateAtTurn: z.number().step(1).min(1).default(DEFAULT_ESCALATE_AT_TURN),
  programmingSignals: z.array(z.string()).default([...DEFAULT_PROGRAMMING_SIGNALS]),
})

/**
 * Register the conditional bootstrap listener. The listener is a waterfall
 * pre-step hook that appends the bootstrapped skill body after the step's
 * other injected context, so the material the model must act on stays last.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const skillName = config.skillName ?? DEFAULT_SKILL_NAME
  const escalateAtTurn = config.escalateAtTurn ?? DEFAULT_ESCALATE_AT_TURN
  const signalSources = config.programmingSignals ?? DEFAULT_PROGRAMMING_SIGNALS
  if (!isSkillName(skillName)) {
    throw new Error(`skill-bootstrap: skillName "${skillName}" is not a valid skill name`)
  }
  const signals = signalSources.map(compileSignal)

  ctx.on('agent/pre-step', async (
    { agent, messages, turn, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    signal.throwIfAborted()
    if (bootstrapVisible(agent, decision.messages)) return decision
    if (!gateOpens(turn, messages, escalateAtTurn, signals)) return decision
    const skill = await ctx.skills.get(skillName, {
      cwd: agent.session.header.cwd,
      signal,
      scope: agent,
    })
    signal.throwIfAborted()
    if (skill === undefined || !isModelInvocable(skill)) return decision
    const injection = createUserMessage({
      content: [{ type: 'text', text: renderSkillContent(skill) }],
      source: { kind: 'skill-bootstrap', name: skillName, form: 'instructions' },
    })
    return { ...decision, messages: [...decision.messages, injection] }
  })
}

/**
 * Compile one configured signal, failing loud on an unreadable pattern so a
 * bad cordis.yml value cannot silently disable the gate.
 * @param source - regex source without a trailing delimiter.
 * @returns the case-insensitive compiled pattern.
 */
function compileSignal(source: string): RegExp {
  try {
    return new RegExp(source, 'i')
  } catch (error) {
    throw new Error(`skill-bootstrap: invalid programmingSignals pattern ${JSON.stringify(source)}: ${String(error)}`)
  }
}

/**
 * Whether the bootstrap gate is open for this step. A turn at or past the
 * escalation turn opens it (the session is already multi-turn); earlier, only
 * the first turn may open it, and only when its user text matches a signal.
 * @param turn - the turn that will own the step.
 * @param messages - messages claimed for this step.
 * @param escalateAtTurn - first turn number that opens the gate unconditionally.
 * @param signals - compiled programming-signal patterns.
 */
function gateOpens(
  turn: number,
  messages: readonly UserMessage[],
  escalateAtTurn: number,
  signals: readonly RegExp[],
): boolean {
  if (turn >= escalateAtTurn) return true
  if (turn !== 1) return false
  return matchesSignal(requestText(messages), signals)
}

/** The concatenated text of this step's direct user messages. */
function requestText(messages: readonly UserMessage[]): string {
  const parts: string[] = []
  for (const message of messages) {
    if ((message.source as { kind?: unknown }).kind !== 'user') continue
    for (const block of message.content) {
      if (block.type === 'text') parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function matchesSignal(text: string, signals: readonly RegExp[]): boolean {
  return signals.some(signal => signal.test(text))
}

/**
 * Whether a bootstrap message is already visible to the model: present in the
 * step's message batch or in the session's visible surface. Surface visibility,
 * not the whole log, is what decides re-injection, so a compacted session whose
 * bootstrap message was shadowed receives a fresh injection.
 */
function bootstrapVisible(agent: Agent, messages: readonly UserMessage[]): boolean {
  for (const message of messages) {
    if ((message.source as { kind?: unknown }).kind === 'skill-bootstrap') return true
  }
  for (const seq of agent.session.surface.nodes) {
    const event = agent.session.eventAt(seq)
    if (event?.type === 'user/message' && event.data.source.kind === 'skill-bootstrap') return true
  }
  return false
}
