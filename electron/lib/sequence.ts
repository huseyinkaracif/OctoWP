import type { SequenceStep } from '../../shared/types'

export interface EnrollmentLike {
  curStep: number
  nextRunAt: number
}

export type SequenceAction =
  | { action: 'send'; step: SequenceStep }
  | { action: 'stop' } // paused because the contact replied
  | { action: 'done' } // all steps completed
  | { action: 'wait' } // not yet time for the next step

/**
 * Decide what to do for an enrollment right now.
 * - done: no more steps
 * - wait: next step not due yet
 * - stop: current step is gated on "no reply" but the contact replied (pause-on-reply)
 * - send: deliver the current step
 */
export function sequenceTick(
  enr: EnrollmentLike,
  steps: SequenceStep[],
  ctx: { now: number; hasReplied: boolean }
): SequenceAction {
  if (enr.curStep >= steps.length) return { action: 'done' }
  if (ctx.now < enr.nextRunAt) return { action: 'wait' }
  const step = steps[enr.curStep]
  if (step.condition === 'if_no_reply' && ctx.hasReplied) return { action: 'stop' }
  return { action: 'send', step }
}

/** Epoch ms when the step after `justSentIndex` becomes due, or null if it was the last step. */
export function nextRunAfter(steps: SequenceStep[], justSentIndex: number, now: number): number | null {
  const nextIndex = justSentIndex + 1
  if (nextIndex >= steps.length) return null
  return now + Math.max(0, steps[nextIndex].delayHours) * 3_600_000
}
