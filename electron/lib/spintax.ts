export type Rng = () => number

/**
 * Resolve spintax groups `{a|b|c}` by picking one option at random.
 * Only groups that contain a `|` are treated as spintax; other braces
 * (e.g. leftover `{var}`) are left untouched. Nested groups resolve
 * inside-out.
 */
export function renderSpintax(text: string, rng: Rng = Math.random): string {
  const pattern = /\{([^{}]*\|[^{}]*)\}/
  let s = text
  let guard = 0
  while (pattern.test(s) && guard++ < 1000) {
    s = s.replace(pattern, (_match, inner: string) => {
      const opts = inner.split('|')
      const idx = Math.floor(rng() * opts.length)
      return opts[Math.min(idx, opts.length - 1)]
    })
  }
  return s
}
