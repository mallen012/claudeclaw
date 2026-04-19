/**
 * WhatsApp bridge — keeps a long-lived whatsapp-web.js session alive,
 * processes outbound queue from SQLite, and captures inbound messages.
 *
 * First run requires a QR scan in the terminal.
 */
import qrcodeTerm from 'qrcode-terminal'
import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg
type WAClient = InstanceType<typeof Client>
import { child } from './logger.js'
import {
  pendingWaOutbound,
  markWaOutboundSent,
  markWaOutboundFailed,
  recordWaInbound,
} from './db.js'

const log = child('whatsapp')

let client: WAClient | null = null
let ready = false

export function startWhatsapp(): Promise<void> {
  if (client) return Promise.resolve()

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
