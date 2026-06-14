import { describe, it, expect } from 'vitest'
import {
  pickDelaySec,
  isWithinActiveHours,
  dailyCap,
  batchThreshold,
  warmupDayIndex
} from '../electron/lib/throttle'

describe('pickDelaySec', () => {
  it('returns min when rng=0', () => {
    expect(pickDelaySec(20, 45, () => 0)).toBe(20)
  })
  it('returns max-ish when rng~1', () => {
    expect(pickDelaySec(20, 45, () => 1)).toBeCloseTo(45)
  })
  it('clamps when max<=min', () => {
    expect(pickDelaySec(30, 10, () => 0.5)).toBe(30)
  })
})

describe('isWithinActiveHours', () => {
  const at = (h: number) => new Date(2026, 0, 1, h, 0, 0)
  it('true inside a normal window', () => {
    expect(isWithinActiveHours(at(10), 9, 21)).toBe(true)
  })
  it('false before window', () => {
    expect(isWithinActiveHours(at(8), 9, 21)).toBe(false)
  })
  it('false at the exclusive end', () => {
    expect(isWithinActiveHours(at(21), 9, 21)).toBe(false)
  })
  it('always true when from===to (24h)', () => {
    expect(isWithinActiveHours(at(3), 0, 0)).toBe(true)
  })
  it('handles windows that wrap midnight', () => {
    expect(isWithinActiveHours(at(23), 22, 6)).toBe(true)
    expect(isWithinActiveHours(at(2), 22, 6)).toBe(true)
    expect(isWithinActiveHours(at(12), 22, 6)).toBe(false)
  })
})

describe('dailyCap', () => {
  const s = { dailyCapStart: 50, dailyCapMax: 300, warmupDays: 5 }
  it('returns start on day 1', () => {
    expect(dailyCap(s, 1)).toBe(50)
  })
  it('returns max on/after last warmup day', () => {
    expect(dailyCap(s, 5)).toBe(300)
    expect(dailyCap(s, 9)).toBe(300)
  })
  it('ramps linearly in between', () => {
    // day 3 of 5: 50 + (300-50)*2/4 = 175
    expect(dailyCap(s, 3)).toBe(175)
  })
  it('no warmup returns max immediately', () => {
    expect(dailyCap({ dailyCapStart: 200, dailyCapMax: 1000, warmupDays: 1 }, 1)).toBe(1000)
  })
})

describe('batchThreshold', () => {
  it('returns rounded value in range', () => {
    expect(batchThreshold(20, 30, () => 0)).toBe(20)
    expect(batchThreshold(20, 30, () => 1)).toBe(30)
  })
})

describe('warmupDayIndex', () => {
  it('day 1 on the first day', () => {
    const first = new Date(2026, 0, 1, 8, 0, 0)
    const now = new Date(2026, 0, 1, 20, 0, 0)
    expect(warmupDayIndex(first, now)).toBe(1)
  })
  it('counts whole days elapsed', () => {
    const first = new Date(2026, 0, 1, 8, 0, 0)
    const now = new Date(2026, 0, 4, 9, 0, 0)
    expect(warmupDayIndex(first, now)).toBe(4)
  })
})
