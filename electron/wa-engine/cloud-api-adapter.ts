import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import type { CloudVerifyResult, WaHeaderFormat, WaTemplate } from '../../shared/types'
import type { CloudApiPort, SendResult, SendTemplateInput } from './port'
import { logger } from '../logging/logger'

export interface CloudCreds {
  waToken: string
  phoneNumberId: string
  wabaId: string
  graphVersion: string
}

/** Account-restriction / config error codes → trip the circuit breaker (halt). */
const RESTRICTED_CODES = new Set([
  190, // invalid/expired access token
  10, // permission denied
  368, // temporarily blocked for policy violations
  131031, // account has been locked
  131045 // account not registered / signature error
])

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf'
}

function mimeOf(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

interface GraphError {
  message: string
  code: number
  error_subcode?: number
  type?: string
}

/** WhatsApp Cloud API client. Reads live credentials via `getCreds` each call. */
export class CloudApiAdapter implements CloudApiPort {
  constructor(private getCreds: () => CloudCreds) {}

  private creds(): CloudCreds {
    const c = this.getCreds()
    if (!c.waToken || !c.phoneNumberId) {
      throw new Error('Cloud API kimlik bilgileri eksik (token / phone number id)')
    }
    return c
  }

  private base(): string {
    const { graphVersion } = this.getCreds()
    return `https://graph.facebook.com/${graphVersion || 'v21.0'}`
  }

  private authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` }
  }

  async verifyConnection(): Promise<CloudVerifyResult> {
    let c: CloudCreds
    try {
      c = this.creds()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    try {
      const url = `${this.base()}/${c.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`
      const res = await fetch(url, { headers: this.authHeader(c.waToken) })
      const json = (await res.json()) as Record<string, unknown> & { error?: GraphError }
      if (!res.ok || json.error) {
        return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` }
      }
      return {
        ok: true,
        name: (json.verified_name as string) ?? undefined,
        phone: (json.display_phone_number as string) ?? undefined,
        quality: (json.quality_rating as string) ?? undefined
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async listTemplates(): Promise<WaTemplate[]> {
    const c = this.creds()
    if (!c.wabaId) throw new Error('WABA ID gerekli (şablonları çekmek için)')
    const url = `${this.base()}/${c.wabaId}/message_templates?limit=200&fields=name,language,status,category,components`
    const res = await fetch(url, { headers: this.authHeader(c.waToken) })
    const json = (await res.json()) as { data?: unknown[]; error?: GraphError }
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `HTTP ${res.status}`)
    }
    return (json.data ?? [])
      .map((t) => toTemplate(t as Record<string, unknown>))
      .filter((t): t is WaTemplate => t !== null && t.status === 'APPROVED')
  }

  async uploadMedia(filePath: string): Promise<{ id: string } | { error: string }> {
    try {
      const c = this.creds()
      const buf = readFileSync(filePath)
      const form = new FormData()
      form.append('messaging_product', 'whatsapp')
      form.append('type', mimeOf(filePath))
      form.append('file', new Blob([new Uint8Array(buf)], { type: mimeOf(filePath) }), basename(filePath))
      const res = await fetch(`${this.base()}/${c.phoneNumberId}/media`, {
        method: 'POST',
        headers: this.authHeader(c.waToken),
        body: form
      })
      const json = (await res.json()) as { id?: string; error?: GraphError }
      if (!res.ok || json.error || !json.id) {
        return { error: json.error?.message ?? `HTTP ${res.status}` }
      }
      return { id: json.id }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    let c: CloudCreds
    try {
      c = this.creds()
    } catch (e) {
      return { ok: false, banned: true, error: (e as Error).message }
    }

    const components: unknown[] = []
    if (input.headerMediaId) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { id: input.headerMediaId } }]
      })
    }
    if (input.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: input.bodyParams.map((text) => ({ type: 'text', text }))
      })
    }

    const body = {
      messaging_product: 'whatsapp',
      to: input.phone,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(components.length ? { components } : {})
      }
    }

    try {
      const res = await fetch(`${this.base()}/${c.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { ...this.authHeader(c.waToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = (await res.json()) as {
        messages?: { id: string }[]
        error?: GraphError
      }
      if (res.ok && json.messages?.[0]?.id) {
        return { ok: true, id: json.messages[0].id }
      }
      const err = json.error
      if (err && RESTRICTED_CODES.has(err.code)) {
        logger.error('cloud', `account restricted (code ${err.code}): ${err.message}`)
        return { ok: false, banned: true, error: err.message }
      }
      return { ok: false, error: err?.message ?? `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}

interface RawComponent {
  type?: string
  format?: string
  text?: string
}

function toTemplate(t: Record<string, unknown>): WaTemplate | null {
  const name = t.name as string
  if (!name) return null
  const components = (t.components as RawComponent[] | undefined) ?? []
  const body = components.find((c) => (c.type ?? '').toUpperCase() === 'BODY')
  const header = components.find((c) => (c.type ?? '').toUpperCase() === 'HEADER')
  const bodyText = body?.text ?? ''
  const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g)
  const headerFormat = (header?.format ?? 'NONE').toUpperCase() as WaHeaderFormat
  return {
    name,
    language: (t.language as string) ?? 'tr',
    status: ((t.status as string) ?? '').toUpperCase(),
    category: ((t.category as string) ?? '').toUpperCase(),
    bodyVarCount: matches ? matches.length : 0,
    headerFormat: ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) ? headerFormat : 'NONE',
    bodyText
  }
}
