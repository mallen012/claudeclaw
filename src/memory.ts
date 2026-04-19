import {
  db,
  insertMemory,
  listMemories,
  searchMemoriesFTS,
  recentHighImportanceMemories,
  recentHive,
  getRecentTurns,
  countTurns,
  touchMemoryAccess,
  pinMemory,
  supersedeMemory,
  recordMemoryRelevance,
  getMemoryById,
  decaySweep,
  type MemoryRow,
} from './db.js'
import {
  embed,
  packEmbedding,
  unpackEmbedding,
  cosineSimilarity,
} from './embeddings.js'
import {
  MEMORY_SIMILARITY_DEDUP,
  MEMORY_SIMILARITY_RETRIEVAL_MIN,
  MEMORY_NUDGE_INTERVAL_TURNS,
  MEMORY_NUDGE_INTERVAL_HOURS,
} from './config.js'
import { child } from './logger.js'
import { generateJson } from './gemini.js'

const log = child('memory')

// ─── Store a new memory ────────────────────────────────────────────
export interface StoreMemoryInput {
  chatId?: string
  agentId: string
  sessionId?: string
  content: string
  summary?: string
  entities?: string[]
  topics?: string[]
  importance: number
  salience?: number
}

export async function storeMemory(input: StoreMemoryInput): Promise<number | null> {
  // Embed first, check dedup against recent agent memories
  const vec = await embed(input.content)
  if (vec) {
    const candidates = listMemories(input.agentId, 200)
    for (const c of candidates) {
      if (!c.embedding) continue
      const cv = unpackEmbedding(c.embedding as Buffer)
      const sim = cosineSimilarity(vec, cv)
      if (sim >= MEMORY_SIMILARITY_DEDUP) {
        log.info({ existingId: c.id, sim }, 'memory duplicate — merging access')
        touchMemoryAccess([c.id])
        return c.id
      }
    }
  }

  const id = insertMemory({
    ...input,
    embedding: vec ? packEmbedding(vec) : null,
  })
  return id
}

// ─── 5-layer retrieval ─────────────────────────────────────────────
export interface RetrievedMemory extends MemoryRow {
  score: number
  source: 'embed' | 'fts' | 'recent' | 'hive' | 'turn'
}

export async function retrieve(opts: {
  agentId: string
  query: string
  chatId?: string
  limit?: number
  includeHive?: boolean
  includeTurns?: boolean
}): Promise<RetrievedMemory[]> {
  const limit = opts.limit ?? 10
  const results: RetrievedMemory[] = []
  const seen = new Set<number>()

  // Layer 1 — embedding similarity
  const vec = await embed(opts.query)
  if (vec) {
    const candidates = listMemories(opts.agentId, 500)
    const scored: { m: MemoryRow; sim: number }[] = []
    for (const m of candidates) {
      if (!m.embedding) continue
      const cv = unpackEmbedding(m.embedding as Buffer)
      const sim = cosineSimilarity(vec, cv)
      if (sim >= MEMORY_SIMILARITY_RETRIEVAL_MIN) scored.push({ m, sim })
    }
    scored.sort((a, b) => b.sim - a.sim)
    for (const s of scored.slice(0, limit)) {
      if (seen.has(s.m.id)) continue
      seen.add(s.m.id)
      results.push({ ...s.m, score: s.sim, source: 'embed' })
    }
  }

  // Layer 2 — FTS keyword
  const ftsRows = searchMemoriesFTS(escapeFts(opts.query), opts.agentId, Math.max(5, limit))
  for (const m of ftsRows) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    results.push({ ...m, score: 0.5, source: 'fts' })
  }

  // Layer 3 — recent + high-importance
  const recent = recentHighImportanceMemories(opts.agentId, 0.6, 5)
  for (const m of recent) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    results.push({ ...m, score: m.importance, source: 'recent' })
  }

  // Layer 4 — hive mind cross-agent
  if (opts.includeHive !== false) {
    const hive = recentHive(5)
    for (const h of hive) {
      if (h.agent_id === opts.agentId) continue
      // Synthetic memory row
      results.push({
        id: -h.id,
        chat_id: null,
        agent_id: h.agent_id,
        session_id: null,
        content: `[hive: ${h.agent_id}] ${h.summary}`,
        summary: null,
        entities: null,
        topics: null,
        importance: 0.5,
        salience: 2.5,
        embedding: null,
        pinned: 0,
        consolidated: 0,
        superseded_by: null,
        access_count: 0,
        last_accessed_at: null,
        created_at: h.created_at,
        score: 0.4,
        source: 'hive',
      })
    }
  }

  // Layer 5 — recent conversation turns
  if (opts.chatId && opts.includeTurns !== false) {
    const turns = getRecentTurns(opts.chatId, opts.agentId, 6)
    for (const t of turns.reverse()) {
      results.push({
        id: -100000 - t.id,
        chat_id: t.chat_id,
        agent_id: t.agent_id,
        session_id: null,
        content: `[${t.role}] ${t.content.slice(0, 300)}`,
        summary: null,
        entities: null,
        topics: null,
        importance: 0.4,
        salience: 2.0,
        embedding: null,
        pinned: 0,
        consolidated: 0,
        superseded_by: null,
        access_count: 0,
        last_accessed_at: null,
        created_at: t.created_at,
        score: 0.3,
        source: 'turn',
      })
    }
  }

  // Touch actual (positive-ID) memories as accessed
  const touched = results.filter((r) => r.id > 0).map((r) => r.id)
  if (touched.length) touchMemoryAccess(touched)

  // Sort by score desc, cap
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit + 5)
}

