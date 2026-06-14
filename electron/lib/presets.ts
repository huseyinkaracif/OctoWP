import type { ThrottleSettings, RiskPresetName, Settings } from '../../shared/types'

export const PRESETS: Record<RiskPresetName, ThrottleSettings> = {
  balanced: {
    msgDelayMin: 20,
    msgDelayMax: 45,
    mediaDelayMin: 45,
    mediaDelayMax: 90,
    batchEveryMin: 20,
    batchEveryMax: 30,
    batchPauseMin: 300,
    batchPauseMax: 900,
    dailyCapStart: 50,
    dailyCapMax: 300,
    warmupDays: 5,
    activeFrom: 9,
    activeTo: 21
  },
  conservative: {
    msgDelayMin: 45,
    msgDelayMax: 90,
    mediaDelayMin: 90,
    mediaDelayMax: 180,
    batchEveryMin: 15,
    batchEveryMax: 20,
    batchPauseMin: 600,
    batchPauseMax: 1200,
    dailyCapStart: 40,
    dailyCapMax: 150,
    warmupDays: 7,
    activeFrom: 10,
    activeTo: 20
  },
  aggressive: {
    msgDelayMin: 5,
    msgDelayMax: 15,
    mediaDelayMin: 15,
    mediaDelayMax: 30,
    batchEveryMin: 40,
    batchEveryMax: 50,
    batchPauseMin: 180,
    batchPauseMax: 300,
    dailyCapStart: 200,
    dailyCapMax: 1000,
    warmupDays: 1,
    activeFrom: 0,
    activeTo: 0
  }
}

export const DEFAULT_SETTINGS: Settings = {
  ...PRESETS.balanced,
  preset: 'balanced',
  defaultCountryCode: '90',
  optOutKeywords: ['DUR', 'STOP', 'İPTAL'],
  theme: 'light',
  typingSimulation: true
}

/** Merge a preset's throttle values onto existing settings, keeping non-throttle fields. */
export function applyPreset(current: Settings, name: RiskPresetName): Settings {
  return { ...current, ...PRESETS[name], preset: name }
}
