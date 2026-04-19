export interface SecretMatch {
  type: string
  position: number
  length: number
  preview: string
}

// Each pattern: { type, re, preview?(m) }
const PATTERNS: { type: string; re: RegExp }[] = [
  // Anthropic keys
  { type: 'anthropic_key', re: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  // OpenAI-style keys
  { type: 'openai_key', re: /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g },
  // Stripe live keys
  { type: 'stripe_key', re: /(?:sk|pk|rk)_live_[a-zA-Z0-9]{20,}/g },
  // Stripe test keys (still sensitive in some contexts)
  { type: 'stripe_test_key', re: /(?:sk|pk|rk)_test_[a-zA-Z0-9]{20,}/g },
  // Slack tokens
  { type: 'slack_token', re: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
  // GitHub tokens
  { type: 'github_token', re: /gh[pousr]_[a-zA-Z0-9]{30,}/g },
  // Google API keys
  { type: 'google_api_key', re: /AIza[0-9A-Za-z-_]{35}/g },
  // AWS access keys
  { type: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  // AWS secret access keys (heuristic)
  {
    type: 'aws_secret_key',
    re: /(?<![A-Za-z0-9/+=])(?:aws[_-]?secret[_-]?(?:access[_-]?)?key\s*[:=]\s*['"]?)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/gi,
  },
  // JWTs
  { type: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  // Bearer in header
  { type: 'bearer_token', re: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi },
  // Generic hex keys (32+ chars)
  { type: 'hex_key', re: /\b[a-f0-9]{32,}\b/gi },
  // env file assignment with secret-looking value
  {
    type: 'env_assign',
    re: /(?:api[_-]?key|secret|password|passwd|token|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}/gi,
  },
  // Base64-encoded high-entropy strings that decode to look like keys
  { type: 'base64_secret', re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g },
  // URL-encoded secret-like chunks
  { type: 'url_encoded_secret', re: /(?:%[0-9A-Fa-f]{2}){8,}/g },
]

const ENV_DUMP_RE = /(?:^|\n)(?:[A-Z][A-Z0-9_]{2,}=[^\n]*){3,}/g

function preview(s: string, maxLen = 12): string {
  if (s.length <= maxLen) return '*'.repeat(s.length)
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

export function scanForSecrets(text: string): SecretMatch[] {
  if (!text) return []
  const out: SecretMatch[] = []

  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      // Filter: base64 and hex need higher-entropy sanity
      if (type === 'base64_secret' || type === 'hex_key') {
        const s = m[0]
        if (!hasEntropy(s)) continue
      }
      out.push({
        type,
        position: m.index,
        length: m[0].length,
        preview: preview(m[0]),
      })
    }
  }

  // .env dumps
  ENV_DUMP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ENV_DUMP_RE.exec(text)) !== null) {
    out.push({
      type: 'env_dump',
      position: m.index,
      length: m[0].length,
      preview: '.env-style assignments detected',
    })
  }

  return out
}

export function redactSecrets(text: string): { text: string; matches: SecretMatch[] } {
  const matches = scanForSecrets(text)
  if (matches.length === 0) return { text, matches }
  // Sort by position descending so replacement offsets stay valid
  const sorted = [...matches].sort((a, b) => b.position - a.position)
  let out = text
  for (const m of sorted) {
    out = out.slice(0, m.position) + '[REDACTED]' + out.slice(m.position + m.length)
  }
  return { text: out, matches }
}

function hasEntropy(s: string): boolean {
  const counts: Record<string, number> = {}
  for (const c of s) counts[c] = (counts[c] ?? 0) + 1
  const len = s.length
  let H = 0
  for (const k in counts) {
    const p = counts[k] / len
    H -= p * Math.log2(p)
  }
  // Random hex is ~4 bits/char; random base64 is ~6. Require >3.
  return H > 3
}
