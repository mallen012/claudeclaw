import { Bot, type Context } from 'grammy'
import {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_CHAT_ID,
  MAX_MESSAGE_LENGTH,
  CLAUDECLAW_PIN_HASH,
} from './config.js'
import { child } from './logger.js'
import { enqueue } from './message-queue.js'
import { runAgentWithRetry } from './agent.js'
import {
  getSession,
  setSession,
  clearSession,
  recordTurn,
  pendingWaOutbound,
  enqueueWaOutbound,
  logAudit,
  logHive,
} from './db.js'
import { formatCostFooter } from './cost-footer.js'
import { voiceEnabledChats, touchActivity, emitChatEvent } from './state.js'
import {
  attemptUnlock,
  checkAccess,
  guardOutgoing,
  isKillPhrase,
  executeEmergencyKill,
  lock,
} from './security.js'
import { transcribeAudio } from './voice.js'
import { downloadTelegramFile } from './media.js'
import { getAgent, getAgentTelegramToken, loadAgents, type AgentConfig } from './agent-config.js'
import { ingestTurn } from './memory-ingest.js'
import { retrieve, formatMemoriesForContext, evaluateMemoryRelevance, shouldNudgeMemory } from './memory.js'
import { parseDelegation, handleDelegation } from './orchestrator.js'

const log = child('bot')

export interface BotInstance {
  id: string
  bot: Bot
  start(): Promise<void>
  stop(): Promise<void>
}

