import { describe, it, expect } from 'vitest'
import { PRESETS, DEFAULT_SETTINGS, applyPreset } from '../electron/lib/presets'

describe('presets', () => {
  it('has all three risk profiles', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['aggressive', 'balanced', 'conservative'])
  })

  it('default settings use the balanced preset values', () => {
    expect(DEFAULT_SETTINGS.preset).toBe('balanced')
    expect(DEFAULT_SETTINGS.msgDelayMin).toBe(PRESETS.balanced.msgDelayMin)
    expect(DEFAULT_SETTINGS.defaultCountryCode).toBe('90')
  })

  it('applyPreset swaps throttle values but keeps non-throttle fields', () => {
    const next = applyPreset(DEFAULT_SETTINGS, 'aggressive')
    expect(next.preset).toBe('aggressive')
    expect(next.msgDelayMin).toBe(PRESETS.aggressive.msgDelayMin)
    expect(next.defaultCountryCode).toBe('90')
    expect(next.theme).toBe('light')
  })

  it('conservative is slower than aggressive', () => {
    expect(PRESETS.conservative.msgDelayMin).toBeGreaterThan(PRESETS.aggressive.msgDelayMin)
  })
})
