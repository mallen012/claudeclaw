import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import {
  CLAUDECLAW_PIN_HASH,
  IDLE_LOCK_MINUTES,
  KILL_PHRASE,
} from './config.js'
import {
  isSystemLocked,
  setLocked,
  touchActivity,
  getLastActivity,
} from './state.js'
import { logAudit } from './db.js'
import { redactSecrets } from './exfiltration-guard.js'
import { child } from './logger.js'

const log = child('security')

// ─── PIN lock ──────────────────────────────────────────────────────
export function hashPin(pin: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString('hex')
  const h = crypto.createHash('sha256').update(`${s}:${pin}`).digest('hex')
  return `${s}:${h}`
}

export function verifyPin(pin: string): boolean {
  if (!CLAUDECLAW_PIN_HASH) return true  // no PIN configured — effectively disabled
  const [salt, expected] = CLAUDECLAW_PIN_HASH.split(':')
  if (!salt || !expected) return false
  const [, h] = hashPin(pin, salt).split(':')
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export function isPinRequired(): boolean {
  return Boolean(CLAUDECLAW_PIN_HASH)
}

export function initialLockState(): void {
  setLocked(isPinRequired())
}

// ─── Idle auto-lock ────────────────────────────────────────────────
let idleTimer: NodeJS.Timeout | null = null

export function startIdleMonitor(onLock?: () => void): void {
  if (idleTimer) return
  const intervalMs = 60_000
  idleTimer = setInterval(() => {
    if (isSystemLocked()) return
    const idleMs = Date.now() - getLastActivity()
    if (idleMs > IDLE_LOCK_MINUTES * 60_000) {
      setLocked(true)
      logAudit('lock', null, null, { reason: 'idle', idleMs })
      log.info({ idleMs }, 'auto-locked (idle)')
      onLock?.()
    }
  }, intervalMs)
}

export function stopIdleMonitor(): void {
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = null
}

// ─── Kill phrase ───────────────────────────────────────────────────
export function isKillPhrase(msg: string): boolean {
  if (!KILL_PHRASE) return false
  return msg.trim().toLowerCase() === KILL_PHRASE.trim().toLowerCase()
}

export function executeEmergencyKill(): void {
  logAudit('kill', null, null, { at: Date.now() })
  log.fatal('EMERGENCY KILL triggered — stopping all services')
  try {
    if (process.platform === 'darwin') {
      execSync(
        `launchctl list | awk '/com.claudeclaw./ {print $3}' | xargs -I{} launchctl bootout gui/$(id -u)/{}`,
        { stdio: 'inherit', shell: '/bin/bash' },
      )
    } else if (process.platform === 'linux') {
      execSync(
        `systemctl --user list-units --all 'claudeclaw-*' --no-legend | awk '{print $1}' | xargs -r -I{} systemctl --user stop {}`,
        { stdio: 'inherit', shell: '/bin/bash' },
      )
    }
  } catch (e) {
    log.error({ err: String(e) }, 'service-stop attempt failed')
  }
  setTimeout(() => process.exit(1), 5000).unref()
}

// ─── Lock/unlock ───────────────────────────────────────────────────
export function attemptUnlock(pin: string, chatId?: string): boolean {
  if (!isPinRequired()) {
    setLocked(false)
    touchActivity()
    return true
  }
  const ok = verifyPin(pin)
  logAudit(ok ? 'unlock' : 'blocked', chatId ?? null, null, { reason: ok ? 'pin_ok' : 'pin_bad' })
  if (ok) {
    setLocked(false)
    touchActivity()
  }
  return ok
}

export function lock(reason = 'manual'): void {
  setLocked(true)
  logAudit('lock', null, null, { reason })
}

export function checkAccess(chatId: string): { allowed: boolean; reason?: string } {
  if (isPinRequired() && isSystemLocked()) {
    return { allowed: false, reason: 'System is locked. Send your PIN to unlock.' }
  }
  return { allowed: true }
}

// ─── Outgoing guard ────────────────────────────────────────────────
export function guardOutgoing(text: string, chatId?: string, agentId?: string): string {
  const { text: clean, matches } = redactSecrets(text)
  if (matches.length > 0) {
    logAudit('blocked', chatId ?? null, agentId ?? null, { matches, reason: 'secret_redacted' })
    log.warn({ count: matches.length, types: matches.map((m) => m.type) }, 'secrets redacted')
  }
  return clean
}
