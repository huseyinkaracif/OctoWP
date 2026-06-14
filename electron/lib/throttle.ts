export type Rng = () => number

/** Random delay in seconds within [min, max]. */
export function pickDelaySec(min: number, max: number, rng: Rng = Math.random): number {
  if (max <= min) return Math.max(0, min)
  return min + rng() * (max - min)
}

/**
 * Is `date`'s local hour within the active window [from, to)?
 * from === to means 24h (always active). Windows may wrap midnight.
 */
export function isWithinActiveHours(date: Date, from: number, to: number): boolean {
  const h = date.getHours()
  if (from === to) return true
  if (from < to) return h >= from && h < to
  return h >= from || h < to
}

/**
 * Daily send cap for a given warmup day (1-based). Ramps linearly from
 * dailyCapStart (day 1) to dailyCapMax (day >= warmupDays).
 */
export function dailyCap(
  settings: { dailyCapStart: number; dailyCapMax: number; warmupDays: number },
  warmupDay: number
): number {
  const { dailyCapStart, dailyCapMax, warmupDays } = settings
  if (warmupDays <= 1 || warmupDay >= warmupDays) return dailyCapMax
  const d = Math.max(1, warmupDay)
  const ramp = ((dailyCapMax - dailyCapStart) * (d - 1)) / (warmupDays - 1)
  return Math.round(dailyCapStart + ramp)
}

/** Randomized count of sends before the next batch pause. */
export function batchThreshold(min: number, max: number, rng: Rng = Math.random): number {
  if (max <= min) return Math.max(1, Math.round(min))
  return Math.round(min + rng() * (max - min))
}

/** Whole days elapsed since `firstUsed` (warmup day index, 1-based). */
export function warmupDayIndex(firstUsed: Date, now: Date): number {
  const ms = now.getTime() - firstUsed.getTime()
  const days = Math.floor(ms / 86_400_000)
  return Math.max(1, days + 1)
}
