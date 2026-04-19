import {
  getUnconsolidatedMemories,
  markMemoryConsolidated,
  insertConsolidation,
  supersedeMemory,
  type MemoryRow,
} from './db.js'
import { generateJson } from './gemini.js'
import { CONSOLIDATION_INTERVAL_MS } from './config.js'
import { child } from './logger.js'

const log = child('consolidate')

interface ConsolidationOutput {
  summary: string
  insight?: string
  connections?: Array<{ memory_ids: number[]; relation: string }>
  contradictions?: Array<{ winner_id: number; loser_id: number; reason: string }>
  group_agent_id?: string
}

function buildPrompt(mems: MemoryRow[]): string {
  const lines = mems.map(
    (m) =>
      `[id=${m.id}, agent=${m.agent_id}, imp=${m.importance.toFixed(2)}] ${
        m.summary ?? m.content.slice(0, 300)
      }`,
  )
  return `You are consolidating memory across a multi-agent assistant system.

Given these recent memories, produce a JSON object:
{
  "summary": "2-3 sentence synthesis of what these memories collectively establish",
  "insight": "1 non-obvious pattern or theme linking them (or null)",
  "connections": [{"memory_ids": [id1, id2], "relation": "why they relate"}],
  "contradictions": [{"winner_id": id, "loser_id": id, "reason": "why the newer/more-important one wins"}]
}

For contradictions: the winner should be the more recent OR higher-importance memory. Only flag genuine factual contradictions, not minor wording differences.

Memories:
${lines.join('\n')}

Respond with ONLY the JSON object.`
}

export async function consolidateOnce(): Promise<number> {
  const mems = getUnconsolidatedMemories(20)
  if (mems.length < 3) return 0

  // Group by agent
  const byAgent = new Map<string, MemoryRow[]>()
  for (const m of mems) {
    const arr = byAgent.get(m.agent_id) ?? []
    arr.push(m)
    byAgent.set(m.agent_id, arr)
  }

  let totalConsolidated = 0

  for (const [agentId, agentMems] of byAgent) {
    if (agentMems.length < 3) continue
    const result = await generateJson<ConsolidationOutput>(buildPrompt(agentMems))
    if (!result) continue

    const sourceIds = agentMems.map((m) => m.id)
    insertConsolidation({
      agentId,
      summary: result.summary,
      insight: result.insight,
      connections: result.connections,
      contradictions: result.contradictions,
      sourceMemoryIds: sourceIds,
    })

    // Apply supersessions
    for (const c of result.contradictions ?? []) {
      if (typeof c.winner_id === 'number' && typeof c.loser_id === 'number') {
        try {
          supersedeMemory(c.loser_id, c.winner_id)
        } catch {
          /* ignore */
        }
      }
    }

    markMemoryConsolidated(sourceIds)
    totalConsolidated += sourceIds.length
  }

  if (totalConsolidated > 0) {
    log.info({ consolidated: totalConsolidated }, 'consolidation complete')
  }
  return totalConsolidated
}

let timer: NodeJS.Timeout | null = null

export function startConsolidationLoop(): void {
  if (timer) return
  const tick = async () => {
    try {
      await consolidateOnce()
    } catch (e) {
      log.warn({ err: String(e) }, 'consolidation tick failed')
    }
  }
  timer = setInterval(tick, CONSOLIDATION_INTERVAL_MS)
  log.info({ intervalMs: CONSOLIDATION_INTERVAL_MS }, 'consolidation loop started')
}

export function stopConsolidationLoop(): void {
  if (timer) clearInterval(timer)
  timer = null
}
