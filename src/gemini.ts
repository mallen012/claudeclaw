import { GoogleGenAI } from '@google/genai'
import { GOOGLE_API_KEY } from './config.js'
import { child } from './logger.js'

const log = child('gemini')

let client: GoogleGenAI | null = null

export function getGenAI(): GoogleGenAI {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set — Memory v2 / video analysis disabled')
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: GOOGLE_API_KEY })
  }
  return client
}

export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash'
export const GEMINI_EMBED_MODEL = 'gemini-embedding-001'

export async function generateJson<T = unknown>(
  prompt: string,
  schema?: Record<string, unknown>,
): Promise<T | null> {
  try {
    const ai = getGenAI()
    const res = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema as any } : {}),
      },
    })
    const txt = res.text?.trim()
    if (!txt) return null
    return JSON.parse(txt) as T
  } catch (e) {
    log.warn({ err: String(e) }, 'gemini generateJson failed')
    return null
  }
}

export async function generateText(prompt: string): Promise<string | null> {
  try {
    const ai = getGenAI()
    const res = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: prompt,
    })
    return res.text ?? null
  } catch (e) {
    log.warn({ err: String(e) }, 'gemini generateText failed')
    return null
  }
}
