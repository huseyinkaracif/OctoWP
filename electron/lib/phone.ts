/**
 * Normalize a raw phone string to E.164 digits-only form (no leading '+').
 * Returns null for junk / implausible numbers.
 *
 * Examples (defaultCountryCode "90"):
 *   "0555 123 45 67"   -> "905551234567"
 *   "5551234567"       -> "905551234567"
 *   "+90 555 123 4567" -> "905551234567"
 *   "00905551234567"   -> "905551234567"
 *   "905551234567"     -> "905551234567"
 *   "abc" / "123"      -> null
 */
export function normalizePhone(
  raw: string | number | null | undefined,
  defaultCountryCode: string
): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null

  const cc = String(defaultCountryCode).replace(/\D/g, '')
  let digits = s.replace(/\D/g, '')
  if (!digits) return null

  if (s.startsWith('00')) {
    digits = digits.replace(/^00/, '')
  } else if (s.startsWith('+')) {
    // already international; digits has no '+'
  } else if (digits.startsWith('0')) {
    digits = cc + digits.replace(/^0+/, '')
  } else if (cc && digits.startsWith(cc) && digits.length > cc.length + 6) {
    // already includes the country code
  } else {
    digits = cc + digits
  }

  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

/** WhatsApp JID for an individual chat from digits-only E.164. */
export function phoneToJid(phone: string): string {
  return `${phone}@s.whatsapp.net`
}
