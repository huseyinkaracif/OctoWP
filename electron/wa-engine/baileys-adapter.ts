import { basename } from 'node:path'
import { rmSync } from 'node:fs'
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
import { phoneToJid } from '../lib/phone'
import { logger } from '../logging/logger'

const silentLogger: any = {
  level: 'silent',
  child: () => silentLogger,
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {}
}

function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0]
}

/**
 * Real WhatsApp connection via Baileys. Loaded with a dynamic import because
 * Baileys is an ESM-only package. Not unit tested — verified manually (QR link
 * + small send). The campaign engine never touches this directly; it depends on
 * WhatsAppPort.
 */
export class BaileysAdapter implements WhatsAppPort {
  private sock: any = null
  private status: WAStatus = { state: 'disconnected', phone: null, name: null, qr: null }
  private statusCbs: ((s: WAStatus) => void)[] = []
  private incomingCbs: ((m: IncomingMessage) => void)[] = []
  private contactCbs: ((c: WAContact[]) => void)[] = []
  private ackCbs: ((a: MessageAck) => void)[] = []
  private contactStore = new Map<string, WAContact>()
  /** lid user-part -> contact name (so resolved numbers keep their names) */
  private lidStore = new Map<string, string | null>()
  private groupCache: Record<string, any> = {}
  private bannedFlag = false
  private shouldReconnect = true
  private reconnectAttempts = 0
  private relinkPending = false

  constructor(private authDir: string) {}

  /** delete the saved session + in-memory caches so the next connect starts fresh (new QR) */
  private wipeSession(): void {
    try {
      rmSync(this.authDir, { recursive: true, force: true })
    } catch (e) {
      logger.error('wa', 'wipeSession failed:', e)
    }
    this.contactStore.clear()
    this.lidStore.clear()
    this.groupCache = {}
    this.log('session wiped (fresh QR on next connect)')
  }

  private log(...args: unknown[]): void {
    logger.info('wa', ...args)
  }

