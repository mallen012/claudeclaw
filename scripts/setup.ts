#!/usr/bin/env node
/**
 * ClaudeClaw interactive setup wizard.
 *
 * Walks the user through configuring .env, generating a PIN hash, verifying
 * their Telegram bot, and installing the background service.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = async (q: string, def = ''): Promise<string> => {
  const prompt = def ? `${q} [${def}]: ` : `${q}: `
  const a = await rl.question(prompt)
  return (a.trim() || def).trim()
}
const askYN = async (q: string, def = true): Promise<boolean> => {
  const y = def ? 'Y/n' : 'y/N'
  const a = (await rl.question(`${q} (${y}): `)).trim().toLowerCase()
  if (!a) return def
  return a === 'y' || a === 'yes'
}

function loadExistingEnv(): Record<string, string> {
  const p = path.join(ROOT, '.env')
  if (!fs.existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, eq).trim()] = v
  }
  return out
}

function writeEnv(kv: Record<string, string>): void {
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8')
  const keys = example.match(/^\s*([A-Z][A-Z0-9_]*)=/gm)?.map((s) => s.replace(/[=\s]/g, '')) ?? []
  const lines = example.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=/)
    if (!m) return line
    const k = m[1]
    if (kv[k] !== undefined) {
      const v = kv[k]
      const needsQuote = /[\s"'#]/.test(v)
      return `${k}=${needsQuote ? `"${v.replace(/"/g, '\\"')}"` : v}`
    }
    return line
  })
  // Append any keys that were set but aren't in the example
  for (const [k, v] of Object.entries(kv)) {
    if (!keys.includes(k)) {
      const needsQuote = /[\s"'#]/.test(v)
      lines.push(`${k}=${needsQuote ? `"${v}"` : v}`)
    }
  }
  fs.writeFileSync(path.join(ROOT, '.env'), lines.join('\n'))
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const h = crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex')
  return `${salt}:${h}`
}

async function verifyTelegramBot(token: string): Promise<{ ok: boolean; username?: string; name?: string; err?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const j = (await res.json()) as any
    if (j.ok && j.result) {
      return { ok: true, username: j.result.username, name: j.result.first_name }
    }
    return { ok: false, err: j.description ?? 'unknown' }
  } catch (e: any) {
    return { ok: false, err: e.message ?? String(e) }
  }
}

function installLaunchd(): boolean {
  if (process.platform !== 'darwin') return false
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.claudeclaw.main</string>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${ROOT}/dist/index.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/claudeclaw.log</string>
  <key>StandardErrorPath</key><string>/tmp/claudeclaw.err.log</string>
</dict>
</plist>`
  const dest = path.join(process.env.HOME ?? '', 'Library/LaunchAgents/com.claudeclaw.main.plist')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, plist)
  const r = spawnSync('launchctl', ['load', '-w', dest], { stdio: 'inherit' })
  return r.status === 0
}

function installSystemd(): boolean {
  if (process.platform !== 'linux') return false
  const unit = `[Unit]
Description=ClaudeClaw
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
ExecStart=/usr/bin/env node ${ROOT}/dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:/tmp/claudeclaw.log
StandardError=append:/tmp/claudeclaw.err.log

[Install]
WantedBy=default.target`
  const dir = path.join(process.env.HOME ?? '', '.config/systemd/user')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'claudeclaw.service'), unit)
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' })
  spawnSync('systemctl', ['--user', 'enable', '--now', 'claudeclaw.service'], { stdio: 'inherit' })
  return true
}

async function main(): Promise<void> {
  console.log('\n🦀 ClaudeClaw v2 — setup wizard\n')
  console.log('This wizard will collect API keys into .env and optionally install a background service.\n')

  const existing = loadExistingEnv()
  const kv: Record<string, string> = { ...existing }

  // ─── Telegram ──────────────────────────────────────────────
  console.log('--- Telegram ---')
  console.log('Get a bot token from @BotFather on Telegram. /newbot → pick a name → copy token.\n')

  while (true) {
    kv.TELEGRAM_BOT_TOKEN = await ask('TELEGRAM_BOT_TOKEN', existing.TELEGRAM_BOT_TOKEN ?? '')
    if (!kv.TELEGRAM_BOT_TOKEN) {
      console.log('  (skipped) — you can add this later to .env.')
      break
    }
    const v = await verifyTelegramBot(kv.TELEGRAM_BOT_TOKEN)
    if (v.ok) {
      console.log(`  ✓ verified: @${v.username} (${v.name})`)
      break
    }
    console.log(`  ✗ verification failed: ${v.err}. Try again.`)
  }

  kv.ALLOWED_CHAT_ID = await ask(
    'ALLOWED_CHAT_ID (leave blank to discover — bot will print it to you after /start)',
    existing.ALLOWED_CHAT_ID ?? '',
  )

  // ─── Memory v2 / Gemini ────────────────────────────────────
  console.log('\n--- Memory v2 + War Room + Video (all use one Google AI key) ---')
  console.log('Get a free key at https://aistudio.google.com/\n')
  kv.GOOGLE_API_KEY = await ask('GOOGLE_API_KEY', existing.GOOGLE_API_KEY ?? '')

  // ─── Voice (Groq STT) ──────────────────────────────────────
  console.log('\n--- Voice transcription (Groq Whisper) ---')
  console.log('Get a free key at https://console.groq.com/keys\n')
  kv.GROQ_API_KEY = await ask('GROQ_API_KEY', existing.GROQ_API_KEY ?? '')

  // ─── Meeting bot (Recall.ai) ───────────────────────────────
  console.log('\n--- Meeting bot (Recall.ai) ---')
  console.log('Sign up at https://www.recall.ai/ — supports Meet, Zoom, Webex, Teams.\n')
  kv.RECALL_API_KEY = await ask('RECALL_API_KEY', existing.RECALL_API_KEY ?? '')

  // ─── Security ──────────────────────────────────────────────
  console.log('\n--- Security ---')
  if (await askYN('Set a PIN lock?', true)) {
    const pin = await ask('PIN (4-12 digits)')
    if (pin) kv.CLAUDECLAW_PIN_HASH = hashPin(pin)
  }
  const kill = await ask('Kill phrase (case-insensitive, any string — leave blank to disable)', existing.KILL_PHRASE ?? '')
  if (kill) kv.KILL_PHRASE = kill
  kv.IDLE_LOCK_MINUTES = await ask('IDLE_LOCK_MINUTES', existing.IDLE_LOCK_MINUTES ?? '30')

  // ─── Dashboard ─────────────────────────────────────────────
  if (await askYN('\nGenerate a dashboard access token?', true)) {
    kv.DASHBOARD_TOKEN = crypto.randomBytes(16).toString('hex')
    console.log(`  token: ${kv.DASHBOARD_TOKEN}`)
    console.log(`  open: http://localhost:3141/?token=${kv.DASHBOARD_TOKEN}`)
  }

  // ─── Per-agent Telegram tokens ─────────────────────────────
  console.log('\n--- Additional agent bots (optional) ---')
  console.log('Each specialist (Comms, Content, Ops, Research, Coach, Webster) can have its own Telegram bot.')
  console.log('Leave blank to skip — the agent is still reachable via delegation (@comms: ...) on the main bot.\n')
  for (const [agent, envKey] of [
    ['Comms', 'COMMS_BOT_TOKEN'],
    ['Content', 'CONTENT_BOT_TOKEN'],
    ['Ops', 'OPS_BOT_TOKEN'],
    ['Research', 'RESEARCH_BOT_TOKEN'],
    ['Coach', 'COACH_BOT_TOKEN'],
    ['Webster', 'WEBSTER_BOT_TOKEN'],
  ] as const) {
    const token = await ask(`${envKey} (${agent})`, existing[envKey] ?? '')
    if (token) {
      const v = await verifyTelegramBot(token)
      if (!v.ok) {
        console.log(`  ✗ ${v.err} — saving anyway, fix later in .env`)
      } else {
        console.log(`  ✓ @${v.username}`)
      }
      kv[envKey] = token
    }
  }

  // Write .env
  writeEnv(kv)
  console.log('\n✓ .env written.')

  // Open CLAUDE.md for editing
  console.log('\nℹ️  Edit agent CLAUDE.md files under agents/ to customize each assistant.')

  // Install background service?
  console.log('\n--- Background service ---')
  if (await askYN('Install as a background service (launchd/systemd)?', true)) {
    spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
    if (process.platform === 'darwin') {
      if (installLaunchd()) console.log('  ✓ launchd agent installed and loaded.')
      else console.log('  ✗ launchd install failed; see error above.')
    } else if (process.platform === 'linux') {
      if (installSystemd()) console.log('  ✓ systemd user unit installed and started.')
      else console.log('  ✗ systemd install failed.')
    } else {
      console.log('  (Windows: see README for PM2 instructions.)')
    }
  } else {
    console.log('  Skipped. Start manually with: npm run build && npm run start')
  }

  console.log('\n🎉 Setup complete.')
  console.log(`   Logs: /tmp/claudeclaw.log`)
  if (kv.DASHBOARD_TOKEN) {
    console.log(`   Dashboard: http://localhost:3141/?token=${kv.DASHBOARD_TOKEN}`)
  }
  rl.close()
}

main().catch((e) => {
  console.error('setup failed:', e)
  rl.close()
  process.exit(1)
})
