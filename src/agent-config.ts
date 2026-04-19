import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { PROJECT_ROOT, CLAUDECLAW_CONFIG, AGENT_MODEL, AGENT_MAX_TURNS, AGENT_TIMEOUT_MS } from './config.js'
import { child } from './logger.js'
import { readEnvFile } from './env.js'

const log = child('agent-config')

export interface AgentConfig {
  id: string
  name: string
  emoji?: string
  description?: string
  cwd: string
  claude_md: string
  telegram_token_env: string
  model?: string
  max_turns?: number
  timeout_ms?: number
  mcp_allowlist?: string[]
}

interface AgentYaml {
  defaults?: {
    model?: string
    max_turns?: number
    timeout_ms?: number
    mcp_allowlist?: string[]
  }
  agents: AgentConfig[]
}

const AGENT_ID_RE = /^[a-z][a-z0-9_-]{0,29}$/

function readYaml(p: string): AgentYaml | null {
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    return yaml.load(raw) as AgentYaml
  } catch {
    return null
  }
}

let cache: AgentConfig[] | null = null

export function loadAgents(): AgentConfig[] {
  if (cache) return cache

  const baseYaml = readYaml(path.join(PROJECT_ROOT, 'agent.yaml'))
  const overrideYaml = readYaml(path.join(CLAUDECLAW_CONFIG, 'agent.yaml'))

  const defaults = {
    model: AGENT_MODEL,
    max_turns: AGENT_MAX_TURNS,
    timeout_ms: AGENT_TIMEOUT_MS,
    mcp_allowlist: [] as string[],
    ...(baseYaml?.defaults ?? {}),
    ...(overrideYaml?.defaults ?? {}),
  }

  const agentMap = new Map<string, AgentConfig>()
  for (const a of baseYaml?.agents ?? []) agentMap.set(a.id, a)
  for (const a of overrideYaml?.agents ?? []) {
    const prev = agentMap.get(a.id)
    agentMap.set(a.id, { ...(prev ?? {}), ...a } as AgentConfig)
  }

  const agents = Array.from(agentMap.values()).map((a) => ({
    ...a,
    model: a.model ?? defaults.model,
    max_turns: a.max_turns ?? defaults.max_turns,
    timeout_ms: a.timeout_ms ?? defaults.timeout_ms,
    mcp_allowlist: a.mcp_allowlist ?? defaults.mcp_allowlist,
  }))

  for (const a of agents) {
    if (!AGENT_ID_RE.test(a.id)) {
      log.warn({ id: a.id }, 'invalid agent id — must match /^[a-z][a-z0-9_-]{0,29}$/')
    }
  }

  if (agents.length > 20) {
    log.warn({ count: agents.length }, 'more than 20 agents defined — capping at 20')
  }

  cache = agents.slice(0, 20)
  return cache
}

export function reloadAgents(): AgentConfig[] {
  cache = null
  return loadAgents()
}

export function getAgent(id: string): AgentConfig | null {
  return loadAgents().find((a) => a.id === id) ?? null
}

export function resolveAgentDir(agent: AgentConfig): string {
  if (!agent.cwd) return PROJECT_ROOT
  if (path.isAbsolute(agent.cwd)) return agent.cwd
  return path.join(PROJECT_ROOT, agent.cwd)
}

export function resolveAgentClaudeMd(agent: AgentConfig): string {
  if (!agent.claude_md) return ''
  if (path.isAbsolute(agent.claude_md)) return agent.claude_md
  return path.join(PROJECT_ROOT, agent.claude_md)
}

export function resolveAgentSystemPrompt(agent: AgentConfig): string | undefined {
  const mdPath = resolveAgentClaudeMd(agent)
  if (!mdPath) return undefined
  try {
    return fs.readFileSync(mdPath, 'utf-8')
  } catch {
    return undefined
  }
}

export function getAgentTelegramToken(agent: AgentConfig): string {
  const env = readEnvFile()
  return env[agent.telegram_token_env] ?? process.env[agent.telegram_token_env] ?? ''
}

export function getActiveAgents(): AgentConfig[] {
  // An agent is "active" if its telegram token is set. Main is always considered active.
  return loadAgents().filter((a) => a.id === 'main' || getAgentTelegramToken(a))
}
