import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneToJid } from '../electron/lib/phone'

describe('normalizePhone', () => {
  it('handles national number with trunk zero', () => {
    expect(normalizePhone('0555 123 45 67', '90')).toBe('905551234567')
  })

  it('handles bare national number without trunk zero', () => {
    expect(normalizePhone('5551234567', '90')).toBe('905551234567')
  })

  it('handles + international form', () => {
    expect(normalizePhone('+90 555 123 4567', '90')).toBe('905551234567')
  })

  it('handles 00 international prefix', () => {
    expect(normalizePhone('00905551234567', '90')).toBe('905551234567')
  })

  it('keeps a number that already includes the country code', () => {
    expect(normalizePhone('905551234567', '90')).toBe('905551234567')
  })

  it('strips formatting characters', () => {
    expect(normalizePhone('(0555) 123-45-67', '90')).toBe('905551234567')
  })

  it('returns null for junk', () => {
    expect(normalizePhone('abc', '90')).toBeNull()
    expect(normalizePhone('', '90')).toBeNull()
    expect(normalizePhone('   ', '90')).toBeNull()
    expect(normalizePhone(null, '90')).toBeNull()
  })

  it('returns null for too-short numbers', () => {
    expect(normalizePhone('123', '90')).toBeNull()
  })

  it('accepts numeric input', () => {
    expect(normalizePhone(5551234567, '90')).toBe('905551234567')
  })
})

describe('phoneToJid', () => {
  it('builds an individual jid', () => {
    expect(phoneToJid('905551234567')).toBe('905551234567@s.whatsapp.net')
  })
})
