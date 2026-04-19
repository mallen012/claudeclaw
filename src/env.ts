import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

let cached: Record<string, string> | null = null

export function readEnvFile(keys?: string[]): Record<string, string> {
  if (!cached) {
    const envPath = path.join(PROJECT_ROOT, '.env')
    try {
      const text = fs.readFileSync(envPath, 'utf-8')
      cached = parseEnvText(text)
    } catch {
      cached = {}
    }
  }
  if (!keys) return { ...cached }
  const filtered: Record<string, string> = {}
  for (const k of keys) if (cached[k] !== undefined) filtered[k] = cached[k]
  return filtered
}

export function reloadEnvFile(): void {
  cached = null
}

export { PROJECT_ROOT }
