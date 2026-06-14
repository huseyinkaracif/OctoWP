import { describe, it, expect } from 'vitest'
import { matchAutoReply, type AutoReplyContext } from '../electron/lib/autoreply'
import type { AutoReplyRule } from '../shared/types'

let nextId = 1
const rule = (p: Partial<AutoReplyRule>): AutoReplyRule => ({
  id: nextId++,
  kind: 'keyword',
  name: '',
  keywords: [],
  matchType: 'contains',
  reply: '',
  enabled: true,
  ...p
})

const ctx = (p: Partial<AutoReplyContext> = {}): AutoReplyContext => ({
  isFirstInbound: false,
  lastAutoReplyTs: null,
  now: 1_000_000,
  cooldownMs: 60_000,
  ...p
})

describe('matchAutoReply', () => {
  it('matches a keyword (contains, case-insensitive)', () => {
    const r = rule({ keywords: ['fiyat'], reply: 'Fiyat listemiz...' })
    expect(matchAutoReply('FİYAT nedir?', [r], ctx())?.reply).toBe('Fiyat listemiz...')
  })

  it('respects exact and starts match types', () => {
    const exact = rule({ keywords: ['merhaba'], matchType: 'exact', reply: 'E' })
    expect(matchAutoReply('merhaba', [exact], ctx())?.reply).toBe('E')
    expect(matchAutoReply('merhaba dünya', [exact], ctx())).toBeNull()
    const starts = rule({ keywords: ['kampanya'], matchType: 'starts', reply: 'S' })
    expect(matchAutoReply('kampanya var mı', [starts], ctx())?.reply).toBe('S')
  })

  it('blocks within the cooldown window', () => {
    const r = rule({ keywords: ['x'], reply: 'R' })
    expect(matchAutoReply('x', [r], ctx({ lastAutoReplyTs: 1_000_000 - 10_000 }))).toBeNull()
    expect(matchAutoReply('x', [r], ctx({ lastAutoReplyTs: 1_000_000 - 120_000 }))?.reply).toBe('R')
  })

  it('fires greeting only on first inbound', () => {
    const g = rule({ kind: 'greeting', reply: 'Hoş geldin' })
    expect(matchAutoReply('selam', [g], ctx({ isFirstInbound: true }))?.reply).toBe('Hoş geldin')
    expect(matchAutoReply('selam', [g], ctx({ isFirstInbound: false }))).toBeNull()
  })

  it('falls back to away when nothing matches', () => {
    const away = rule({ kind: 'away', reply: 'Müsait değilim' })
    expect(matchAutoReply('rastgele', [away], ctx())?.reply).toBe('Müsait değilim')
  })

  it('keyword beats greeting and away', () => {
    const kw = rule({ keywords: ['fiyat'], reply: 'K' })
    const g = rule({ kind: 'greeting', reply: 'G' })
    const away = rule({ kind: 'away', reply: 'A' })
    expect(matchAutoReply('fiyat?', [g, away, kw], ctx({ isFirstInbound: true }))?.reply).toBe('K')
  })

  it('ignores disabled rules', () => {
    const r = rule({ keywords: ['x'], reply: 'R', enabled: false })
    expect(matchAutoReply('x', [r], ctx())).toBeNull()
  })
})
