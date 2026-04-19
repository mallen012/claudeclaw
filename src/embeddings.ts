import { getGenAI, GEMINI_EMBED_MODEL } from './gemini.js'
import { child } from './logger.js'

const log = child('embeddings')

export async function embed(text: string): Promise<Float32Array | null> {
  if (!text || text.length === 0) return null
  try {
    const ai = getGenAI()
    const res = await ai.models.embedContent({
      model: GEMINI_EMBED_MODEL,
      contents: text,
    })
    const values =
      (res as any).embeddings?.[0]?.values ??
      (res as any).embedding?.values ??
      null
    if (!values) return null
    return Float32Array.from(values)
  } catch (e) {
    log.warn({ err: String(e) }, 'embed failed')
    return null
  }
}

export function packEmbedding(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

export function unpackEmbedding(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
