// Classify incoming messages as simple (cheap fast path) or complex (full pipeline).
// Currently advisory only — downstream code may route simple messages to a
// lighter model or skip memory injection. Disabled unless SIMPLE_CLASSIFIER is on.

export type MessageClass = 'simple' | 'complex'

const SIMPLE_PATTERNS: RegExp[] = [
  /^(ok|okay|k|kk|thanks|thx|ty|thank you|got it|cool|sure|yes|no|yep|nope|yeah)[\s.!?]*$/i,
  /^(perfect|great|awesome|nice|love it|sounds good)[\s.!?]*$/i,
  /^[\s👍👌👏🙏✅❤️🔥💯😊]{1,5}$/,
]

export function classifyMessage(text: string): MessageClass {
  const t = text.trim()
  if (t.length === 0) return 'simple'
  if (t.length <= 30 && SIMPLE_PATTERNS.some((r) => r.test(t))) return 'simple'
  return 'complex'
}
