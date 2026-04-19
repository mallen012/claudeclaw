import path from 'node:path'
import os from 'node:os'
import { readEnvFile, PROJECT_ROOT } from './env.js'

const env = readEnvFile()

function str(k: string, def = ''): string {
  return env[k] ?? process.env[k] ?? def
}
function num(k: string, def: number): number {
  const v = env[k] ?? process.env[k]
  if (v === undefined || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

// ─── Telegram ───────────────────────────────────────────
export const TELEGRAM_BOT_TOKEN = str('TELEGRAM_BOT_TOKEN')
export const ALLOWED_CHAT_ID = str('ALLOWED_CHAT_ID')

// ─── Agent SDK ─────────────────────────────────────────
export let AGENT_MODEL = str('AGENT_MODEL', 'claude-sonnet-4-6')
export let AGENT_MAX_TURNS = num('AGENT_MAX_TURNS', 30)
export let AGENT_TIMEOUT_MS = num('AGENT_TIMEOUT_MS', 900_000)
export const CLAUDE_CODE_PATH = str('CLAUDE_CODE_PATH') || undefined

export const SHOW_COST_FOOTER = str('SHOW_COST_FOOTER', 'compact') as
  | 'compact'
  | 'verbose'
  | 'cost'
  | 'full'
  | 'off'

export const STREAM_STRATEGY = str('STREAM_STRATEGY', 'off') as
  | 'global-throttle'
  | 'single-agent-only'
  | 'off'

// ─── Paths ─────────────────────────────────────────────
export { PROJECT_ROOT }
export const STORE_DIR = path.join(PROJECT_ROOT, 'store')
export const WORKSPACE_DIR = path.join(PROJECT_ROOT, 'workspace')
export const UPLOADS_DIR = path.join(WORKSPACE_DIR, 'uploads')
export const AGENTS_DIR = path.join(PROJECT_ROOT, 'agents')
export const SKILLS_DIR = path.join(PROJECT_ROOT, 'skills')

export const CLAUDECLAW_CONFIG =
  str('CLAUDECLAW_CONFIG') || path.join(os.homedir(), '.claudeclaw')

// ─── Messaging limits ──────────────────────────────────
export const MAX_MESSAGE_LENGTH = 4096
export const TYPING_REFRESH_MS = 4000

// ─── Memory v2 ─────────────────────────────────────────
export const GOOGLE_API_KEY = str('GOOGLE_API_KEY')
export const CONSOLIDATION_INTERVAL_MS = 30 * 60 * 1000
export const MEMORY_NUDGE_INTERVAL_TURNS = num('MEMORY_NUDGE_INTERVAL_TURNS', 10)
export const MEMORY_NUDGE_INTERVAL_HOURS = num('MEMORY_NUDGE_INTERVAL_HOURS', 2)
export const MEMORY_SIMILARITY_DEDUP = 0.85
export const MEMORY_SIMILARITY_RETRIEVAL_MIN = 0.3
export const MEMORY_IMPORTANCE_MIN = 0.5

// ─── Voice (Groq STT) ──────────────────────────────────
export const GROQ_API_KEY = str('GROQ_API_KEY')

// ─── Security ──────────────────────────────────────────
export const CLAUDECLAW_PIN_HASH = str('CLAUDECLAW_PIN_HASH')
export const IDLE_LOCK_MINUTES = num('IDLE_LOCK_MINUTES', 30)
export const KILL_PHRASE = str('KILL_PHRASE')

// ─── Dashboard ─────────────────────────────────────────
export const DASHBOARD_PORT = num('DASHBOARD_PORT', 3141)
export const DASHBOARD_TOKEN = str('DASHBOARD_TOKEN')

// ─── War Room ──────────────────────────────────────────
export const WARROOM_PORT = num('WARROOM_PORT', 7860)
export const WARROOM_MODE = str('WARROOM_MODE', 'live') as 'live' | 'legacy'
export const DEEPGRAM_API_KEY = str('DEEPGRAM_API_KEY')
export const CARTESIA_API_KEY = str('CARTESIA_API_KEY')

// ─── Meeting bot (Recall.ai) ───────────────────────────
export const RECALL_API_KEY = str('RECALL_API_KEY')

// ─── Scheduler ─────────────────────────────────────────
export const SCHEDULER_DEFAULT_CHAT_ID = str('SCHEDULER_DEFAULT_CHAT_ID', ALLOWED_CHAT_ID)

// ─── Logging ───────────────────────────────────────────
export const LOG_LEVEL = str('LOG_LEVEL', 'info')
export const NODE_ENV = str('NODE_ENV', 'development')

// ─── Agent overrides (runtime) ─────────────────────────
export interface AgentOverrides {
  model?: string
  maxTurns?: number
  timeoutMs?: number
}

const overrides: AgentOverrides = {}

export function setAgentOverrides(o: Partial<AgentOverrides>): void {
  Object.assign(overrides, o)
  if (o.model !== undefined) AGENT_MODEL = o.model
  if (o.maxTurns !== undefined) AGENT_MAX_TURNS = o.maxTurns
  if (o.timeoutMs !== undefined) AGENT_TIMEOUT_MS = o.timeoutMs
}

export function getAgentOverrides(): AgentOverrides {
  return { ...overrides }
}
