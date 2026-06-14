import { describe, it, expect } from 'vitest'
import { encryptBuffer, decryptBuffer } from '../electron/settings/backup'

describe('backup crypto', () => {
  it('round-trips a buffer', () => {
    const plain = Buffer.from('merhaba dünya 🌍', 'utf8')
    const blob = encryptBuffer(plain, 'parola123')
    expect(decryptBuffer(blob, 'parola123').toString('utf8')).toBe('merhaba dünya 🌍')
  })

  it('rejects a wrong password', () => {
    const blob = encryptBuffer(Buffer.from('x'), 'right')
    expect(() => decryptBuffer(blob, 'wrong')).toThrow()
  })

  it('rejects a corrupted header', () => {
    const blob = encryptBuffer(Buffer.from('x'), 'pw')
    blob[0] = 0
    expect(() => decryptBuffer(blob, 'pw')).toThrow('Geçersiz yedek')
  })
})
