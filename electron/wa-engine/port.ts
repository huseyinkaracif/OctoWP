import type { CloudVerifyResult, WaTemplate } from '../../shared/types'

export interface SendResult {
  ok: boolean
  /** Cloud API message id of the sent message */
  id?: string
  error?: string
  /** true when Meta signalled an account restriction / invalid token — trips the circuit breaker */
  banned?: boolean
}

/** A single template body variable value (positional {{1}}, {{2}}, …). */
export interface SendTemplateInput {
  /** recipient phone, digits-only E.164 */
  phone: string
  templateName: string
  /** template language code, e.g. "tr" */
  language: string
  /** ordered values for the body {{n}} placeholders */
  bodyParams: string[]
  /** uploaded media id for an image header, when the template has one */
  headerMediaId?: string
}

/**
 * Abstraction over the WhatsApp Cloud API. Implemented by CloudApiAdapter
 * (real, over graph.facebook.com) and FakeCloudApi (tests). The campaign engine
 * depends only on this. Outbound-only: no inbound, presence, groups or contacts.
 */
export interface CloudApiPort {
  /** verify the configured token + phone number id against Meta */
  verifyConnection(): Promise<CloudVerifyResult>
  /** approved message templates for the configured WhatsApp Business Account */
  listTemplates(): Promise<WaTemplate[]>
  /** upload a local media file, returning a reusable media id */
  uploadMedia(filePath: string): Promise<{ id: string } | { error: string }>
  /** send an approved template message */
  sendTemplate(input: SendTemplateInput): Promise<SendResult>
}
