export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'context_exhausted'
  | 'timeout'
  | 'subprocess_crash'
  | 'network'
  | 'billing'
  | 'overloaded'
  | 'unknown'

export interface ErrorRecovery {
  shouldRetry: boolean
  shouldNewChat: boolean
  shouldSwitchModel: boolean
  retryAfterMs: number
  userMessage: string
}

const PATTERNS: Array<{ category: ErrorCategory; needles: string[] }> = [
  {
    category: 'auth',
    needles: ['unauthorized', '401', 'invalid api key', 'not authenticated', 'authentication_error'],
  },
  {
    category: 'rate_limit',
    needles: ['rate limit', '429', 'too many requests', 'rate_limit_error'],
  },
  {
    category: 'context_exhausted',
    needles: ['context window', 'max tokens', 'input is too long', 'context length'],
  },
  {
    category: 'timeout',
    needles: ['timeout', 'etimedout', 'timed out', 'deadline exceeded'],
  },
  {
    category: 'subprocess_crash',
    needles: ['enoent', 'spawn', 'exited with code', 'killed', 'sigterm', 'sigkill'],
  },
  {
    category: 'network',
    needles: ['econnrefused', 'econnreset', 'enotfound', 'network', 'fetch failed'],
  },
  {
    category: 'billing',
    needles: ['billing', 'quota', 'credits', 'payment', 'insufficient_quota'],
  },
  {
    category: 'overloaded',
    needles: ['overloaded', '529', 'service_unavailable', 'server is busy'],
  },
]

export function classifyError(error: Error | string): {
  category: ErrorCategory
  recovery: ErrorRecovery
} {
  const msg = (typeof error === 'string' ? error : error.message ?? '').toLowerCase()
  let category: ErrorCategory = 'unknown'
  for (const p of PATTERNS) {
    if (p.needles.some((n) => msg.includes(n))) {
      category = p.category
      break
    }
  }

  const recovery: ErrorRecovery = {
    shouldRetry: false,
    shouldNewChat: false,
    shouldSwitchModel: false,
    retryAfterMs: 0,
    userMessage: '',
  }

  switch (category) {
    case 'auth':
      recovery.userMessage =
        'Authentication failed. Check your Claude Code login (`claude login`) or API keys.'
      break
    case 'rate_limit':
      recovery.shouldRetry = true
      recovery.retryAfterMs = 30_000
      recovery.userMessage = 'Rate limited — retrying in 30s.'
      break
    case 'context_exhausted':
      recovery.shouldNewChat = true
      recovery.userMessage =
        'Context window full. Start a new chat with /newchat to continue.'
      break
    case 'timeout':
      recovery.shouldRetry = true
      recovery.retryAfterMs = 5_000
      recovery.userMessage = 'Request timed out — retrying.'
      break
    case 'subprocess_crash':
      recovery.shouldRetry = true
      recovery.retryAfterMs = 2_000
      recovery.userMessage = 'Claude Code subprocess crashed. Retrying.'
      break
    case 'network':
      recovery.shouldRetry = true
      recovery.retryAfterMs = 5_000
      recovery.userMessage = 'Network hiccup — retrying.'
      break
    case 'billing':
      recovery.userMessage =
        'Billing / quota issue. Check your Anthropic subscription or API key.'
      break
    case 'overloaded':
      recovery.shouldRetry = true
      recovery.shouldSwitchModel = true
      recovery.retryAfterMs = 10_000
      recovery.userMessage = 'Model overloaded — retrying with fallback.'
      break
    default:
      recovery.userMessage = typeof error === 'string' ? error : error.message ?? 'Unknown error'
  }

  return { category, recovery }
}
