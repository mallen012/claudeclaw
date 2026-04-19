import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import { DASHBOARD_PORT, DASHBOARD_TOKEN } from './config.js'
import { child } from './logger.js'
import {
  listMemories,
  recentHive,
  listMissions,
  recentAudit,
  getUsageToday,
  insertMission,
  setMissionEnabled,
  deleteMission,
  pinMemory as dbPinMemory,
} from './db.js'
import { loadAgents, reloadAgents } from './agent-config.js'
import { chatEvents } from './state.js'
import { dashboardHtml } from './dashboard-html.js'
import { nextCronRun } from './scheduler.js'

const log = child('dashboard')

function authed(req: Request): boolean {
  if (!DASHBOARD_TOKEN) return true
  const url = new URL(req.url)
  const t = url.searchParams.get('token') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/, '')
  return t === DASHBOARD_TOKEN
}

const app = new Hono()

app.use('*', async (c, next) => {
  if (!authed(c.req.raw)) return c.text('Unauthorized', 401)
  return next()
})

app.get('/', (c) => c.html(dashboardHtml))

app.get('/api/agents', (c) => c.json({ agents: loadAgents() }))

app.get('/api/memory', (c) => {
  const agentId = c.req.query('agent') ?? 'main'
  const limit = Number(c.req.query('limit') ?? '100')
  const rows = listMemories(agentId, limit).map((m) => ({
    id: m.id,
    agent_id: m.agent_id,
    content: m.content,
    summary: m.summary,
    entities: m.entities ? JSON.parse(m.entities) : [],
    topics: m.topics ? JSON.parse(m.topics) : [],
    importance: m.importance,
    salience: m.salience,
    pinned: !!m.pinned,
    created_at: m.created_at,
  }))
  return c.json({ memories: rows })
})

app.post('/api/memory/:id/pin', async (c) => {
  const id = Number(c.req.param('id'))
  const body = (await c.req.json().catch(() => ({}))) as { pinned?: boolean }
  dbPinMemory(id, body.pinned !== false)
  return c.json({ ok: true })
})

app.get('/api/hive', (c) => {
  const since = Number(c.req.query('since') ?? '0') || undefined
  const rows = recentHive(100, since)
  return c.json({ entries: rows })
})

app.get('/api/missions', (c) => c.json({ missions: listMissions() }))

app.post('/api/missions', async (c) => {
  const body = (await c.req.json()) as {
    name: string
    prompt: string
    cron?: string
    once_at?: number
    chat_id?: string
    agent_id?: string
    priority?: number
  }
  const next = body.cron ? nextCronRun(body.cron) : body.once_at
  const id = insertMission({
    name: body.name,
    prompt: body.prompt,
    cron: body.cron,
    onceAt: body.once_at,
    chatId: body.chat_id,
    agentId: body.agent_id,
    priority: body.priority,
    nextRun: next ?? undefined,
  })
  return c.json({ id })
})

app.post('/api/missions/:id/toggle', (c) => {
  const id = Number(c.req.param('id'))
  const m = listMissions().find((x) => x.id === id)
  if (!m) return c.json({ error: 'not found' }, 404)
  setMissionEnabled(id, !m.enabled)
  return c.json({ ok: true, enabled: !m.enabled })
})

app.delete('/api/missions/:id', (c) => {
  deleteMission(Number(c.req.param('id')))
  return c.json({ ok: true })
})

app.get('/api/audit', (c) => c.json({ entries: recentAudit(200) }))

app.get('/api/usage', (c) => {
  const agentId = c.req.query('agent') ?? undefined
  return c.json({ usage: getUsageToday(agentId) })
})

app.post('/api/agents/reload', (c) => {
  reloadAgents()
  return c.json({ ok: true, agents: loadAgents() })
})

// ─── Server-Sent Events ────────────────────────────────────────────
app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const listener = (e: unknown) => {
      stream.writeSSE({ data: JSON.stringify(e) })
    }
    chatEvents.on('event', listener)
    try {
      // Keep open until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
      })
    } finally {
      chatEvents.off('event', listener)
    }
  }),
)

export function startDashboard(): void {
  serve({ fetch: app.fetch, port: DASHBOARD_PORT, hostname: '0.0.0.0' }, (info) =>
    log.info({ port: info.port }, 'dashboard listening'),
  )
}
