#!/usr/bin/env node
/**
 * Meeting bot — joins Google Meet / Zoom / Webex / Teams meetings via
 * Recall.ai. Produces a 75-second pre-flight briefing from Calendar, Gmail,
 * and memory, then dispatches a bot to the meeting URL.
 */
import { RECALL_API_KEY, ALLOWED_CHAT_ID, TELEGRAM_BOT_TOKEN } from './config.js'
import { runAgentWithRetry } from './agent.js'
import { Bot } from 'grammy'
import { child } from './logger.js'

const log = child('meet')

interface RecallBotParams {
  meeting_url: string
  bot_name?: string
  join_at?: string  // ISO 8601, future
  transcription_options?: Record<string, unknown>
  recording_mode?: string
  automatic_leave?: Record<string, unknown>
}

async function createRecallBot(params: RecallBotParams): Promise<{ id: string; status: string }> {
  if (!RECALL_API_KEY) throw new Error('RECALL_API_KEY is not set')

  const body = {
    meeting_url: params.meeting_url,
    bot_name: params.bot_name ?? 'Claude (Mike Allen)',
    join_at: params.join_at,
    transcription_options: params.transcription_options ?? {
      provider: 'meeting_captions',
    },
    recording_mode: params.recording_mode ?? 'speaker_view',
    automatic_leave: params.automatic_leave ?? {
      waiting_room_timeout: 1200,
      noone_joined_timeout: 1200,
    },
  }

  const res = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
    method: 'POST',
    headers: {
      Authorization: `Token ${RECALL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`recall.ai ${res.status}: ${err}`)
  }

  return (await res.json()) as { id: string; status: string }
}

async function sendBriefing(chatId: string, text: string): Promise<void> {
  if (!chatId || !TELEGRAM_BOT_TOKEN) return
  const bot = new Bot(TELEGRAM_BOT_TOKEN)
  await bot.api.sendMessage(chatId, text).catch((e) => log.warn({ err: String(e) }, 'briefing send failed'))
}

async function preflightBriefing(meetingUrl: string, when: string): Promise<string> {
  const prompt = `You are preparing Mike for a meeting 75 seconds from now.

Meeting URL: ${meetingUrl}
Scheduled start: ${when}

Pull together:
1. Meeting context (who's attending, what's on the agenda) — check Google Calendar.
2. Recent email threads with the attendees (Gmail).
3. Relevant memory facts about the attendees, the project, or past decisions.
4. A one-line "pitfall to avoid" or "thing to confirm" based on what you find.

Keep the whole briefing under 500 characters. Bullet points. Skimmable on a phone. If info is missing, say so — don't fabricate.`

  const result = await runAgentWithRetry({
    message: prompt,
    agentId: 'main',
    maxTurns: 10,
  })
  return result.text ?? '(briefing unavailable)'
}

function usage(): void {
  console.log(`Usage:
  meet join <meeting_url> [--at <ISO datetime>] [--name "Bot name"]
  meet brief <meeting_url> [--at <ISO datetime>]
  meet status <bot_id>

Env: RECALL_API_KEY (required)`)
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv
  const args = new Map<string, string>()
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      args.set(rest[i].slice(2), rest[i + 1])
      i++
    } else {
      positional.push(rest[i])
    }
  }

  switch (cmd) {
    case 'join': {
      const url = positional[0]
      if (!url) {
        usage()
        process.exit(1)
      }
      const joinAt = args.get('at')
      // Compute briefing lead time: 75s before join_at, or immediate
      const when = joinAt ?? new Date().toISOString()
      const briefStart = joinAt
        ? new Date(new Date(joinAt).getTime() - 75_000).toISOString()
        : null

      // Fire briefing (async — send to Mike's Telegram)
      preflightBriefing(url, when)
        .then((brief) => sendBriefing(ALLOWED_CHAT_ID, `📋 Meeting briefing\n\n${brief}\n\n🔗 ${url}`))
        .catch((e) => log.warn({ err: String(e) }, 'briefing failed'))

      const bot = await createRecallBot({
        meeting_url: url,
        bot_name: args.get('name'),
        join_at: joinAt,
      })
      console.log(JSON.stringify(bot, null, 2))
      if (briefStart) console.log(`Briefing will fire around ${briefStart}`)
      return
    }
    case 'brief': {
      const url = positional[0]
      if (!url) {
        usage()
        process.exit(1)
      }
      const when = args.get('at') ?? new Date().toISOString()
      const brief = await preflightBriefing(url, when)
      console.log(brief)
      await sendBriefing(ALLOWED_CHAT_ID, `📋 Meeting briefing\n\n${brief}`)
      return
    }
    case 'status': {
      const botId = positional[0]
      if (!botId) {
        usage()
        process.exit(1)
      }
      const res = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}`, {
        headers: { Authorization: `Token ${RECALL_API_KEY}` },
      })
      console.log(await res.text())
      return
    }
    default:
      usage()
      process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
