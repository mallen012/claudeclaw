import fs from 'node:fs'
import path from 'node:path'
import { TELEGRAM_BOT_TOKEN, UPLOADS_DIR } from './config.js'

export interface MediaFile {
  path: string
  mime?: string
  sizeBytes: number
}

/**
 * Resolve a Telegram file_id to a downloadable URL and fetch it into uploads.
 */
export async function downloadTelegramFile(fileId: string, defaultExt = ''): Promise<MediaFile> {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  const metaRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
  )
  const meta = (await metaRes.json()) as { ok: boolean; result?: { file_path: string } }
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(`getFile failed for ${fileId}`)
  }

  const remotePath = meta.result.file_path
  const ext = path.extname(remotePath) || defaultExt
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const dest = path.join(UPLOADS_DIR, fileName)

  const dlRes = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${remotePath}`,
  )
  if (!dlRes.ok) throw new Error(`download failed: ${dlRes.status}`)
  const buf = Buffer.from(await dlRes.arrayBuffer())
  fs.writeFileSync(dest, buf)

  return { path: dest, sizeBytes: buf.byteLength }
}
