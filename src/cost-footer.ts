import { SHOW_COST_FOOTER } from './config.js'

export type CostFooterMode = 'compact' | 'verbose' | 'cost' | 'full' | 'off'

// Rough $/1M tokens for cost estimation. Update as prices change.
const PRICING: Record<string, { in: number; out: number }> = {
  opus: { in: 15, out: 75 },
  sonnet: { in: 3, out: 15 },
  haiku: { in: 0.8, out: 4 },
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function shortModel(model: string): string {
  // "claude-sonnet-4-6-20260514" -> "sonnet-4"
  // "claude-opus-4-7" -> "opus-4"
  const m = model.match(/(opus|sonnet|haiku)-(\d+)/i)
  if (m) return `${m[1].toLowerCase()}-${m[2]}`
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const tier = Object.keys(PRICING).find((k) => model.toLowerCase().includes(k))
  if (!tier) return 0
  const p = PRICING[tier]
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
}

export function formatCostFooter(
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  mode: CostFooterMode = SHOW_COST_FOOTER,
): string {
  if (mode === 'off' || !model) return ''
  const m = shortModel(model)
  const iT = inputTokens ?? 0
  const oT = outputTokens ?? 0

  switch (mode) {
    case 'compact':
      return `\n\n[${m}]`
    case 'verbose':
      return `\n\n[${m} | ${fmtTokens(iT)} in / ${fmtTokens(oT)} out]`
    case 'cost': {
      const c = estimateCost(model, iT, oT)
      return `\n\n[${m} | ~$${c.toFixed(c < 0.01 ? 4 : 2)}]`
    }
    case 'full': {
      const c = estimateCost(model, iT, oT)
      return `\n\n[${m} | ${fmtTokens(iT)} in / ${fmtTokens(oT)} out | ~$${c.toFixed(c < 0.01 ? 4 : 2)}]`
    }
  }
}
