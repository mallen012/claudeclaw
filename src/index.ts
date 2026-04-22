import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { STORE_DIR, WARROOM_PORT, TELEGRAM_BOT_TOKEN } from './config.js'
import { child } from './logger.js'
import { startAllBots } from './bot.js'
import { startScheduler } from './scheduler.js'
import { startDashboard } from './dashboard.js'
import { startConsolidationLoop } from './memory-consolidate.js'
import { startIdleMonitor, initialLockState } from './security.js'
import { runDecaySweep } from './memory.js'
import { startWhatsapp } from './whatsapp.js'
import { readEnvFile } from './env.js'

const log = child('index')

const env = readEnvFile()

// Export critical .env vars into process.env so spawned subprocesses
// (notably the `claude` CLI) can inherit them. Without this, vars placed
// in a mounted .env file never reach child processes — only Node itself
// sees them via readEnvFile. process.env values take precedence so
// container-level overrides still win.
const FORWARD_TO_SUBPROCESS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_PATH',
  'PYTHON_BIN',
  'NODE_ENV',
]
for (const k of FORWARD_TO_SUBPROCESS) {
  if (env[k] && !process.env[k]) process.env[k] = env[k]
}

// ─── PID lock ──────────────────────────────────────────────────────
function ensureSingleInstance(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true })
  const pidPath = path.join(STORE_DIR, 'claudeclaw.pid')
  if (fs.existsSync(pidPath)) {
    const oldPid = Number(fs.readFileSync(pidPath, 'utf-8').trim())
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0)
        log.warn({ oldPid }, 'another instance is alive — killing it')
        try {
          process.kill(oldPid, 'SIGTERM')
        } catch {
          /* ignore */
        }
      } catch {
        // Process isn't alive, stale pid
      }
    }
  }
  fs.writeFileSync(pidPath, String(process.pid))
}

// ─── War Room auto-spawn ───────────────────────────────────────────
let warroomProc: ReturnType<typeof spawn> | null = null

function startWarRoomIfAvailable(): void {
  const serverPy = path.join(process.cwd(), 'warroom', 'server.py')
  if (!fs.existsSync(serverPy)) return
  if (!env['GOOGLE_API_KEY'] && !env['DEEPGRAM_API_KEY']) {
    log.info('War Room skipped (no GOOGLE_API_KEY or DEEPGRAM_API_KEY)')
    return
  }
  if (env['DISABLE_WARROOM'] === 'true' || env['DISABLE_WARROOM'] === '1') {
    log.info('War Room disabled via DISABLE_WARROOM')
    return
  }
  const pythonBin = env['PYTHON_BIN'] ?? process.env.PYTHON_BIN ?? 'python3'
  try {
    warroomProc = spawn(pythonBin, [serverPy], {
      cwd: process.cwd(),
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    })
  } catch (e) {
    log.warn({ err: String(e) }, 'War Room spawn failed — skipping')
    return
  }
  warroomProc.on('error', (err) => {
    log.warn({ err: String(err) }, 'War Room process error (likely python not installed) — skipping')
    warroomProc = null
  })
  warroomProc.on('exit', (code) => {
    if (code !== 0) log.warn({ code }, 'War Room exited')
    warroomProc = null
  })
  log.info({ port: WARROOM_PORT }, 'War Room spawn attempted')
}

// ─── Main ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  ensureSingleInstance()
  initialLockState()

  if (TELEGRAM_BOT_TOKEN) {
    void startAllBots()
  } else {
    log.warn('TELEGRAM_BOT_TOKEN not set — no bots will start')
  }

  // Memory v2 — consolidation loop and periodic decay
  if (env['GOOGLE_API_KEY']) {
    startConsolidationLoop()
    setInterval(() => runDecaySweep(), 6 * 60 * 60 * 1000)  // every 6h
  }

  // Scheduler / Mission Control
  startScheduler()

  // Dashboard
  startDashboard()

  // Security
  startIdleMonitor()

  // WhatsApp (optional — only starts if the module can load its session)
  void startWhatsapp().catch((e) => log.warn({ err: String(e) }, 'whatsapp failed to start'))

  // War Room
  startWarRoomIfAvailable()

  log.info('claudeclaw ready')
}

process.on('SIGTERM', () => {
  log.info('SIGTERM — shutting down')
  if (warroomProc) warroomProc.kill('SIGTERM')
  setTimeout(() => process.exit(0), 2000).unref()
})
process.on('SIGINT', () => {
  log.info('SIGINT — shutting down')
  if (warroomProc) warroomProc.kill('SIGTERM')
  setTimeout(() => process.exit(0), 2000).unref()
})
process.on('uncaughtException', (e: NodeJS.ErrnoException) => {
  // EPIPE usually means the Claude Code subprocess died before we finished writing
  // to its stdin — it's handled at the call site via runAgentWithRetry's retry loop.
  if (e?.code === 'EPIPE') return
  // ENOENT from spawn() is handled where we spawn (war room, etc.)
  if (e?.code === 'ENOENT') {
    log.warn({ err: String(e) }, 'spawn ENOENT (binary not installed in this environment)')
    return
  }
  log.error({ err: String(e) }, 'uncaught')
})
process.on('unhandledRejection', (e: any) => {
  if (e?.code === 'EPIPE') return
  log.error({ err: String(e) }, 'unhandled rejection')
})

main().catch((e) => {
  log.fatal({ err: String(e) }, 'startup failed')
  process.exit(1)
})
