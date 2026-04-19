import { child } from './logger.js'
import { runAgentWithRetry } from './agent.js'
import { getAgent, loadAgents } from './agent-config.js'
import { logHive, setSession, getSession, recordTurn } from './db.js'
import { formatCostFooter } from './cost-footer.js'
import { guardOutgoing } from './security.js'

const log = child('orchestrator')

const DELEGATION_RE = /^@([a-z][a-z0-9_-]{0,29})\s*[:：]\s*([\s\S]+)$/

export function parseDelegation(text: string): { target: string; message: string } | null {
  const m = text.trim().match(DELEGATION_RE)
  if (!m) return null
  const target = m[1].toLowerCase()
  const message = m[2].trim()
  if (!getAgent(target)) return null
  return { target, message }
}

export async function handleDelegation(opts: {
  fromAgent: string
  toAgent: string
  chatId: string
  message: string
  onReply: (text: string) => Promise<void>
}): Promise<void> {
  const { fromAgent, toAgent, chatId, message, onReply } = opts

  const a = getAgent(toAgent)
  if (!a) {
    await onReply(`⚠️ Unknown agent: @${toAgent}`)
    return
  }

  const sessionId = getSession(chatId, toAgent) ?? undefined

  try {
    const result = await runAgentWithRetry({
      message,
      agentId: toAgent,
      sessionId,
    })

    if (result.newSessionId) setSession(chatId, toAgent, result.newSessionId)

    const bodyRaw = result.text ?? '(no response)'
    const footer = formatCostFooter(result.model, result.inputTokens, result.outputTokens)
    const safe = guardOutgoing(bodyRaw, chatId, toAgent)
    await onReply(safe + footer)

    recordTurn({
      chat_id: chatId,
      agent_id: toAgent,
      role: 'user',
      content: message,
      input_tokens: null,
      output_tokens: null,
      model: null,
    })
    recordTurn({
      chat_id: chatId,
      agent_id: toAgent,
      role: 'assistant',
      content: bodyRaw,
      input_tokens: result.inputTokens ?? null,
      output_tokens: result.outputTokens ?? null,
      model: result.model ?? null,
    })

    logHive({
      agentId: toAgent,
      actionType: 'delegated_response',
      summary: `from ${fromAgent}: ${bodyRaw.slice(0, 180)}`,
      metadata: { chatId, fromAgent },
    })
  } catch (e: any) {
    log.error({ err: String(e), toAgent }, 'delegation failed')
    await onReply(`⚠️ @${toAgent} failed: ${e?.message ?? String(e)}`)
  }
}

export function listAgents(): string {
  return loadAgents()
    .map((a) => `${a.emoji ?? '•'} @${a.id} — ${a.description ?? ''}`)
    .join('\n')
}
