import cronParser from 'cron-parser'
import { Bot } from 'grammy'
import {
  TELEGRAM_BOT_TOKEN,
  SCHEDULER_DEFAULT_CHAT_ID,
} from './config.js'
import { child } from './logger.js'
import {
  getDueMissions,
  updateMissionAfterRun,
  logHive,
} from './db.js'
import { runAgentWithRetry } from './agent.js'
import { getAgent, getAgentTelegramToken } from './agent-config.js'
import { formatCostFooter } from './cost-footer.js'
import { guardOutgoing } from './security.js'

const log = child('scheduler')

export function nextCronRun(cron: string, from: number = Date.now()): number | null {
  try {
    const interval = cronParser.parseExpression(cron, { currentDate: new Date(from) })
    return interval.next().getTime()
  } catch (e) {
    log.warn({ err: String(e), cron }, 'invalid cron expression')
    return null
  }
}

async function sendToChat(
  agentId: string,
  chatId: string,
  body: string,
): Promise<void> {
  const agent = getAgent(agentId)
  const token =
    (agent && agentId !== 'main' && getAgentTelegramToken(agent)) || TELEGRAM_BOT_TOKEN
  if (!token) {
    log.warn({ agentId }, 'no telegram token — cannot deliver mission output')
    return
  }
  const bot = new Bot(token)
  // Split long messages
  const chunks: string[] = []
  let rem = body
  while (rem.length > 4000) {
    chunks.push(rem.slice(0, 4000))
    rem = rem.slice(4000)
  }
  if (rem) chunks.push(rem)
  for (const c of chunks) {
    try {
      await bot.api.sendMessage(chatId, c)
    } catch (e) {
      log.warn({ err: String(e) }, 'mission send failed')
    }
  }
}

async function runMission(m: import('./db.js').MissionRow): Promise<void> {
  log.info({ id: m.id, name: m.name, agent: m.agent_id }, 'mission running')
  try {
    const result = await runAgentWithRetry({
      message: m.prompt,
      agentId: m.agent_id,
      maxTurns: 20,
    })
    const bodyRaw = result.text ?? '(no response)'
    const footer = formatCostFooter(result.model, result.inputTokens, result.outputTokens)
    const chatId = m.chat_id ?? SCHEDULER_DEFAULT_CHAT_ID
    if (chatId) {
      const safe = guardOutgoing(bodyRaw, chatId, m.agent_id)
      await sendToChat(m.agent_id, chatId, `📅 [${m.name}]\n\n${safe}${footer}`)
    }

    const next = m.cron ? nextCronRun(m.cron) : null
    updateMissionAfterRun(m.id, 'completed', bodyRaw.slice(0, 2000), null, next)

    logHive({
      agentId: m.agent_id,
      actionType: 'mission',
      summary: `Ran: ${m.name}`,
      metadata: { missionId: m.id, len: bodyRaw.length },
    })
  } catch (e: any) {
    log.error({ err: String(e), id: m.id }, 'mission failed')
    const next = m.cron ? nextCronRun(m.cron) : null
    updateMissionAfterRun(m.id, 'failed', null, String(e), next)
  }
}

let timer: NodeJS.Timeout | null = null

export function startScheduler(): void {
  if (timer) return
  const tick = async () => {
    const now = Date.now()
    const due = getDueMissions(now)
    for (const m of due) {
      // Mark next_run forward immediately so we don't double-fire on slow runs
      const provisional = m.cron ? nextCronRun(m.cron, now + 1000) : null
      updateMissionAfterRun(m.id, 'running' as any, null, null, provisional)
      void runMission(m)
    }
  }
  timer = setInterval(tick, 60_000)
  log.info('scheduler started (60s tick)')
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
