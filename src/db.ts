import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { STORE_DIR } from './config.js'
import { child } from './logger.js'

const log = child('db')

fs.mkdirSync(STORE_DIR, { recursive: true })
const DB_PATH = path.join(STORE_DIR, 'claudeclaw.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

// ─── Schema ────────────────────────────────────────────────────────
db.exec(`
  -- Per-chat, per-agent session IDs for SDK resume
  CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT NOT NULL,
    agent_id TEXT NOT NULL DEFAULT 'main',
    session_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, agent_id)
  );

  -- Conversation turns (user + assistant messages)
  CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    agent_id TEXT NOT NULL DEFAULT 'main',
    role TEXT NOT NULL,  -- 'user' | 'assistant'
    content TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    model TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_turns_chat ON turns(chat_id, agent_id, created_at DESC);

  -- Memory v2
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    agent_id TEXT NOT NULL DEFAULT 'main',
    session_id TEXT,
    content TEXT NOT NULL,
    summary TEXT,
    entities TEXT,    -- JSON array
    topics TEXT,      -- JSON array
    importance REAL NOT NULL DEFAULT 0.5,  -- 0..1
    salience REAL NOT NULL DEFAULT 2.5,    -- 0..5
    embedding BLOB,   -- Float32 packed, 768 dims
    pinned INTEGER NOT NULL DEFAULT 0,
    consolidated INTEGER NOT NULL DEFAULT 0,
    superseded_by INTEGER,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (superseded_by) REFERENCES memories(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id, importance DESC, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_memories_unconsolidated ON memories(consolidated, created_at) WHERE consolidated = 0;
  CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned) WHERE pinned = 1;

  -- FTS5 mirror of memory content (content-only, no metadata) for keyword search
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content, summary,
    content='memories', content_rowid='id'
  );
  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
  END;
  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, summary) VALUES ('delete', old.id, old.content, old.summary);
  END;
  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content, summary ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, summary) VALUES ('delete', old.id, old.content, old.summary);
    INSERT INTO memories_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
  END;

  -- Memory consolidation output
  CREATE TABLE IF NOT EXISTS memory_consolidations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL DEFAULT 'main',
    summary TEXT NOT NULL,
    insight TEXT,
    connections TEXT,      -- JSON
    contradictions TEXT,   -- JSON
    source_memory_ids TEXT NOT NULL,  -- JSON array
    created_at INTEGER NOT NULL
  );

  -- Relevance feedback on memories that got injected into a response
  CREATE TABLE IF NOT EXISTS memory_relevance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id INTEGER NOT NULL,
    useful INTEGER NOT NULL,  -- 1=useful, 0=not useful
    response_excerpt TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
  );

  -- Hive mind — cross-agent activity log
  CREATE TABLE IF NOT EXISTS hive_mind (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata TEXT,  -- JSON
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hive_recent ON hive_mind(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hive_agent ON hive_mind(agent_id, created_at DESC);

  -- Mission Control / scheduled tasks
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    cron TEXT,              -- cron expression (recurring)
    once_at INTEGER,        -- unix ms for one-shot
    chat_id TEXT,
    agent_id TEXT NOT NULL DEFAULT 'main',
    priority INTEGER NOT NULL DEFAULT 3,  -- 1=highest, 5=lowest
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run INTEGER,
    last_run INTEGER,
    last_status TEXT,       -- 'completed' | 'failed' | 'running'
    last_output TEXT,
    last_error TEXT,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_missions_due ON missions(enabled, next_run);

  -- WhatsApp queue (outbound messages)
  CREATE TABLE IF NOT EXISTS wa_outbound (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_chat_id TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    error TEXT
  );

  -- WhatsApp inbound cache
  CREATE TABLE IF NOT EXISTS wa_inbound (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_chat_id TEXT NOT NULL,
    wa_msg_id TEXT NOT NULL UNIQUE,
    from_name TEXT,
    body TEXT,
    created_at INTEGER NOT NULL
  );

  -- Security audit log
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,   -- message|command|delegation|unlock|lock|kill|blocked
    chat_id TEXT,
    agent_id TEXT,
    metadata TEXT,          -- JSON
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log(created_at DESC);

  -- Rate tracking (daily/hourly budget)
  CREATE TABLE IF NOT EXISTS rate_tracker (
    bucket TEXT NOT NULL,   -- 'hour:2026-04-18-13' | 'day:2026-04-18'
    agent_id TEXT NOT NULL DEFAULT 'main',
    messages INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, agent_id)
  );
`)

// ─── Session queries ──────────────────────────────────────────────
export function getSession(chatId: string, agentId = 'main'): string | null {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE chat_id = ? AND agent_id = ?')
    .get(chatId, agentId) as { session_id: string } | undefined
  return row?.session_id ?? null
}

export function setSession(chatId: string, agentId: string, sessionId: string): void {
  db.prepare(
    `INSERT INTO sessions (chat_id, agent_id, session_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, agent_id) DO UPDATE SET
       session_id = excluded.session_id,
       updated_at = excluded.updated_at`,
  ).run(chatId, agentId, sessionId, Date.now())
}

export function clearSession(chatId: string, agentId = 'main'): void {
  db.prepare('DELETE FROM sessions WHERE chat_id = ? AND agent_id = ?').run(chatId, agentId)
}

// ─── Turn queries ─────────────────────────────────────────────────
export interface Turn {
  id: number
  chat_id: string
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  created_at: number
}

export function recordTurn(t: Omit<Turn, 'id' | 'created_at'> & { created_at?: number }): number {
  const info = db
    .prepare(
      `INSERT INTO turns (chat_id, agent_id, role, content, input_tokens, output_tokens, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      t.chat_id,
      t.agent_id,
      t.role,
      t.content,
      t.input_tokens ?? null,
      t.output_tokens ?? null,
      t.model ?? null,
      t.created_at ?? Date.now(),
    )
  return Number(info.lastInsertRowid)
}

export function getRecentTurns(chatId: string, agentId: string, n = 20): Turn[] {
  return db
    .prepare(
      `SELECT * FROM turns WHERE chat_id = ? AND agent_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chatId, agentId, n) as Turn[]
}

export function countTurns(chatId: string, agentId: string): number {
  const r = db
    .prepare('SELECT COUNT(*) as c FROM turns WHERE chat_id = ? AND agent_id = ?')
    .get(chatId, agentId) as { c: number }
  return r.c
}

// ─── Memory queries ───────────────────────────────────────────────
export interface MemoryRow {
  id: number
  chat_id: string | null
  agent_id: string
  session_id: string | null
  content: string
  summary: string | null
  entities: string | null
  topics: string | null
  importance: number
  salience: number
  embedding: Buffer | null
  pinned: number
  consolidated: number
  superseded_by: number | null
  access_count: number
  last_accessed_at: number | null
  created_at: number
}

export function insertMemory(m: {
  chatId?: string
  agentId: string
  sessionId?: string
  content: string
  summary?: string
  entities?: string[]
  topics?: string[]
  importance: number
  salience?: number
  embedding?: Buffer | null
}): number {
  const info = db
    .prepare(
      `INSERT INTO memories
        (chat_id, agent_id, session_id, content, summary, entities, topics,
         importance, salience, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      m.chatId ?? null,
      m.agentId,
      m.sessionId ?? null,
      m.content,
      m.summary ?? null,
      m.entities ? JSON.stringify(m.entities) : null,
      m.topics ? JSON.stringify(m.topics) : null,
      m.importance,
      m.salience ?? 2.5,
      m.embedding ?? null,
      Date.now(),
    )
  return Number(info.lastInsertRowid)
}

export function listMemories(agentId: string, limit = 50): MemoryRow[] {
  return db
    .prepare(
      `SELECT * FROM memories WHERE agent_id = ? AND superseded_by IS NULL
       ORDER BY importance DESC, created_at DESC LIMIT ?`,
    )
    .all(agentId, limit) as MemoryRow[]
}

export function getMemoryById(id: number): MemoryRow | null {
  const r = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
  return r ?? null
}

export function getUnconsolidatedMemories(limit = 20): MemoryRow[] {
  return db
    .prepare(
      `SELECT * FROM memories WHERE consolidated = 0 AND superseded_by IS NULL
       ORDER BY created_at ASC LIMIT ?`,
    )
    .all(limit) as MemoryRow[]
}

export function markMemoryConsolidated(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE memories SET consolidated = 1 WHERE id IN (${placeholders})`).run(...ids)
}

export function pinMemory(id: number, pinned: boolean): void {
  db.prepare('UPDATE memories SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
}

export function supersedeMemory(oldId: number, newId: number): void {
  db.prepare('UPDATE memories SET superseded_by = ? WHERE id = ?').run(newId, oldId)
}

export function touchMemoryAccess(ids: number[]): void {
  if (ids.length === 0) return
  const now = Date.now()
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1, last_accessed_at = ?
     WHERE id IN (${placeholders})`,
  ).run(now, ...ids)
}

export function searchMemoriesFTS(query: string, agentId: string, limit = 10): MemoryRow[] {
  try {
    return db
      .prepare(
        `SELECT m.* FROM memories m
         JOIN memories_fts f ON f.rowid = m.id
         WHERE memories_fts MATCH ? AND m.agent_id = ? AND m.superseded_by IS NULL
         ORDER BY rank LIMIT ?`,
      )
      .all(query, agentId, limit) as MemoryRow[]
  } catch {
    // FTS can throw on malformed queries — fall back to LIKE
    return db
      .prepare(
        `SELECT * FROM memories WHERE agent_id = ? AND superseded_by IS NULL
         AND (content LIKE ? OR summary LIKE ?)
         ORDER BY importance DESC LIMIT ?`,
      )
      .all(agentId, `%${query}%`, `%${query}%`, limit) as MemoryRow[]
  }
}

export function recentHighImportanceMemories(
  agentId: string,
  minImportance = 0.6,
  limit = 10,
): MemoryRow[] {
  return db
    .prepare(
      `SELECT * FROM memories
       WHERE agent_id = ? AND importance >= ? AND superseded_by IS NULL
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(agentId, minImportance, limit) as MemoryRow[]
}

export function decaySweep(): number {
  // Lower salience on old, low-importance, unaccessed memories.
  // Multi-tier schedule via CASE on age.
  const now = Date.now()
  const info = db
    .prepare(
      `UPDATE memories
       SET salience = MAX(0, salience - CASE
         WHEN (? - created_at) > 30 * 86400 * 1000 THEN 0.3
         WHEN (? - created_at) > 7 * 86400 * 1000 THEN 0.1
         ELSE 0.02
       END)
       WHERE pinned = 0 AND importance < 0.7 AND superseded_by IS NULL
         AND (last_accessed_at IS NULL OR (? - last_accessed_at) > 7 * 86400 * 1000)`,
    )
    .run(now, now, now)
  // Hard-drop memories below threshold
  const del = db
    .prepare(
      `DELETE FROM memories WHERE pinned = 0 AND salience < 0.3 AND importance < 0.4`,
    )
    .run()
  return info.changes + del.changes
}

export function insertConsolidation(c: {
  agentId: string
  summary: string
  insight?: string
  connections?: unknown
  contradictions?: unknown
  sourceMemoryIds: number[]
}): number {
  const info = db
    .prepare(
      `INSERT INTO memory_consolidations
        (agent_id, summary, insight, connections, contradictions, source_memory_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      c.agentId,
      c.summary,
      c.insight ?? null,
      c.connections ? JSON.stringify(c.connections) : null,
      c.contradictions ? JSON.stringify(c.contradictions) : null,
      JSON.stringify(c.sourceMemoryIds),
      Date.now(),
    )
  return Number(info.lastInsertRowid)
}

export function recordMemoryRelevance(
  memoryId: number,
  useful: boolean,
  excerpt?: string,
): void {
  db.prepare(
    `INSERT INTO memory_relevance (memory_id, useful, response_excerpt, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(memoryId, useful ? 1 : 0, excerpt ?? null, Date.now())
}

// ─── Hive mind ────────────────────────────────────────────────────
export interface HiveEntry {
  id: number
  agent_id: string
  action_type: string
  summary: string
  metadata: string | null
  created_at: number
}

export function logHive(e: {
  agentId: string
  actionType: string
  summary: string
  metadata?: unknown
}): number {
  const info = db
    .prepare(
      `INSERT INTO hive_mind (agent_id, action_type, summary, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      e.agentId,
      e.actionType,
      e.summary,
      e.metadata ? JSON.stringify(e.metadata) : null,
      Date.now(),
    )
  return Number(info.lastInsertRowid)
}

export function recentHive(limit = 20, sinceMs?: number): HiveEntry[] {
  if (sinceMs) {
    return db
      .prepare('SELECT * FROM hive_mind WHERE created_at > ? ORDER BY created_at DESC LIMIT ?')
      .all(sinceMs, limit) as HiveEntry[]
  }
  return db
    .prepare('SELECT * FROM hive_mind ORDER BY created_at DESC LIMIT ?')
    .all(limit) as HiveEntry[]
}

// ─── Mission Control ──────────────────────────────────────────────
export interface MissionRow {
  id: number
  name: string
  prompt: string
  cron: string | null
  once_at: number | null
  chat_id: string | null
  agent_id: string
  priority: number
  enabled: number
  next_run: number | null
  last_run: number | null
  last_status: string | null
  last_output: string | null
  last_error: string | null
  run_count: number
  created_at: number
}

export function insertMission(m: {
  name: string
  prompt: string
  cron?: string
  onceAt?: number
  chatId?: string
  agentId?: string
  priority?: number
  nextRun?: number
}): number {
  const info = db
    .prepare(
      `INSERT INTO missions
        (name, prompt, cron, once_at, chat_id, agent_id, priority, enabled, next_run, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      m.name,
      m.prompt,
      m.cron ?? null,
      m.onceAt ?? null,
      m.chatId ?? null,
      m.agentId ?? 'main',
      m.priority ?? 3,
      m.nextRun ?? m.onceAt ?? null,
      Date.now(),
    )
  return Number(info.lastInsertRowid)
}

export function listMissions(): MissionRow[] {
  return db
    .prepare('SELECT * FROM missions ORDER BY enabled DESC, priority ASC, next_run ASC')
    .all() as MissionRow[]
}

export function getMission(id: number): MissionRow | null {
  const r = db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as MissionRow | undefined
  return r ?? null
}

export function getDueMissions(now: number): MissionRow[] {
  return db
    .prepare(
      `SELECT * FROM missions WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?
       ORDER BY priority ASC, next_run ASC`,
    )
    .all(now) as MissionRow[]
}

export function updateMissionAfterRun(
  id: number,
  status: 'completed' | 'failed',
  output: string | null,
  error: string | null,
  nextRun: number | null,
): void {
  db.prepare(
    `UPDATE missions SET last_run = ?, last_status = ?, last_output = ?, last_error = ?,
       run_count = run_count + 1, next_run = ?,
       enabled = CASE WHEN cron IS NULL AND once_at IS NOT NULL THEN 0 ELSE enabled END
     WHERE id = ?`,
  ).run(Date.now(), status, output, error, nextRun, id)
}

export function setMissionEnabled(id: number, enabled: boolean): void {
  db.prepare('UPDATE missions SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
}

export function deleteMission(id: number): void {
  db.prepare('DELETE FROM missions WHERE id = ?').run(id)
}

// ─── WhatsApp ─────────────────────────────────────────────────────
export function enqueueWaOutbound(waChatId: string, body: string): number {
  const info = db
    .prepare('INSERT INTO wa_outbound (wa_chat_id, body, created_at) VALUES (?, ?, ?)')
    .run(waChatId, body, Date.now())
  return Number(info.lastInsertRowid)
}

export function pendingWaOutbound(): {
  id: number
  wa_chat_id: string
  body: string
}[] {
  return db
    .prepare("SELECT id, wa_chat_id, body FROM wa_outbound WHERE status = 'pending' ORDER BY id")
    .all() as { id: number; wa_chat_id: string; body: string }[]
}

export function markWaOutboundSent(id: number): void {
  db.prepare("UPDATE wa_outbound SET status = 'sent', sent_at = ? WHERE id = ?").run(
    Date.now(),
    id,
  )
}

export function markWaOutboundFailed(id: number, err: string): void {
  db.prepare("UPDATE wa_outbound SET status = 'failed', error = ? WHERE id = ?").run(err, id)
}

export function recordWaInbound(
  waChatId: string,
  waMsgId: string,
  fromName: string | null,
  body: string | null,
): void {
  try {
    db.prepare(
      `INSERT INTO wa_inbound (wa_chat_id, wa_msg_id, from_name, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(waChatId, waMsgId, fromName, body, Date.now())
  } catch {
    // Duplicate wa_msg_id — ignore
  }
}

// ─── Audit log ────────────────────────────────────────────────────
export function logAudit(
  action: string,
  chatId: string | null = null,
  agentId: string | null = null,
  metadata?: unknown,
): void {
  db.prepare(
    `INSERT INTO audit_log (action, chat_id, agent_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    action,
    chatId,
    agentId,
    metadata ? JSON.stringify(metadata) : null,
    Date.now(),
  )
}

export function recentAudit(
  limit = 100,
): { id: number; action: string; chat_id: string | null; agent_id: string | null; metadata: string | null; created_at: number }[] {
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit) as any
}

// ─── Rate tracker ─────────────────────────────────────────────────
function bucketFor(when: number): { hour: string; day: string } {
  const d = new Date(when)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  return { hour: `hour:${yyyy}-${mm}-${dd}-${hh}`, day: `day:${yyyy}-${mm}-${dd}` }
}

export function recordUsage(
  agentId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd = 0,
): void {
  const { hour, day } = bucketFor(Date.now())
  for (const bucket of [hour, day]) {
    db.prepare(
      `INSERT INTO rate_tracker (bucket, agent_id, messages, input_tokens, output_tokens, estimated_cost)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(bucket, agent_id) DO UPDATE SET
         messages = messages + 1,
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         estimated_cost = estimated_cost + excluded.estimated_cost`,
    ).run(bucket, agentId, inputTokens, outputTokens, costUsd)
  }
}

export function getUsageToday(agentId?: string): {
  messages: number
  input_tokens: number
  output_tokens: number
  estimated_cost: number
} {
  const { day } = bucketFor(Date.now())
  const where = agentId ? 'bucket = ? AND agent_id = ?' : 'bucket = ?'
  const params = agentId ? [day, agentId] : [day]
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(messages),0) as messages,
              COALESCE(SUM(input_tokens),0) as input_tokens,
              COALESCE(SUM(output_tokens),0) as output_tokens,
              COALESCE(SUM(estimated_cost),0) as estimated_cost
       FROM rate_tracker WHERE ${where}`,
    )
    .get(...params) as {
    messages: number
    input_tokens: number
    output_tokens: number
    estimated_cost: number
  }
  return r
}

log.info({ dbPath: DB_PATH }, 'database initialized')

export { db }
