import { describe, it, expect } from 'vitest'
import { applyVars, renderMessage } from '../electron/lib/template'

describe('applyVars', () => {
  it('replaces a known variable', () => {
    expect(applyVars('Merhaba {ad}', { ad: 'Ali' })).toBe('Merhaba Ali')
  })

  it('replaces missing variables with empty string', () => {
    expect(applyVars('Merhaba {ad}', {})).toBe('Merhaba ')
  })

  it('replaces multiple variables', () => {
    expect(applyVars('{ad} - {sehir}', { ad: 'Ali', sehir: 'İzmir' })).toBe('Ali - İzmir')
  })

  it('supports unicode variable names', () => {
    expect(applyVars('{İl}', { 'İl': 'Bursa' })).toBe('Bursa')
  })

  it('leaves spintax groups untouched', () => {
    expect(applyVars('{Merhaba|Selam} {ad}', { ad: 'Ali' })).toBe('{Merhaba|Selam} Ali')
  })
})

describe('renderMessage', () => {
  it('applies vars then resolves spintax', () => {
    const out = renderMessage('{Merhaba|Selam} {ad}', { ad: 'Ali' }, () => 0)
    expect(out).toBe('Merhaba Ali')
  })
})
