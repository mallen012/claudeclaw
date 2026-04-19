import { generateJson } from './gemini.js'
import { storeMemory } from './memory.js'
import { MEMORY_IMPORTANCE_MIN } from './config.js'
import { child } from './logger.js'

const log = child('memory-ingest')

interface ExtractedFact {
  summary: string
  content: string
  entities: string[]
  topics: string[]
  importance: number  // 0..1
  salience: number    // 0..5
}

const EXTRACTION_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      content: { type: 'string' },
      entities: { type: 'array', items: { type: 'string' } },
      topics: { type: 'array', items: { type: 'string' } },
      importance: { type: 'number' },
      salience: { type: 'number' },
    },
    required: ['summary', 'content', 'importance'],
  },
}

function buildPrompt(userMsg: string, assistantMsg: string): string {
  return `Extract durable facts from this conversation turn that should be remembered for future sessions.

Focus on:
- User preferences, constraints, responsibilities, people, places, projects
- Decisions made, plans committed to
- Non-obvious context that wouldn't be in code or git history
- Anything the user explicitly asked to remember

Ignore:
- Greeting chatter, acknowledgments
- Code explanations (can be re-derived)
- One-off task details that won't matter next week

Score importance 0..1: 0.3 routine, 0.5 notable, 0.7 important, 0.9 must-remember.
Score salience 0..5: how mentally prominent / frequently accessed this will be.

User: ${userMsg.slice(0, 3000)}
Assistant: ${assistantMsg.slice(0, 3000)}

Respond with a JSON array of facts (empty array if nothing durable):
[{"summary": "...", "content": "...", "entities": [...], "topics": [...], "importance": 0.7, "salience": 3}]`
}

export async function ingestTurn(opts: {
  agentId: string
  chatId?: string
  sessionId?: string
  userMessage: string
  assistantMessage: string
}): Promise<number> {
  const { userMessage, assistantMessage } = opts
  if (!userMessage || userMessage.length < 15) return 0
  if (userMessage.startsWith('/')) return 0

  const prompt = buildPrompt(userMessage, assistantMessage ?? '')
  const facts = await generateJson<ExtractedFact[]>(prompt, EXTRACTION_SCHEMA)
  if (!facts || !Array.isArray(facts) || facts.length === 0) return 0

  let stored = 0
  for (const f of facts) {
    if (typeof f.importance !== 'number' || f.importance < MEMORY_IMPORTANCE_MIN) continue
    try {
      const id = await storeMemory({
        chatId: opts.chatId,
        agentId: opts.agentId,
        sessionId: opts.sessionId,
        content: f.content || f.summary,
        summary: f.summary,
        entities: f.entities ?? [],
        topics: f.topics ?? [],
        importance: Math.min(1, Math.max(0, f.importance)),
        salience: Math.min(5, Math.max(0, f.salience ?? 2.5)),
      })
      if (id) stored++
    } catch (e) {
      log.warn({ err: String(e) }, 'storeMemory failed')
    }
  }
  if (stored > 0) log.info({ agentId: opts.agentId, stored }, 'facts stored')
  return stored
}
