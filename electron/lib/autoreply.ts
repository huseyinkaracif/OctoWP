import type { AutoReplyRule, MatchType } from '../../shared/types'

export interface AutoReplyContext {
  isFirstInbound: boolean
  lastAutoReplyTs: number | null
  now: number
  cooldownMs: number
}

function matches(text: string, keywords: string[], matchType: MatchType): boolean {
  const t = text.trim().toLocaleLowerCase('tr-TR')
  return keywords.some((kw) => {
    const k = kw.trim().toLocaleLowerCase('tr-TR')
    if (!k) return false
    if (matchType === 'exact') return t === k
    if (matchType === 'starts') return t.startsWith(k)
    return t.includes(k)
  })
}

/**
 * Decide the auto-reply rule for an inbound message, or null.
 * Priority: cooldown guard → keyword rule → greeting (first inbound) → away (fallback).
 * The cooldown prevents bot loops and excessive auto-replies (ban risk).
 */
export function matchAutoReply(
  text: string,
  rules: AutoReplyRule[],
  ctx: AutoReplyContext
): AutoReplyRule | null {
  if (ctx.lastAutoReplyTs != null && ctx.now - ctx.lastAutoReplyTs < ctx.cooldownMs) return null

  const enabled = rules.filter((r) => r.enabled)

  const keyword = enabled.find((r) => r.kind === 'keyword' && matches(text, r.keywords, r.matchType))
  if (keyword) return keyword

  if (ctx.isFirstInbound) {
    const greeting = enabled.find((r) => r.kind === 'greeting')
    if (greeting) return greeting
  }

  return enabled.find((r) => r.kind === 'away') ?? null
}