  private setStatus(s: WAStatus): void {
    this.status = s
    for (const cb of this.statusCbs) cb(s)
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

  onAck(cb: (a: MessageAck) => void): () => void {
    this.ackCbs.push(cb)
    return () => {
      this.ackCbs = this.ackCbs.filter((c) => c !== cb)
    }
  }

  async sendPresence(phone: string, state: PresenceState): Promise<void> {
    try {
      await this.sock?.sendPresenceUpdate(state, phoneToJid(phone))
    } catch {
      /* presence is best-effort */
    }
  }

  async sendPoll(
    phone: string,
    question: string,
    options: string[],
    selectable: number
  ): Promise<SendResult> {
    return this.send(phone, {
      poll: { name: question, values: options, selectableCount: Math.max(1, selectable) }
    })
  }

  async sendVCard(phone: string, name: string, cardPhone: string): Promise<SendResult> {
    const vcard =
      'BEGIN:VCARD\nVERSION:3.0\n' +
      `FN:${name}\n` +
      `TEL;type=CELL;type=VOICE;waid=${cardPhone}:+${cardPhone}\n` +
      'END:VCARD'
    return this.send(phone, { contacts: { displayName: name, contacts: [{ vcard }] } })
  }

  private handleContacts(arr: any[], source = ''): void {
    const out: WAContact[] = []
    let lid = 0
    let unnamed = 0
    for (const c of arr ?? []) {
      const jid: string = c?.id ?? c?.jid ?? ''
      // ONLY address-book contacts = ones with a SAVED name (c.name / verifiedName).
      // Skip jids that only have a pushname (notify) — those are group members / chat
      // partners you never saved, which is what bloated the list to thousands.
      const saved: string | null = c?.name || c?.verifiedName || null

      if (jid.endsWith('@s.whatsapp.net')) {
        const phone = jidToPhone(jid)
        if (!/^\d{8,15}$/.test(phone)) continue
        const prev = this.contactStore.get(phone)
        if (!saved && !prev) {
          unnamed++
          continue
        }
        const merged: WAContact = { phone, name: saved || prev?.name || null }
        this.contactStore.set(phone, merged)
        out.push(merged)
      } else if (jid.endsWith('@lid')) {
        if (!saved) {
          unnamed++
          continue
        }
        const pn: string = c?.phoneNumber ?? c?.pn ?? ''
        if (typeof pn === 'string' && pn.endsWith('@s.whatsapp.net')) {
          const phone = jidToPhone(pn)
          if (/^\d{8,15}$/.test(phone)) {
            const prev = this.contactStore.get(phone)
            const merged: WAContact = { phone, name: saved || prev?.name || null }
            this.contactStore.set(phone, merged)
            out.push(merged)
            continue
          }
        }
        this.lidStore.set(jid.split('@')[0].split(':')[0], saved)
        lid++
      }
    }
    if (out.length || lid || unnamed) {
      logger.info(
        'wa',
        `contacts${source ? '/' + source : ''}: +${out.length} saved, ${lid} saved-lid, ${unnamed} skipped(unsaved) (store=${this.contactStore.size})`
      )
    }
    if (out.length) for (const cb of this.contactCbs) cb(out)
  }

  /** all contacts accumulated from sync events this session */
  getContacts(): WAContact[] {
    return [...this.contactStore.values()]
  }

  /** force a fresh app-state sync so the full contact list is delivered */
  async resyncContacts(): Promise<void> {
    if (!this.sock) return
    try {
      logger.info('wa', 'resyncing app-state for contacts…')
      await this.sock.resyncAppState(
        ['critical_unblock_low', 'regular_high', 'regular_low', 'regular'],
        false
      )
    } catch (e) {
      logger.error('wa', 'resyncAppState failed:', e)
    }
    // give the trickle of contact/lid events a moment to arrive before resolving
    await new Promise((r) => setTimeout(r, 2500))
    await this.resolveLids()
    logger.info('wa', `resync done (store=${this.contactStore.size}, lids=${this.lidStore.size})`)
  }

  private nameForPhone(phone: string): string | null {
    return this.contactStore.get(phone)?.name ?? null
  }

  /** resolve a batch of @lid jids to phone numbers via WhatsApp's local LID↔PN map */
  private async resolveLidJids(lidJids: string[]): Promise<{ lidUser: string; phone: string }[]> {
    if (!this.sock || lidJids.length === 0) return []
    const out: { lidUser: string; phone: string }[] = []
    try {
      const map = await this.sock.signalRepository?.lidMapping?.getPNsForLIDs?.([...new Set(lidJids)])
      if (Array.isArray(map)) {
        for (const m of map) {
          const pn: string = m?.pn ?? ''
          const lid: string = m?.lid ?? ''
          if (!pn.includes('@s.whatsapp.net')) continue
          const phone = jidToPhone(pn)
          if (!/^\d{8,15}$/.test(phone)) continue
          out.push({ lidUser: lid.split('@')[0].split(':')[0], phone })
        }
      }
    } catch (e) {
      logger.error('wa', 'resolveLidJids failed:', e)
    }
    return out
  }

  /** turn collected hidden (@lid) contacts into phone numbers, keeping their names */
  private async resolveLids(): Promise<number> {
    if (this.lidStore.size === 0) return 0
    const lidJids = [...this.lidStore.keys()].map((u) => `${u}@lid`)
    const resolvedList = await this.resolveLidJids(lidJids)
    let resolved = 0
    for (const { lidUser, phone } of resolvedList) {
      const name = this.lidStore.get(lidUser) ?? null
      const prev = this.contactStore.get(phone)
      this.contactStore.set(phone, { phone, name: name || prev?.name || null })
      if (!prev) resolved++
    }
    logger.info('wa', `resolveLids: ${lidJids.length} lids -> +${resolved} phones`)
    return resolved
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true
    this.log('connecting…')
    this.setStatus({ state: 'connecting', phone: null, name: null, qr: null, error: null })

    const baileys: any = await import('@whiskeysockets/baileys')
    const makeWASocket = baileys.default ?? baileys.makeWASocket
    const { useMultiFileAuthState, DisconnectReason } = baileys

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir)
    const sock = makeWASocket({
      auth: state,
      logger: silentLogger,
      browser: ['OctoWP', 'Chrome', '1.0.0'],
      syncFullHistory: true,
      markOnlineOnConnect: false
    })
    this.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u: any) => {
      const { connection, lastDisconnect, qr } = u
      if (qr) {
        this.log('QR received')
        this.setStatus({ state: 'qr', qr, phone: null, name: null, error: null })
      }

      if (connection === 'open') {
        this.bannedFlag = false
        this.reconnectAttempts = 0
        this.relinkPending = false
        const me = sock.user
        const credsMe = sock.authState?.creds?.me
        const displayName =
          (me?.name || me?.verifiedName || me?.notify || credsMe?.name || '').trim() || null
        this.log('connected as', me?.id, 'name=', displayName)
        this.setStatus({
          state: 'connected',
          phone: me?.id ? jidToPhone(me.id) : null,
          name: displayName,
          qr: null,
          error: null
        })
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        const loggedOut = code === DisconnectReason.loggedOut
        const forbidden = code === 403 || code === DisconnectReason.forbidden
        if (forbidden) this.bannedFlag = true
        const error = forbidden
          ? 'Numara engellenmiş olabilir (403). Kampanyaları durdur, numaranı kontrol et.'
          : loggedOut
            ? 'Oturum kapandı. Yeniden QR ile bağlan.'
            : `Bağlantı koptu (kod ${code ?? '?'}). Yeniden bağlanılıyor…`
        logger.warn('wa', `closed code=${code ?? '?'}`, forbidden ? '(forbidden/ban)' : loggedOut ? '(loggedOut)' : '')

        if (loggedOut) {
          // creds are invalid/logged out — wipe them so the next connect shows a FRESH QR
          this.wipeSession()
          if (this.shouldReconnect && !this.relinkPending) {
            this.relinkPending = true
            this.setStatus({ state: 'connecting', phone: null, name: null, qr: null, error: null })
            setTimeout(() => {
              if (this.shouldReconnect) this.connect().catch(() => {})
            }, 1200)
          } else {
            this.setStatus({ state: 'disconnected', phone: null, name: null, qr: null, error })
          }
          return
        }

        this.setStatus({ state: 'disconnected', phone: null, name: null, qr: null, error })
        if (this.shouldReconnect && !forbidden) {
          this.scheduleReconnect()
        }
      }
    })

    sock.ev.on('messages.upsert', (ev: any) => {
      if (ev.type !== 'notify') return
      for (const m of ev.messages ?? []) {
        if (m.key?.fromMe) continue
        const jid: string = m.key?.remoteJid ?? ''
        if (!jid.endsWith('@s.whatsapp.net')) continue
        const text: string =
          m.message?.conversation || m.message?.extendedTextMessage?.text || ''
        if (!text) continue
        const from = jidToPhone(jid)
        for (const cb of this.incomingCbs) cb({ from, text })
      }
    })

    sock.ev.on('messages.update', (updates: any[]) => {
      for (const u of updates ?? []) {
        const id: string | undefined = u?.key?.id
        const st = u?.update?.status
        if (!id || st == null) continue
        const n = typeof st === 'number' ? st : Number(st)
        if (Number.isNaN(n)) continue
        if (n >= 4) this.emitAck({ id, status: 'read' })
        else if (n === 3) this.emitAck({ id, status: 'delivered' })
      }
    })

    // ONLY the saved address book — NOT chats/groups (those pull random/group numbers)
    sock.ev.on('contacts.upsert', (arr: any[]) => this.handleContacts(arr, 'upsert'))
    sock.ev.on('contacts.update', (arr: any[]) => this.handleContacts(arr, 'update'))
    sock.ev.on('contacts.set', (arg: any) => this.handleContacts(arg?.contacts ?? arg, 'set'))
    sock.ev.on('messaging-history.set', (arg: any) => {
      logger.info(
        'wa',
        `history.set: contacts=${arg?.contacts?.length ?? 0} chats=${arg?.chats?.length ?? 0} isLatest=${arg?.isLatest}`
      )
      this.handleContacts(arg?.contacts ?? [], 'history')
    })
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = Math.min(30_000, 2_000 * this.reconnectAttempts)
    setTimeout(() => {
      if (this.shouldReconnect) this.connect().catch(() => {})
    }, delay)
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.relinkPending = false
    try {
      await this.sock?.logout()
    } catch {
      /* ignore */
    }
    this.sock = null
    this.wipeSession()
    this.setStatus({ state: 'disconnected', phone: null, name: null, qr: null, error: null })
  }

  async exists(phone: string): Promise<boolean> {
    if (!this.sock) return false
    try {
      const res = await this.sock.onWhatsApp(phone)
      return Array.isArray(res) && res.length > 0 && !!res[0]?.exists
    } catch {
      return false
    }
  }

  async listGroups(): Promise<WAGroupInfo[]> {
    if (!this.sock) return []
    try {
      const map = await this.sock.groupFetchAllParticipating()
      this.groupCache = map ?? {}
      const groups = Object.values(this.groupCache).map((g: any) => ({
        id: g.id,
        subject: g.subject || g.id,
        size: g.participants?.length ?? g.size ?? 0
      }))
      logger.info('wa', `listGroups: ${groups.length} groups`)
      return groups
    } catch (e) {
      logger.error('wa', 'listGroups failed:', e)
      return []
    }
  }

  async groupParticipants(groupId: string): Promise<WAContact[]> {
    if (!this.sock) return []
    let meta = this.groupCache[groupId]
    if (!meta?.participants) {
      try {
        meta = await this.sock.groupMetadata(groupId)
      } catch (e) {
        logger.error('wa', 'groupMetadata failed:', e)
        return []
      }
    }
    const parts: any[] = meta?.participants ?? []
    const phones = new Map<string, string | null>() // phone -> name
    const pendingLids: string[] = []
    for (const p of parts) {
      const jid: string = p?.id ?? p?.jid ?? ''
      if (jid.endsWith('@s.whatsapp.net')) {
        const phone = jidToPhone(jid)
        if (/^\d{8,15}$/.test(phone)) phones.set(phone, p?.name || this.nameForPhone(phone))
      } else if (jid.endsWith('@lid')) {
        const pn: string = p?.phoneNumber ?? ''
        if (typeof pn === 'string' && pn.endsWith('@s.whatsapp.net')) {
          const phone = jidToPhone(pn)
          if (/^\d{8,15}$/.test(phone)) phones.set(phone, p?.name || this.nameForPhone(phone))
        } else {
          pendingLids.push(jid)
        }
      }
    }
    // resolve hidden LID members via the local mapping
    const resolved = await this.resolveLidJids(pendingLids)
    for (const { phone } of resolved) {
      if (!phones.has(phone)) phones.set(phone, this.nameForPhone(phone))
    }
    const out: WAContact[] = [...phones.entries()].map(([phone, name]) => ({ phone, name }))
    logger.info(
      'wa',
      `group ${groupId}: ${parts.length} participants -> ${out.length} phones (${resolved.length} via LID-map)`
    )
    return out
  }

  async sendText(phone: string, text: string): Promise<SendResult> {
    return this.send(phone, { text })
  }

  async sendMedia(
    phone: string,
    filePath: string,
    type: MediaType,
    caption?: string
  ): Promise<SendResult> {
    let content: any
    if (type === 'image') content = { image: { url: filePath }, caption }
    else if (type === 'video') content = { video: { url: filePath }, caption }
    else content = { document: { url: filePath }, fileName: basename(filePath), caption }
    return this.send(phone, content)
  }

  private emitAck(a: MessageAck): void {
    for (const cb of this.ackCbs) cb(a)
  }

  private async send(phone: string, content: any): Promise<SendResult> {
    if (!this.sock || this.status.state !== 'connected') {
      return { ok: false, error: 'not_connected', banned: this.bannedFlag }
    }
    try {
      const sent = await this.sock.sendMessage(phoneToJid(phone), content)
      return { ok: true, id: sent?.key?.id }
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      const banned = this.bannedFlag || /forbidden|403|blocked|banned/i.test(msg)
      logger.error('wa', 'send failed:', msg, banned ? '(banned)' : '')
      return { ok: false, error: msg, banned }
    }
  }
}
