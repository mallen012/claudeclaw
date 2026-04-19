#!/usr/bin/env node
/**
 * Voice bridge — invoked by the Pipecat Python server as a subprocess to
 * run a turn against a Claude Code agent. Reads:
 *   --agent <agent_id>    (required)
 *   --chat-id <id>        (optional, for session persistence)
 *   --quick               (optional, cap maxTurns at 3 for low-latency voice)
 *   prompt                (positional, read from argv OR stdin)
 *
 * Writes a single JSON line to stdout:
 *   {"ok": true, "text": "...", "model": "...", "input_tokens": N, "output_tokens": N}
 * On error:
 *   {"ok": false, "error": "..."}
 */
import { runAgentWithRetry } from './agent.js'
import { getSession, setSession } from './db.js'

// Strip sensitive env vars from the subprocess view — the Node SDK reads its
// own auth; we do not want Python to observe our .env.
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GOOGLE_API_KEY', 'TELEGRAM_BOT_TOKEN']) {
  if (process.env[k]) delete process.env[k]
}

function parseArgs(argv: string[]): { agentId: string; chatId?: string; quick: boolean; prompt: string } {
  let agentId = 'main'
  let chatId: string | undefined
  let quick = false
  const rest: string[] = []
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--agent') agentId = argv[++i]
    else if (a === '--chat-id') chatId = argv[++i]
    else if (a === '--quick') quick = true
    else rest.push(a)
  }
  return { agentId, chatId, quick, prompt: rest.join(' ') }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data.trim()
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const prompt = args.prompt || (await readStdin())
  if (!prompt) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'no prompt' }) + '\n')
    process.exit(2)
  }

  try {
    const sessionId = args.chatId ? getSession(args.chatId, args.agentId) ?? undefined : undefined
    const result = await runAgentWithRetry({
      message: prompt,
      agentId: args.agentId,
      sessionId,
      maxTurns: args.quick ? 3 : undefined,
    })
    if (args.chatId && result.newSessionId) {
      setSession(args.chatId, args.agentId, result.newSessionId)
    }
    process.stdout.write(
      JSON.stringify({
        ok: true,
        text: result.text ?? '',
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      }) + '\n',
    )
  } catch (e: any) {
    process.stdout.write(JSON.stringify({ ok: false, error: e?.message ?? String(e) }) + '\n')
    process.exit(1)
  }
}

main()
