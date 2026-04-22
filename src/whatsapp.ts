/**
 * WhatsApp bridge — keeps a long-lived whatsapp-web.js session alive,
 * processes outbound queue from SQLite, and captures inbound messages.
 *
 * First run requires a QR scan in the terminal.
 */
import fs from 'node:fs'
import path from 'node:path'
import qrcodeTerm from 'qrcode-terminal'
import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg
type WAClient = InstanceType<typeof Client>
import { child } from './logger.js'
import { readEnvFile } from './env.js'
import {
  pendingWaOutbound,
  markWaOutboundSent,
  markWaOutboundFailed,
  recordWaInbound,
} from './db.js'

const log = child('whatsapp')

let client: WAClient | null = null
let ready = false

function cleanStaleChromiumLocks(): void {
  const base = path.join(process.cwd(), '.wwebjs_auth')
  if (!fs.existsSync(base)) return
  try {
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry)
      try {
        const stat = fs.statSync(dir)
        if (!stat.isDirectory()) continue
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith('Singleton')) {
            fs.rmSync(path.join(dir, f), { force: true })
          }
        }
      } catch {
        /* ignore */
      }
    }
    log.info('cleaned stale Chromium Singleton locks')
  } catch (e) {
    log.warn({ err: String(e) }, 'chromium lock cleanup failed')
  }
}

export function startWhatsapp(): Promise<void> {
  const env = readEnvFile()
  if (env['DISABLE_WHATSAPP'] === 'true' || env['DISABLE_WHATSAPP'] === '1') {
    log.info('WhatsApp disabled via DISABLE_WHATSAPP')
    return Promise.resolve()
  }
  if (client) return Promise.resolve()
  cleanStaleChromiumLocks()

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'claudeclaw' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  })

  client.on('qr', (qr: string) => {
    log.info('WhatsApp QR — scan from your phone (WhatsApp → Linked devices)')
    qrcodeTerm.generate(qr, { small: true })
  })

  client.on('ready', () => {
    ready = true
    log.info('WhatsApp ready')
    void drainOutboundLoop()
  })

  client.on('authenticated', () => log.info('WhatsApp authenticated'))
  client.on('auth_failure', (m: string) => log.error({ m }, 'WhatsApp auth failure'))
  client.on('disconnected', (reason: string) => {
    ready = false
    log.warn({ reason }, 'WhatsApp disconnected')
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on('message', async (msg: any) => {
    try {
      const chat = await msg.getChat()
      const contact = await msg.getContact()
      recordWaInbound(chat.id._serialized, msg.id._serialized, contact.pushname ?? contact.name ?? null, msg.body)
    } catch (e) {
      log.warn({ err: String(e) }, 'wa inbound record failed')
    }
  })

  return client.initialize()
}

async function drainOutboundLoop(): Promise<void> {
  while (ready && client) {
    const pending = pendingWaOutbound()
    for (const msg of pending) {
      try {
        await client.sendMessage(msg.wa_chat_id, msg.body)
        markWaOutboundSent(msg.id)
      } catch (e) {
        markWaOutboundFailed(msg.id, String(e))
        log.warn({ err: String(e), id: msg.id }, 'wa send failed')
      }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
}

export async function stopWhatsapp(): Promise<void> {
  if (client) {
    await client.destroy()
    client = null
    ready = false
  }
}
