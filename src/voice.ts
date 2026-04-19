import fs from 'node:fs'
import path from 'node:path'
import { GROQ_API_KEY, UPLOADS_DIR } from './config.js'
import { child } from './logger.js'

const log = child('voice')

/**
 * Transcribe an audio file via Groq Whisper API.
 * Telegram voice notes come as .oga — Groq accepts .ogg (same format, different extension).
 * Returns the transcript text, or null on failure.
 */
export async function transcribeAudio(filePath: string): Promise<string | null> {
  if (!GROQ_API_KEY) {
    log.warn('GROQ_API_KEY not set — skipping transcription')
    return null
  }

  // Rename .oga -> .ogg if needed
  let submitPath = filePath
  if (filePath.endsWith('.oga')) {
    const renamed = filePath.replace(/\.oga$/, '.ogg')
    try {
      fs.renameSync(filePath, renamed)
      submitPath = renamed
    } catch (e) {
      log.warn({ err: String(e) }, 'rename .oga→.ogg failed, using original')
    }
  }

  try {
    const buf = fs.readFileSync(submitPath)
    const fileName = path.basename(submitPath)
    const fd = new FormData()
    fd.append('file', new Blob([buf]), fileName)
    fd.append('model', 'whisper-large-v3-turbo')
    fd.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: fd,
    })

    if (!res.ok) {
      const errBody = await res.text()
      log.warn({ status: res.status, body: errBody.slice(0, 500) }, 'groq transcription failed')
      return null
    }

    const json = (await res.json()) as { text?: string }
    return json.text ?? null
  } catch (e) {
    log.warn({ err: String(e) }, 'transcription exception')
    return null
  }
}

export async function downloadToUploads(url: string, ext: string): Promise<string> {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const dest = path.join(UPLOADS_DIR, fname)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return dest
}
