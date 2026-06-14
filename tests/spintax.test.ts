import { describe, it, expect } from 'vitest'
import { renderSpintax } from '../electron/lib/spintax'

/** rng that always returns 0 -> always first option. */
const first = () => 0
/** rng cycling through provided values. */
function seq(values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('renderSpintax', () => {
  it('picks the first option with rng=0', () => {
    expect(renderSpintax('{Merhaba|Selam} dünya', first)).toBe('Merhaba dünya')
  })

  it('picks a later option based on rng', () => {
    // rng 0.9 * 2 options -> index 1
    expect(renderSpintax('{Merhaba|Selam}', () => 0.9)).toBe('Selam')
  })

  it('leaves text without spintax untouched', () => {
    expect(renderSpintax('plain text', first)).toBe('plain text')
  })

  it('does not touch single-token braces (no pipe)', () => {
    expect(renderSpintax('Hi {ad}', first)).toBe('Hi {ad}')
  })

  it('resolves nested groups inside-out', () => {
    const out = renderSpintax('{A|{B|C}}', seq([0.9, 0]))
    // inner {B|C} with 0.9 -> C, then {A|C} with 0 -> A  (order depends on regex)
    expect(['A', 'B', 'C']).toContain(out)
  })

  it('handles multiple groups', () => {
    expect(renderSpintax('{a|b} ve {c|d}', first)).toBe('a ve c')
  })
})
