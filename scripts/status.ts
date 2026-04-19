#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

function check(label: string, fn: () => string | null): void {
  try {
    const r = fn()
    if (r === null) console.log(`  ✓ ${label}`)
    else console.log(`  ${r ? 'ℹ️' : '✓'} ${label} — ${r ?? ''}`)
  } catch (e: any) {
    console.log(`  ✗ ${label} — ${e.message ?? String(e)}`)
  }
}

console.log('\n🦀 ClaudeClaw status\n')

check('.env exists', () => fs.existsSync(path.join(ROOT, '.env')) ? null : 'missing')
check('dist/ built', () => fs.existsSync(path.join(ROOT, 'dist', 'index.js')) ? null : 'run: npm run build')
check('node version', () => {
  const v = process.versions.node
  const [maj] = v.split('.').map(Number)
  return maj >= 20 ? null : `v${v} — need >=20`
})
check('claude CLI', () => {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf-8' })
  return r.status === 0 ? null : 'not found in PATH (install Claude Code)'
})
check('PID lock', () => {
  const p = path.join(ROOT, 'store', 'claudeclaw.pid')
  if (!fs.existsSync(p)) return 'not running'
  const pid = Number(fs.readFileSync(p, 'utf-8').trim())
  try {
    process.kill(pid, 0)
    return `running (pid ${pid})`
  } catch {
    return `stale pid ${pid} — not running`
  }
})
check('launchd / systemd', () => {
  if (process.platform === 'darwin') {
    const r = spawnSync('launchctl', ['list'], { encoding: 'utf-8' })
    return r.stdout?.includes('com.claudeclaw.main') ? 'launchd: loaded' : 'launchd: not installed'
  }
  if (process.platform === 'linux') {
    const r = spawnSync('systemctl', ['--user', 'is-active', 'claudeclaw.service'], { encoding: 'utf-8' })
    return `systemd: ${r.stdout?.trim()}`
  }
  return 'platform: manual'
})

console.log('')
