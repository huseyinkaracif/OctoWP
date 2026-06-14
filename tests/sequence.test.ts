import { describe, it, expect } from 'vitest'
import { sequenceTick, nextRunAfter } from '../electron/lib/sequence'
import type { SequenceStep } from '../shared/types'

const steps: SequenceStep[] = [
  { ord: 0, body: 'Merhaba', delayHours: 0, condition: 'always' },
  { ord: 1, body: 'Takip 1', delayHours: 48, condition: 'if_no_reply' },
  { ord: 2, body: 'İndirim', delayHours: 72, condition: 'if_no_reply' }
]

const NOW = 1_000_000_000

describe('sequenceTick', () => {
  it('is done when past the last step', () => {
    expect(sequenceTick({ curStep: 3, nextRunAt: 0 }, steps, { now: NOW, hasReplied: false }).action).toBe('done')
  })

  it('waits when the next step is not due', () => {
    expect(sequenceTick({ curStep: 1, nextRunAt: NOW + 1000 }, steps, { now: NOW, hasReplied: false }).action).toBe('wait')
  })

  it('sends an always step when due', () => {
    const a = sequenceTick({ curStep: 0, nextRunAt: NOW }, steps, { now: NOW, hasReplied: false })
    expect(a.action).toBe('send')
    if (a.action === 'send') expect(a.step.body).toBe('Merhaba')
  })

  it('stops a no-reply step when the contact replied (pause-on-reply)', () => {
    expect(sequenceTick({ curStep: 1, nextRunAt: NOW }, steps, { now: NOW, hasReplied: true }).action).toBe('stop')
  })

  it('sends a no-reply step when the contact has not replied', () => {
    expect(sequenceTick({ curStep: 1, nextRunAt: NOW }, steps, { now: NOW, hasReplied: false }).action).toBe('send')
  })
})

describe('nextRunAfter', () => {
  it('schedules the next step by its delay', () => {
    expect(nextRunAfter(steps, 0, NOW)).toBe(NOW + 48 * 3_600_000)
  })
  it('returns null after the last step', () => {
    expect(nextRunAfter(steps, 2, NOW)).toBeNull()
  })
})
