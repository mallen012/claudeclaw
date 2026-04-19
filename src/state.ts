import { EventEmitter } from 'node:events'

export type ChatEventType =
  | 'user_message'
  | 'assistant_message'
  | 'processing'
  | 'progress'
  | 'error'
  | 'hive_mind'
  | 'memory'
  | 'security'
  | 'mission'

export interface ChatEvent {
  type: ChatEventType
  chatId: string
  agentId?: string
  data: unknown
  timestamp: number
}

export const chatEvents = new EventEmitter()
chatEvents.setMaxListeners(100)

export function emitChatEvent(e: Omit<ChatEvent, 'timestamp'>): void {
  chatEvents.emit('event', { ...e, timestamp: Date.now() })
}

// Voice-reply preference per chat (toggled by /voice command). Groq-STT-only
// install still exposes the toggle for future-proofing.
export const voiceEnabledChats = new Set<string>()

// Active in-flight sessions keyed by `${chatId}:${agentId}`.
export const activeSessions = new Map<string, { startedAt: number; agentId?: string }>()

// Abort controllers for in-flight agent calls so /stop can cancel.
export const abortControllers = new Map<string, AbortController>()

// ─── Security state ────────────────────────────────────
let systemLocked = true
let lastActivity = Date.now()

export function isSystemLocked(): boolean {
  return systemLocked
}
export function setLocked(v: boolean): void {
  systemLocked = v
}
export function touchActivity(): void {
  lastActivity = Date.now()
}
export function getLastActivity(): number {
  return lastActivity
}
