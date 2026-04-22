import { query } from '@anthropic-ai/claude-agent-sdk'
import { AGENT_MODEL, AGENT_MAX_TURNS, AGENT_TIMEOUT_MS, PROJECT_ROOT, CLAUDE_CODE_PATH } from './config.js'
import { child } from './logger.js'
import { classifyError } from './errors.js'
import { getAgent, resolveAgentDir, resolveAgentSystemPrompt } from './agent-config.js'
import { recordUsage } from './db.js'

const log = child('agent')

export interface AgentOptions {
  message: string
  sessionId?: string
  agentId?: string
  cwd?: string
  systemPrompt?: string
  onTyping?: () => void
  onProgress?: (note: string) => void
  maxTurns?: number
  abortSignal?: AbortSignal
}

export interface AgentResult {
  text: string | null
  newSessionId?: string
  inputTokens?: number
  outputTokens?: number
  model?: string
}

function resolveContext(opts: AgentOptions): { cwd: string; system?: string; maxTurns: number } {
  let cwd = opts.cwd ?? PROJECT_ROOT
  let system = opts.systemPrompt
  let maxTurns = opts.maxTurns ?? AGENT_MAX_TURNS

  if (opts.agentId) {
    const a = getAgent(opts.agentId)
    if (a) {
      if (!opts.cwd) cwd = resolveAgentDir(a)
      if (!system) system = resolveAgentSystemPrompt(a)
      if (!opts.maxTurns && a.max_turns) maxTurns = a.max_turns
    }
  }
  return { cwd, system, maxTurns }
}

export async function runAgent(opts: AgentOptions): Promise<AgentResult> {
  const { cwd, system, maxTurns } = resolveContext(opts)
  const agentId = opts.agentId ?? 'main'

  log.debug({ agentId, cwd, sessionId: opts.sessionId, maxTurns }, 'runAgent start')

  const typingInterval = opts.onTyping
    ? setInterval(() => {
        try {
          opts.onTyping!()
        } catch {
          /* ignore */
        }
      }, 4000)
    : null

  let text: string | null = null
  let newSessionId: string | undefined
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let model: string | undefined

  const timeoutAbort = new AbortController()
  const timer = setTimeout(() => timeoutAbort.abort(), AGENT_TIMEOUT_MS)

  try {
    // NOTE: the SDK chooses signals/abort per its own options; we compose via
    // a race below where supported. If abortSignal is supplied externally, we
    // also listen for it.
    const externalAbort = opts.abortSignal
    if (externalAbort) {
      externalAbort.addEventListener('abort', () => timeoutAbort.abort(), { once: true })
    }

    const queryOpts: Record<string, unknown> = {
      cwd,
      model: AGENT_MODEL,
      permissionMode: 'bypassPermissions',
      maxTurns,
    }
    if (opts.sessionId) queryOpts.resume = opts.sessionId
    if (system) queryOpts.appendSystemPrompt = system
    if (CLAUDE_CODE_PATH) queryOpts.pathToClaudeCodeExecutable = CLAUDE_CODE_PATH

    const iter = query({
      prompt: opts.message,
      options: queryOpts as any,
    })

    for await (const event of iter) {
      if (timeoutAbort.signal.aborted) break

      if (event.type === 'system' && (event as any).subtype === 'init') {
        const sid = (event as any).session_id
        if (sid) newSessionId = sid
        continue
      }

      if (event.type === 'result') {
        const r = (event as any).result
        if (typeof r === 'string') text = r
        else if (r && typeof r.result === 'string') text = r.result
        else if (r && typeof r.content === 'string') text = r.content

        const usage = (event as any).usage
        if (usage) {
          inputTokens = usage.input_tokens ?? usage.inputTokens
          outputTokens = usage.output_tokens ?? usage.outputTokens
        }
        const m = (event as any).model
        if (m) model = m
        continue
      }

      if (event.type === 'assistant') {
        const content = (event as any).message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use' && opts.onProgress) {
              opts.onProgress(`🔧 ${block.name ?? 'tool'}`)
            }
          }
        }
      }
    }
  } finally {
    if (typingInterval) clearInterval(typingInterval)
    clearTimeout(timer)
  }

  if (inputTokens !== undefined && outputTokens !== undefined) {
    try {
      recordUsage(agentId, inputTokens, outputTokens, 0)
    } catch (e) {
      log.warn({ err: String(e) }, 'recordUsage failed')
    }
  }

  log.debug(
    { agentId, newSessionId, inputTokens, outputTokens, len: text?.length ?? 0 },
    'runAgent done',
  )

  return { text, newSessionId, inputTokens, outputTokens, model: model ?? AGENT_MODEL }
}

export async function runAgentWithRetry(
  opts: AgentOptions,
  maxRetries = 2,
): Promise<AgentResult> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runAgent(opts)
    } catch (e: any) {
      lastErr = e
      const { category, recovery } = classifyError(e)
      log.warn({ attempt, category, err: String(e) }, 'agent call failed')
      if (!recovery.shouldRetry || attempt === maxRetries) break
      const backoff = recovery.retryAfterMs * 2 ** attempt
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr ?? new Error('runAgent failed')
}
