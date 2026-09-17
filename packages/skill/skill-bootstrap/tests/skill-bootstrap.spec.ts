import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as skillBootstrap from '@deepseek-ai/dsh-skill-bootstrap'

async function setup(config: skillBootstrap.Config = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(skillBootstrap, config)
  return ctx
}

function registerSkill(ctx: Context, name = 'using-superpowers', invocation = { modelInvocable: true, userInvocable: true }): void {
  ctx.skills.register({ name, description: 'Bootstrap skill', invocation, source: 'runtime', content: 'BOOTSTRAP BODY' })
}

function sessionAgent(session: Session, id = 'bootstrap-agent'): Agent {
  return {
    id: SessionId(id),
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('skill-bootstrap must not use agent.inject()') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function openTurn(session: Session, turn: number, text: string): void {
  session.append('turn/start', { turn })
  session.append('user/message', userMessage(text), { surfaceOp: 'append' })
}

async function fireStep(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
  messages: UserMessage[],
): Promise<PreStepDecision> {
  const signal = new AbortController().signal
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages, turn, step, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [...messages] }),
  )
  if (decision.kind === 'enter') {
    for (const message of decision.messages) {
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
  return decision
}

function bootstrapMessages(session: Session): Extract<SessionEvent, { type: 'user/message' }>[] {
  return session.snapshotEvents().filter((event): event is Extract<SessionEvent, { type: 'user/message' }> =>
    event.type === 'user/message' && event.data.source.kind === 'skill-bootstrap')
}

describe('dsh-skill-bootstrap', () => {
  it('injects the bootstrapped skill body on a first request matching a programming signal', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-match'))
    const agent = sessionAgent(session)

    const decision = await fireStep(ctx, agent, 1, 1, [userMessage('fix the bug in src/parser.ts')])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    const injection = decision.messages.at(-1)
    expect(injection?.source).toEqual({ kind: 'skill-bootstrap', name: 'using-superpowers', form: 'instructions' })
    expect(JSON.stringify(injection?.content)).toContain('BOOTSTRAP BODY')
    expect(bootstrapMessages(session)).toHaveLength(1)
  })

  it('does not inject for a trivial first request', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-trivial'))
    const agent = sessionAgent(session)

    const decision = await fireStep(ctx, agent, 1, 1, [userMessage('what time is it?')])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(decision.messages.some(message => (message.source as { kind?: unknown }).kind === 'skill-bootstrap')).toBe(false)
    expect(bootstrapMessages(session)).toHaveLength(0)
  })

  it('escalates and injects at the escalation turn after a trivial first request', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-escalate'))
    const agent = sessionAgent(session)
    openTurn(session, 1, 'what time is it?')

    const first = await fireStep(ctx, agent, 1, 1, [userMessage('what time is it?')])
    if (first.kind !== 'enter') throw new Error('expected enter')
    expect(bootstrapMessages(session)).toHaveLength(0)

    openTurn(session, 2, 'and now implement the thing')
    const second = await fireStep(ctx, agent, 2, 1, [userMessage('and now implement the thing')])
    if (second.kind !== 'enter') throw new Error('expected enter')
    expect(bootstrapMessages(session)).toHaveLength(1)
  })

  it('injects once and never re-injects while the message stays visible', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-once'))
    const agent = sessionAgent(session)

    await fireStep(ctx, agent, 1, 1, [userMessage('implement the feature')])
    expect(bootstrapMessages(session)).toHaveLength(1)

    openTurn(session, 2, 'continue')
    await fireStep(ctx, agent, 2, 1, [userMessage('continue')])
    expect(bootstrapMessages(session)).toHaveLength(1)
  })

  it('re-injects after compaction shadows the bootstrap message', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-compact'))
    const agent = sessionAgent(session)
    openTurn(session, 1, 'fix the parser')
    await fireStep(ctx, agent, 1, 1, [userMessage('fix the parser')])
    const initial = bootstrapMessages(session)[0]
    if (initial === undefined) throw new Error('expected initial injection')

    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted history' }],
      source: { kind: 'plugin', plugin: 'compact' },
    }), {
      surfaceOp: { op: 'replace', startSeq: initial.seq, endSeq: initial.seq },
      sourceEventSeqs: [initial.seq],
    })

    openTurn(session, 2, 'keep going')
    await fireStep(ctx, agent, 2, 1, [userMessage('keep going')])

    expect(bootstrapMessages(session)).toHaveLength(2)
  })

  it('does not inject when the named skill is absent or not model-invocable', async () => {
    const ctx = await setup()
    const session = Session.create(SessionId('bootstrap-absent'))
    const agent = sessionAgent(session)

    await fireStep(ctx, agent, 1, 1, [userMessage('fix the bug')])
    expect(bootstrapMessages(session)).toHaveLength(0)

    registerSkill(ctx, 'using-superpowers', { modelInvocable: false, userInvocable: true })
    await fireStep(ctx, agent, 1, 2, [userMessage('fix the bug again')])
    expect(bootstrapMessages(session)).toHaveLength(0)
  })

  it('rejects an invalid skill name, escalation turn, and signal pattern', async () => {
    await expect(setup({ skillName: 'Bad_Name' })).rejects.toThrow('not a valid skill name')
    await expect(setup({ escalateAtTurn: 0 })).rejects.toThrow('escalateAtTurn')
    await expect(setup({ programmingSignals: ['\\b(never'] })).rejects.toThrow('invalid programmingSignals pattern')
  })

  it('passes a downstream reject through unchanged', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-reject'))
    const agent = sessionAgent(session)
    const signal = new AbortController().signal
    const decision = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [userMessage('fix the bug')], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'reject' as const }),
    )
    expect(decision).toEqual({ kind: 'reject' })
    expect(bootstrapMessages(session)).toHaveLength(0)
  })

  it('does not inject below a raised escalation turn on a later turn', async () => {
    const ctx = await setup({ escalateAtTurn: 3 })
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-raised-escalation'))
    const agent = sessionAgent(session)

    const decision = await fireStep(ctx, agent, 2, 1, [userMessage('implement the feature')])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(bootstrapMessages(session)).toHaveLength(0)
  })

  it('ignores non-user sources and non-text blocks when classifying the first request', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-source-filter'))
    const agent = sessionAgent(session)
    const forged = createUserMessage({
      content: [{ type: 'text', text: 'implement the feature' }],
      source: { kind: 'plugin', plugin: 'forged' },
    })
    const reasoningOnly = createUserMessage({
      content: [{ type: 'reasoning', text: 'implement the feature' }],
      source: { kind: 'user' },
    })

    const decision = await fireStep(ctx, agent, 1, 1, [forged, reasoningOnly])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(bootstrapMessages(session)).toHaveLength(0)
  })

  it('does not double-inject when the batch already carries a bootstrap message', async () => {
    const ctx = await setup()
    registerSkill(ctx)
    const session = Session.create(SessionId('bootstrap-batch-visible'))
    const agent = sessionAgent(session)
    const already = createUserMessage({
      content: [{ type: 'text', text: 'already bootstrapped' }],
      source: { kind: 'skill-bootstrap', name: 'using-superpowers', form: 'instructions' },
    })

    const decision = await fireStep(ctx, agent, 1, 1, [already])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(decision.messages.filter(message => (message.source as { kind?: unknown }).kind === 'skill-bootstrap')).toHaveLength(1)
  })

  it('applies defaults when invoked directly without schema resolution', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SkillRegistry)
    registerSkill(ctx)
    skillBootstrap.apply(ctx)
    const session = Session.create(SessionId('bootstrap-direct-apply'))
    const agent = sessionAgent(session)

    const decision = await fireStep(ctx, agent, 1, 1, [userMessage('fix the bug')])

    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(decision.messages.at(-1)?.source).toEqual({ kind: 'skill-bootstrap', name: 'using-superpowers', form: 'instructions' })
  })

  it('removes the listener on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SkillRegistry)
    registerSkill(ctx)
    const fiber = await ctx.plugin(skillBootstrap)
    const session = Session.create(SessionId('bootstrap-dispose'))
    const agent = sessionAgent(session)

    await fireStep(ctx, agent, 1, 1, [userMessage('fix the bug')])
    expect(bootstrapMessages(session)).toHaveLength(1)

    await fiber.dispose()
    await fireStep(ctx, agent, 1, 2, [userMessage('fix another bug')])
    expect(bootstrapMessages(session)).toHaveLength(1)
  })
})
