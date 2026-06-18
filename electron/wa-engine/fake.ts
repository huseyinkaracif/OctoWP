import type { CloudVerifyResult, WaTemplate } from '../../shared/types'
import type { CloudApiPort, SendResult, SendTemplateInput } from './port'

/** In-memory CloudApiPort for tests. */
export class FakeCloudApi implements CloudApiPort {
  /** recorded outbound template sends */
  public sent: { phone: string; templateName: string; bodyParams: string[]; headerMediaId?: string; id?: string }[] = []
  /** recorded media uploads */
  public uploads: string[] = []
  /** phones that should fail to send (Meta-style error) */
  public failPhones = new Set<string>()
  /** when set, the Nth send (0-based >= banAfter) returns banned (account restricted) */
  public banAfter: number | null = null
  /** templates returned by listTemplates */
  public templates: WaTemplate[] = []
  public verifyResult: CloudVerifyResult = { ok: true, name: 'Test İşletme', phone: '900000000000' }

  private sendCount = 0
  private msgIdCounter = 0
  private mediaIdCounter = 0

  async verifyConnection(): Promise<CloudVerifyResult> {
    return this.verifyResult
  }

  async listTemplates(): Promise<WaTemplate[]> {
    return this.templates
  }

  async uploadMedia(filePath: string): Promise<{ id: string } | { error: string }> {
    this.uploads.push(filePath)
    return { id: `media-${++this.mediaIdCounter}` }
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    if (this.banAfter !== null && this.sendCount >= this.banAfter) {
      return { ok: false, banned: true, error: 'ACCOUNT_RESTRICTED' }
    }
    this.sendCount++
    if (this.failPhones.has(input.phone)) {
      return { ok: false, error: 'invalid recipient' }
    }
    const id = `fake-${++this.msgIdCounter}`
    this.sent.push({
      phone: input.phone,
      templateName: input.templateName,
      bodyParams: input.bodyParams,
      headerMediaId: input.headerMediaId,
      id
    })
    return { ok: true, id }
  }
}
