import type { WAStatus, MediaType } from '../../shared/types'

export interface SendResult {
  ok: boolean
  /** WhatsApp message id of the sent message (for ack tracking) */
  id?: string
  error?: string
  /** true when WhatsApp signalled a ban/forbidden — trips the circuit breaker */
  banned?: boolean
}

export interface MessageAck {
  id: string
  status: 'delivered' | 'read'
}

export type PresenceState = 'composing' | 'paused' | 'available' | 'unavailable'

export interface IncomingMessage {
  /** sender phone, digits-only E.164 */
  from: string
  text: string
}

export interface WAContact {
  /** digits-only E.164 */
  phone: string
  name: string | null
}

export interface WAGroupInfo {
  id: string
  subject: string
  size: number
}

/**
 * Abstraction over the WhatsApp connection. Implemented by BaileysAdapter
 * (real) and FakeWhatsApp (tests). The campaign engine depends only on this.
 */
export interface WhatsAppPort {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): WAStatus
  onStatus(cb: (s: WAStatus) => void): () => void
  onIncoming(cb: (m: IncomingMessage) => void): () => void
  /** delivery/read receipts for sent messages */
  onAck(cb: (ack: MessageAck) => void): () => void
  /** fired as WhatsApp syncs the address book after connect */
  onContacts(cb: (contacts: WAContact[]) => void): () => void
  /** all address-book contacts accumulated this session */
  getContacts(): WAContact[]
  /** force a fresh app-state sync to pull the full contact list */
  resyncContacts(): Promise<void>
  /** Is this phone registered on WhatsApp? */
  exists(phone: string): Promise<boolean>
  /** groups the linked account participates in */
  listGroups(): Promise<WAGroupInfo[]>
  /** member phone numbers of a group */
  groupParticipants(groupId: string): Promise<WAContact[]>
  sendText(phone: string, text: string): Promise<SendResult>
  sendMedia(phone: string, filePath: string, type: MediaType, caption?: string): Promise<SendResult>
  /** emit a presence update (typing simulation) */
  sendPresence(phone: string, state: PresenceState): Promise<void>
  sendPoll(phone: string, question: string, options: string[], selectable: number): Promise<SendResult>
  sendVCard(phone: string, name: string, cardPhone: string): Promise<SendResult>
}