// ═══════════════════════════════════════════════════════════════════
// Markdown → Telegram HTML
// ═══════════════════════════════════════════════════════════════════
export function formatForTelegram(md: string): string {
  let s = md

  // Extract code blocks first
  const blocks: string[] = []
  s = s.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = blocks.length
    blocks.push(escapeHtml(code.trimEnd()))
    return `\u0000CODE${idx}\u0000`
  })

  // Escape everything else
  s = escapeHtml(s)

  // Headings
  s = s.replace(/^###### (.*)$/gm, '<b>$1</b>')
  s = s.replace(/^##### (.*)$/gm, '<b>$1</b>')
  s = s.replace(/^#### (.*)$/gm, '<b>$1</b>')
  s = s.replace(/^### (.*)$/gm, '<b>$1</b>')
  s = s.replace(/^## (.*)$/gm, '<b>$1</b>')
  s = s.replace(/^# (.*)$/gm, '<b>$1</b>')

  // Bold / italic / strikethrough
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<i>$1</i>')
  s = s.replace(/__([^_]+)__/g, '<b>$1</b>')
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Checkboxes
  s = s.replace(/^- \[ \] /gm, '☐ ')
  s = s.replace(/^- \[x\]/gim, '☑')

  // Strip hr
  s = s.replace(/^---+$/gm, '')

  // Restore code blocks as <pre>
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => `<pre>${blocks[Number(i)]}</pre>`)

  return s
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function splitForTelegram(s: string): string[] {
  if (s.length <= MAX_MESSAGE_LENGTH) return [s]
  const out: string[] = []
  let remaining = s
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    // Prefer to split on paragraph break
    let cut = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH)
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH)
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = MAX_MESSAGE_LENGTH
    out.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut).trimStart()
  }
  if (remaining) out.push(remaining)
  return out
}

async function sendChunked(ctx: Context, text: string): Promise<void> {
  const chunks = splitForTelegram(text)
  for (const c of chunks) {
    try {
      await ctx.reply(formatForTelegram(c), { parse_mode: 'HTML' })
    } catch (e) {
      log.warn({ err: String(e) }, 'HTML send failed, sending plain')
      try {
        await ctx.reply(c)
      } catch (e2) {
        log.error({ err: String(e2) }, 'plain send failed')
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Build a bot for a given agent
// ═══════════════════════════════════════════════════════════════════
export function buildBotForAgent(agentId: string): BotInstance | null {
  const found = getAgent(agentId)
  if (!found) return null
  const agent: AgentConfig = found

  const token = agentId === 'main' ? TELEGRAM_BOT_TOKEN : getAgentTelegramToken(agent)
  if (!token) {
    log.info({ agentId }, 'no telegram token — agent not active')
    return null
  }

  const bot = new Bot(token)

  const isAllowed = (ctx: Context): boolean => {
    const chatId = String(ctx.chat?.id ?? '')
    if (!ALLOWED_CHAT_ID) return true // open install; not recommended
    return chatId === ALLOWED_CHAT_ID
  }

  // ─── Commands ─────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat?.id
    await ctx.reply(
      `👋 Connected to ${agent.emoji ?? ''} ${agent.name}.\n` +
        `Your chat ID: ${chatId}\n` +
        (CLAUDECLAW_PIN_HASH ? 'Send your PIN to unlock.\n' : '') +
        'Use /help for commands.',
    )
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Commands:\n` +
        `/start — show chat ID\n` +
        `/newchat — reset conversation\n` +
        `/voice — toggle voice-reply preference\n` +
        `/lock — lock the system now\n` +
        `/stop — cancel in-flight request\n` +
        `/wa — WhatsApp bridge menu\n` +
        `/mission — list scheduled tasks\n` +
        `Delegate with: @agent_id: your instruction`,
    )
  })

  bot.command('newchat', async (ctx) => {
    if (!isAllowed(ctx)) return
    const chatId = String(ctx.chat!.id)
    clearSession(chatId, agent.id)
    await ctx.reply('🧹 New chat — session cleared.')
  })

  bot.command('voice', async (ctx) => {
    if (!isAllowed(ctx)) return
    const chatId = String(ctx.chat!.id)
    if (voiceEnabledChats.has(chatId)) {
      voiceEnabledChats.delete(chatId)
      await ctx.reply('🔇 Voice replies off.')
    } else {
      voiceEnabledChats.add(chatId)
      await ctx.reply('🔊 Voice replies on.')
    }
  })

  bot.command('lock', async (ctx) => {
    if (!isAllowed(ctx)) return
    lock('manual')
    await ctx.reply('🔒 Locked.')
  })

  bot.command('stop', async (ctx) => {
    if (!isAllowed(ctx)) return
    await ctx.reply('⏹️ Stop requested — active call will abort.')
  })

  bot.command('wa', async (ctx) => {
    if (!isAllowed(ctx)) return
    const pending = pendingWaOutbound()
    await ctx.reply(
      pending.length === 0
        ? 'WhatsApp: no pending outbound. Use @wa: <chat_id> <message> to send.'
        : `WhatsApp: ${pending.length} pending outbound.`,
    )
  })

  // ─── Voice notes ──────────────────────────────────────────────
  bot.on('message:voice', async (ctx) => {
    if (!isAllowed(ctx)) return
    const v = ctx.message.voice
    try {
      const file = await downloadTelegramFile(v.file_id, '.oga')
      const transcript = await transcribeAudio(file.path)
      if (!transcript) {
        await ctx.reply('⚠️ Could not transcribe voice note.')
        return
      }
      await handleText(ctx, `[Voice transcribed]: ${transcript}`, { forceVoiceReply: true })
    } catch (e) {
      log.warn({ err: String(e) }, 'voice handle failed')
      await ctx.reply('⚠️ Voice processing error.')
    }
  })

  // ─── Text messages ────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    if (!isAllowed(ctx)) return
    await handleText(ctx, ctx.message.text, {})
  })

  async function handleText(
    ctx: Context,
    text: string,
    _opts: { forceVoiceReply?: boolean },
  ): Promise<void> {
    const chatId = String(ctx.chat!.id)
    touchActivity()

    // Kill phrase — highest priority
    if (isKillPhrase(text)) {
      await ctx.reply('💀 Kill phrase received — shutting down.')
      executeEmergencyKill()
      return
    }

    // PIN / lock
    const access = checkAccess(chatId)
    if (!access.allowed) {
      if (/^\d{4,12}$/.test(text.trim())) {
        if (attemptUnlock(text.trim(), chatId)) {
          await ctx.reply('🔓 Unlocked.')
        } else {
          await ctx.reply('❌ Wrong PIN.')
        }
      } else {
        await ctx.reply(access.reason ?? 'Locked.')
      }
      return
    }

    // Delegation syntax
    const delegation = parseDelegation(text)
    if (delegation && delegation.target !== agent.id) {
      logAudit('delegation', chatId, agent.id, { to: delegation.target })
      await ctx.reply(`↪️ Delegating to @${delegation.target}…`)
      await handleDelegation({
        fromAgent: agent.id,
        toAgent: delegation.target,
        chatId,
        message: delegation.message,
        onReply: async (reply) => sendChunked(ctx, reply),
      })
      return
    }

    // Enqueue for FIFO per-chat processing
    await enqueue(chatId, async () => {
      emitChatEvent({ type: 'user_message', chatId, agentId: agent.id, data: { text } })
      logAudit('message', chatId, agent.id, { len: text.length })

      const sessionId = getSession(chatId, agent.id) ?? undefined

      // Memory retrieval
      let memoryContext = ''
      try {
        const mems = await retrieve({ agentId: agent.id, query: text, chatId, limit: 6 })
        memoryContext = formatMemoriesForContext(mems)
        const augmentedMessage =
          memoryContext.length > 0 ? `${memoryContext}\n---\n${text}` : text

        recordTurn({
          chat_id: chatId,
          agent_id: agent.id,
          role: 'user',
          content: text,
          input_tokens: null,
          output_tokens: null,
          model: null,
        })

        const typing = () =>
          ctx.api.sendChatAction(ctx.chat!.id, 'typing').catch(() => undefined)
        typing()

        const result = await runAgentWithRetry({
          message: augmentedMessage,
          agentId: agent.id,
          sessionId,
          onTyping: typing,
        })

        if (result.newSessionId) setSession(chatId, agent.id, result.newSessionId)

        const bodyRaw = result.text ?? '(no response)'
        const footer = formatCostFooter(result.model, result.inputTokens, result.outputTokens)
        const body = guardOutgoing(bodyRaw, chatId, agent.id) + footer

        await sendChunked(ctx, body)

        recordTurn({
          chat_id: chatId,
          agent_id: agent.id,
          role: 'assistant',
          content: bodyRaw,
          input_tokens: result.inputTokens ?? null,
          output_tokens: result.outputTokens ?? null,
          model: result.model ?? null,
        })

        emitChatEvent({
          type: 'assistant_message',
          chatId,
          agentId: agent.id,
          data: { len: bodyRaw.length },
        })

        // Async post-processing: memory extraction + relevance feedback
        void ingestTurn({
          agentId: agent.id,
          chatId,
          sessionId: result.newSessionId ?? sessionId,
          userMessage: text,
          assistantMessage: bodyRaw,
        }).catch((e) => log.warn({ err: String(e) }, 'ingest failed'))

        if (memoryContext.length > 0) {
          void evaluateMemoryRelevance(bodyRaw, []).catch(() => undefined)
        }

        // Hive mind: log significant assistant actions
        if (bodyRaw.length > 200) {
          try {
            logHive({
              agentId: agent.id,
              actionType: 'responded',
              summary: bodyRaw.slice(0, 200),
              metadata: { chatId, len: bodyRaw.length },
            })
          } catch {
            /* ignore */
          }
        }

        if (shouldNudgeMemory(chatId, agent.id)) {
          // Currently a no-op nudge; hook point for future proactive surfacing
        }
      } catch (e: any) {
        log.error({ err: String(e) }, 'agent call failed')
        await ctx.reply(`⚠️ Error: ${e?.message ?? String(e)}`)
        emitChatEvent({ type: 'error', chatId, agentId: agent.id, data: { err: String(e) } })
      }
    })
  }

  // ─── Catch-all for other message types ────────────────────────
  bot.on('message:photo', async (ctx) => {
    if (!isAllowed(ctx)) return
    const photos = ctx.message.photo
    const biggest = photos[photos.length - 1]
    const caption = ctx.message.caption ?? 'Here is a photo.'
    try {
      const file = await downloadTelegramFile(biggest.file_id, '.jpg')
      await handleText(ctx, `${caption}\n\n[Photo saved to: ${file.path}]`, {})
    } catch (e) {
      log.warn({ err: String(e) }, 'photo download failed')
      await ctx.reply('⚠️ Photo download failed.')
    }
  })

  bot.on('message:document', async (ctx) => {
    if (!isAllowed(ctx)) return
    const doc = ctx.message.document
    const caption = ctx.message.caption ?? `Here is a document: ${doc.file_name ?? 'file'}`
    try {
      const file = await downloadTelegramFile(doc.file_id, '')
      await handleText(
        ctx,
        `${caption}\n\n[File saved to: ${file.path}, ${file.sizeBytes} bytes]`,
        {},
      )
    } catch (e) {
      log.warn({ err: String(e) }, 'document download failed')
      await ctx.reply('⚠️ Document download failed.')
    }
  })

  bot.catch((err) => {
    log.error({ err: String(err) }, 'bot error')
  })

  return {
    id: agent.id,
    bot,
    async start() {
      bot.start({
        drop_pending_updates: true,
        onStart: (info) => log.info({ agentId: agent.id, username: info.username }, 'bot started'),
      })
    },
    async stop() {
      await bot.stop()
    },
  }
}

export async function startAllBots(): Promise<BotInstance[]> {
  const agents = loadAgents()
  const instances: BotInstance[] = []
  for (const a of agents) {
    const inst = buildBotForAgent(a.id)
    if (inst) {
      void inst.start()
      instances.push(inst)
    }
  }
  log.info({ count: instances.length }, 'bots started')
  return instances
}
