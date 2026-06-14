import type { OctoApi } from '@shared/types'

declare global {
  interface Window {
    octo: OctoApi
  }
}

export {}
