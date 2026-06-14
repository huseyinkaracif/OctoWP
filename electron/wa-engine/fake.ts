import type { WAStatus, MediaType } from '../../shared/types'
import type {
  WhatsAppPort,
  SendResult,
  IncomingMessage,
  WAContact,
  WAGroupInfo,
  MessageAck,
  PresenceState
} from './port'

/** In-memory WhatsAppPort for tests. */
export class FakeWhatsApp implements WhatsAppPort {
  private status: WAStatus = { state: 'disconnected', phone: null, name: null, qr: null }
  private statusCbs: ((s: WAStatus) => void)[] = []
  private incomingCbs: ((m: IncomingMessage) => void)[] = []
  private contactCbs: ((c: WAContact[]) => void)[] = []
  private ackCbs: ((a: MessageAck) => void)[] = []
  private msgIdCounter = 0
  /** presence updates recorded for assertions */
  public presences: { phone: string; state: PresenceState }[] = []

  /** recorded outbound messages */
  public sent: { phone: string; text: string; media?: string; id?: string }[] = []
  /** phone -> exists; missing phones default to true */
  public existsMap = new Map<string, boolean>()
  /** when set, the Nth send (0-based >= banAfter) returns banned */
  public banAfter: number | null = null
  private sendCount = 0

  setExists(phone: string, value: boolean): void {
    this.existsMap.set(phone, value)
  }

  private setStatus(s: WAStatus): void {
    this.status = s
    for (const cb of this.statusCbs) cb(s)
  }

  async connect(): Promise<void> {
    this.setStatus({ state: 'connected', phone: '900000000000', name: 'Test', qr: null })
  }

  async disconnect(): Promise<void> {
    this.setStatus({ state: 'disconnected', phone: null, name: null, qr: null })
  }

  getStatus(): WAStatus {
    return this.status
  }

  onStatus(cb: (s: WAStatus) => void): () => void {
    this.statusCbs.push(cb)
    return () => {
      this.statusCbs = this.statusCbs.filter((c) => c !== cb)
    }
  }

  onIncoming(cb: (m: IncomingMessage) => void): () => void {
    this.incomingCbs.push(cb)
    return () => {
      this.incomingCbs = this.incomingCbs.filter((c) => c !== cb)
    }
  }

  onContacts(cb: (c: WAContact[]) => void): () => void {
    this.contactCbs.push(cb)
    return () => {
      this.contactCbs = this.contactCbs.filter((c) => c !== cb)
    }
  }

  /** test helper to simulate an inbound reply */
  emitIncoming(m: IncomingMessage): void {
    for (const cb of this.incomingCbs) cb(m)
  }

  /** session contacts store (test-settable) */
  public contacts: WAContact[] = []

  getContacts(): WAContact[] {
    return this.contacts
  }

  async resyncContacts(): Promise<void> {
    /* no-op for tests */
  }

  /** test helper to simulate contact sync */
  emitContacts(c: WAContact[]): void {
    for (const cb of this.contactCbs) cb(c)
  }

  async exists(phone: string): Promise<boolean> {
    return this.existsMap.has(phone) ? this.existsMap.get(phone)! : true
  }

  /** test-overridable group fixtures */
  public groups: WAGroupInfo[] = []
  public groupMembers = new Map<string, WAContact[]>()

  async listGroups(): Promise<WAGroupInfo[]> {
    return this.groups
  }

  async groupParticipants(groupId: string): Promise<WAContact[]> {
    return this.groupMembers.get(groupId) ?? []
  }

  async sendText(phone: string, text: string): Promise<SendResult> {
    if (this.banAfter !== null && this.sendCount >= this.banAfter) {
      return { ok: false, banned: true, error: 'BANNED' }
    }
    this.sendCount++
    const id = `fake-${++this.msgIdCounter}`
    this.sent.push({ phone, text, id })
    return { ok: true, id }
  }

  async sendMedia(
    phone: string,
    filePath: string,
    _type: MediaType,
    caption?: string
  ): Promise<SendResult> {
    if (this.banAfter !== null && this.sendCount >= this.banAfter) {
      return { ok: false, banned: true, error: 'BANNED' }
    }
    this.sendCount++
    const id = `fake-${++this.msgIdCounter}`
    this.sent.push({ phone, text: caption ?? '', media: filePath, id })
    return { ok: true, id }
  }

  async sendPresence(phone: string, state: PresenceState): Promise<void> {
    this.presences.push({ phone, state })
  }

  async sendPoll(phone: string, question: string, _options: string[], _selectable: number): Promise<SendResult> {
    if (this.banAfter !== null && this.sendCount >= this.banAfter) {
      return { ok: false, banned: true, error: 'BANNED' }
    }
    this.sendCount++
    const id = `fake-${++this.msgIdCounter}`
    this.sent.push({ phone, text: `poll:${question}`, id })
    return { ok: true, id }
  }

  async sendVCard(phone: string, name: string, _cardPhone: string): Promise<SendResult> {
    if (this.banAfter !== null && this.sendCount >= this.banAfter) {
      return { ok: false, banned: true, error: 'BANNED' }
    }
    this.sendCount++
    const id = `fake-${++this.msgIdCounter}`
    this.sent.push({ phone, text: `vcard:${name}`, id })
    return { ok: true, id }
  }

  onAck(cb: (a: MessageAck) => void): () => void {
    this.ackCbs.push(cb)
    return () => {
      this.ackCbs = this.ackCbs.filter((c) => c !== cb)
    }
  }

  /** test helper to simulate a delivery/read receipt */
  emitAck(a: MessageAck): void {
    for (const cb of this.ackCbs) cb(a)
  }
}
