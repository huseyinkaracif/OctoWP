import { renderSpintax } from './spintax'

/**
 * Replace `{var}` tokens with values from the map. Unicode letters allowed in
 * names (e.g. `{İl}`). A token is replaced with its value, or empty string if
 * the key is absent. Spintax groups `{a|b}` are left untouched (they contain a
 * `|`, which is not a valid variable-name character).
 */
export function applyVars(
  text: string,
  vars: Record<string, string | null | undefined>
): string {
  return text.replace(/\{([\p{L}\p{N}_]+)\}/gu, (_match, key: string) => {
    const v = vars[key]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Full render: variables first, then spintax. */
export function renderMessage(
  template: string,
  vars: Record<string, string | null | undefined>,
  rng?: () => number
): string {
  return renderSpintax(applyVars(template, vars), rng)
}