function escapeFts(q: string): string {
  // FTS5 needs quoting on special chars; wrap phrases in double quotes
  const cleaned = q.replace(/"/g, '').trim()
  if (!cleaned) return '""'
  // Tokenize on whitespace, quote each word, OR-join them
  const words = cleaned.split(/\s+/).slice(0, 10).filter((w) => w.length >= 2)
  if (words.length === 0) return '""'
  return words.map((w) => `"${w}"`).join(' OR ')
}

// ─── Context formatter for injection into prompts ──────────────────
export function formatMemoriesForContext(mems: RetrievedMemory[]): string {
  if (mems.length === 0) return ''
  const lines: string[] = ['## Relevant memory']
  for (const m of mems) {
    const age = formatAge(Date.now() - m.created_at)
    const tag = m.pinned ? '📌' : m.source === 'hive' ? '🐝' : '•'
    const body = (m.summary ?? m.content).replace(/\n+/g, ' ').slice(0, 280)
    lines.push(`${tag} (${age}) ${body}`)
  }
  return lines.join('\n') + '\n'
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ─── Relevance feedback (async, post-response) ─────────────────────
export async function evaluateMemoryRelevance(
  response: string,
  memories: RetrievedMemory[],
): Promise<void> {
  const real = memories.filter((m) => m.id > 0)
  if (real.length === 0) return

  const prompt = `Evaluate which of these memories were actually useful to the assistant's response.
For each memory, respond with useful: true or false, and a short response_excerpt quoting the part that used it (or null).

Response:
"""
${response.slice(0, 2000)}
"""

Memories:
${real
  .slice(0, 8)
  .map((m, i) => `[${i}] (id=${m.id}) ${(m.summary ?? m.content).slice(0, 200)}`)
  .join('\n')}

Respond ONLY with JSON: [{ "id": number, "useful": boolean, "excerpt": string | null }]`

  type Eval = { id: number; useful: boolean; excerpt: string | null }
  const evals = await generateJson<Eval[]>(prompt)
  if (!evals) return
  for (const e of evals) {
    try {
      recordMemoryRelevance(e.id, e.useful, e.excerpt ?? undefined)
    } catch {
      /* ignore */
    }
  }
}

// ─── Pinning / supersession API ────────────────────────────────────
export function pin(id: number, pinned = true): void {
  pinMemory(id, pinned)
}

export function supersede(oldId: number, newId: number): void {
  supersedeMemory(oldId, newId)
}

// ─── Periodic decay sweep ──────────────────────────────────────────
export function runDecaySweep(): number {
  const n = decaySweep()
  log.info({ changed: n }, 'decay sweep complete')
  return n
}

// ─── Nudging: should we proactively surface memory? ────────────────
export function shouldNudgeMemory(chatId: string, agentId: string): boolean {
  const n = countTurns(chatId, agentId)
  if (n === 0) return false
  if (n % MEMORY_NUDGE_INTERVAL_TURNS === 0) return true
  const recent = getRecentTurns(chatId, agentId, 1)[0]
  if (!recent) return false
  const ageHours = (Date.now() - recent.created_at) / 3_600_000
  return ageHours >= MEMORY_NUDGE_INTERVAL_HOURS
}

export { getMemoryById }
export { db as memoryDb }
