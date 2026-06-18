import type Database from 'better-sqlite3'
import type {
  Contact,
  ListDTO,
  Campaign,
  CampaignRecipient,
  CampaignStats,
  CampaignStatus,
  RecipientStatus,
  Settings,
  OptOutEntry,
  CreateCampaignInput,
  LogEntry,
  ConversationSummary,
  ConversationMessage,
  AutoReplyRule,
  Template,
  Tag,
  Sequence,
  SequenceStep,
  SequenceStats,
  SequenceInput,
  AudienceFilter,
  MediaType
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../lib/presets'

export interface NewContact {
  phone: string
  name: string | null
  vars: Record<string, string>
}

export interface EngineRecipient {
  id: number
  contactId: number
  phone: string
  name: string | null
  vars: Record<string, string>
}

const nowIso = () => new Date().toISOString()

export class Repos {
  constructor(private db: Database.Database) {}

  // ---- contacts ----
  getContactByPhone(phone: string): Contact | null {
    const r = this.db.prepare('SELECT * FROM contacts WHERE phone = ?').get(phone) as any
    return r ? this.rowToContact(r) : null
  }

  countContacts(): number {
    return (this.db.prepare('SELECT COUNT(*) n FROM contacts').get() as any).n
  }

  listContacts(listId?: number): Contact[] {
    const rows = listId
      ? this.db
          .prepare(
            `SELECT c.* FROM contacts c
             JOIN list_members m ON m.contact_id = c.id
             WHERE m.list_id = ? ORDER BY c.id`
          )
          .all(listId)
      : this.db.prepare('SELECT * FROM contacts ORDER BY id').all()
    const contacts = (rows as any[]).map((r) => this.rowToContact(r))
    this.attachTags(contacts)
    return contacts
  }

  private attachTags(contacts: Contact[]): void {
    if (contacts.length === 0) return
    const rows = this.db
      .prepare(
        'SELECT ct.contact_id cid, t.id, t.name, t.color FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id'
      )
      .all() as any[]
    const map = new Map<number, Tag[]>()
    for (const r of rows) {
      const arr = map.get(r.cid) ?? []
      arr.push({ id: r.id, name: r.name, color: r.color, count: 0 })
      map.set(r.cid, arr)
    }
    for (const c of contacts) c.tags = map.get(c.id) ?? []
  }

  /** Insert new contacts (ignoring duplicates by phone) and link them to the list. */
  bulkImportContacts(
    contacts: NewContact[],
    listId: number
  ): { imported: number; duplicates: number } {
    const insert = this.db.prepare(
      'INSERT INTO contacts (phone, name, vars, created_at) VALUES (?, ?, ?, ?)'
    )
    const byPhone = this.db.prepare('SELECT id FROM contacts WHERE phone = ?')
    const link = this.db.prepare(
      'INSERT OR IGNORE INTO list_members (list_id, contact_id) VALUES (?, ?)'
    )
    let imported = 0
    let duplicates = 0
    const tx = this.db.transaction((items: NewContact[]) => {
      for (const c of items) {
        const existing = byPhone.get(c.phone) as any
        let contactId: number
        if (existing) {
          contactId = existing.id
          duplicates++
        } else {
          const info = insert.run(c.phone, c.name, JSON.stringify(c.vars ?? {}), nowIso())
          contactId = Number(info.lastInsertRowid)
          imported++
        }
        link.run(listId, contactId)
      }
    })
    tx(contacts)
    return { imported, duplicates }
  }

  // ---- lists ----
  createList(name: string): ListDTO {
    const info = this.db
      .prepare('INSERT INTO lists (name, created_at) VALUES (?, ?)')
      .run(name, nowIso())
    return this.getList(Number(info.lastInsertRowid))!
  }

  getOrCreateList(name: string): ListDTO {
    const r = this.db.prepare('SELECT * FROM lists WHERE name = ?').get(name) as any
    if (r) return this.getList(r.id)!
    return this.createList(name)
  }

  getList(id: number): ListDTO | null {
    const r = this.db.prepare('SELECT * FROM lists WHERE id = ?').get(id) as any
    if (!r) return null
    const count = (
      this.db.prepare('SELECT COUNT(*) n FROM list_members WHERE list_id = ?').get(id) as any
    ).n
    return { id: r.id, name: r.name, count, createdAt: r.created_at }
  }

  deleteList(id: number): void {
    this.db.prepare('DELETE FROM list_members WHERE list_id = ?').run(id)
    this.db.prepare('DELETE FROM lists WHERE id = ?').run(id)
    // purge contacts that are now in no list (so deleting a list also clears its numbers)
    this.db.prepare('DELETE FROM contacts WHERE id NOT IN (SELECT contact_id FROM list_members)').run()
  }

  deleteContact(id: number): void {
    // FK cascade removes list memberships + tags
    this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
  }

  allLists(): ListDTO[] {
    const rows = this.db.prepare('SELECT * FROM lists ORDER BY id DESC').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      count: (
        this.db.prepare('SELECT COUNT(*) n FROM list_members WHERE list_id = ?').get(r.id) as any
      ).n,
      createdAt: r.created_at
    }))
  }

  // ---- opt-outs ----
  addOptOut(phone: string, reason: string): void {
    this.db
      .prepare(
        'INSERT INTO opt_outs (phone, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(phone) DO NOTHING'
      )
      .run(phone, reason, nowIso())
  }

  removeOptOut(phone: string): void {
    this.db.prepare('DELETE FROM opt_outs WHERE phone = ?').run(phone)
  }

  isOptedOut(phone: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM opt_outs WHERE phone = ?').get(phone)
  }

  listOptOuts(): OptOutEntry[] {
    const rows = this.db.prepare('SELECT * FROM opt_outs ORDER BY created_at DESC').all() as any[]
    return rows.map((r) => ({ phone: r.phone, reason: r.reason, createdAt: r.created_at }))
  }

  // ---- settings & meta ----
  getRaw(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return r ? r.value : null
  }

  setRaw(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  getSettings(): Settings {
    const raw = this.getRaw('settings')
    if (!raw) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(s: Settings): void {
    this.setRaw('settings', JSON.stringify(s))
  }

  getAccountFirstUsed(): Date | null {
    const raw = this.getRaw('accountFirstUsedAt')
    return raw ? new Date(raw) : null
  }

  setAccountFirstUsed(date: Date): void {
    this.setRaw('accountFirstUsedAt', date.toISOString())
  }

  // ---- campaigns ----
  createCampaign(input: CreateCampaignInput): Campaign {
    const tx = this.db.transaction((): number => {
      const status = input.scheduledAt ? 'scheduled' : 'draft'
      const info = this.db
        .prepare(
          `INSERT INTO campaigns (name, message_template, media_path, media_type, settings_snapshot, status, created_at,
             content_type, poll_question, poll_options, poll_selectable, vcard_name, vcard_phone, scheduled_at,
             template_name, template_lang, variable_mapping)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.messageTemplate ?? '',
          input.mediaPath ?? null,
          input.mediaType ?? null,
          JSON.stringify(this.getSettings()),
          status,
          nowIso(),
          input.contentType ?? 'message',
          input.poll?.question ?? null,
          input.poll ? JSON.stringify(input.poll.options) : null,
          input.poll?.selectable ?? null,
          input.vcard?.name ?? null,
          input.vcard?.phone ?? null,
          input.scheduledAt ?? null,
          input.templateName ?? null,
          input.templateLang ?? null,
          input.variableMapping ? JSON.stringify(input.variableMapping) : null
        )
      const campaignId = Number(info.lastInsertRowid)
      const contacts = this.resolveAudience(input)
      const insertRec = this.db.prepare(
        `INSERT INTO campaign_recipients (campaign_id, contact_id, phone, name, vars, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const c of contacts) {
        const status: RecipientStatus = this.isOptedOut(c.phone) ? 'optout' : 'pending'
        insertRec.run(campaignId, c.id, c.phone, c.name, JSON.stringify(c.vars), status)
      }
      return campaignId
    })
    const id = tx()
    return this.getCampaign(id)!
  }

  getCampaign(id: number): Campaign | null {
    const r = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any
    return r ? this.rowToCampaign(r) : null
  }

  getCampaignSettings(id: number): Settings {
    const r = this.db.prepare('SELECT settings_snapshot FROM campaigns WHERE id = ?').get(id) as any
    if (!r?.settings_snapshot) return this.getSettings()
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(r.settings_snapshot) }
    } catch {
      return this.getSettings()
    }
  }

  allCampaigns(): Campaign[] {
    const rows = this.db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all() as any[]
    return rows.map((r) => this.rowToCampaign(r))
  }

  setCampaignStatus(id: number, status: CampaignStatus): void {
    this.db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, id)
  }

  /** Delete a campaign and its recipients (FK cascade); send_log history is kept. */
  deleteCampaign(id: number): void {
    this.db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
  }

  campaignsByStatus(status: CampaignStatus): Campaign[] {
    const rows = this.db.prepare('SELECT * FROM campaigns WHERE status = ?').all(status) as any[]
    return rows.map((r) => this.rowToCampaign(r))
  }

  getRecipients(campaignId: number): CampaignRecipient[] {
    const rows = this.db
      .prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY id')
      .all(campaignId) as any[]
    return rows.map((r) => this.rowToRecipient(r))
  }

  pendingRecipients(campaignId: number): EngineRecipient[] {
    const rows = this.db
      .prepare(
        "SELECT id, contact_id, phone, name, vars FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY id"
      )
      .all(campaignId) as any[]
    return rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      phone: r.phone,
      name: r.name,
      vars: this.parseVars(r.vars)
    }))
  }

  updateRecipientStatus(
    id: number,
    status: RecipientStatus,
    error: string | null,
    sentAt: string | null
  ): void {
    this.db
      .prepare('UPDATE campaign_recipients SET status = ?, error = ?, sent_at = ? WHERE id = ?')
      .run(status, error, sentAt, id)
  }

  campaignStats(campaignId: number): CampaignStats {
    const rows = this.db
      .prepare(
        'SELECT status, COUNT(*) n FROM campaign_recipients WHERE campaign_id = ? GROUP BY status'
      )
      .all(campaignId) as any[]
    const stats: CampaignStats = {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      optout: 0,
      delivered: 0,
      read: 0,
      replied: 0
    }
    for (const r of rows) {
      stats[r.status as RecipientStatus] = r.n
      stats.total += r.n
    }
    const f = this.db
      .prepare(
        `SELECT
           SUM(delivered_at IS NOT NULL) d,
           SUM(read_at IS NOT NULL) r,
           SUM(replied_at IS NOT NULL) rep
         FROM campaign_recipients WHERE campaign_id = ?`
      )
      .get(campaignId) as any
    stats.delivered = f?.d ?? 0
    stats.read = f?.r ?? 0
    stats.replied = f?.rep ?? 0
    return stats
  }

  setRecipientWaMsgId(recipientId: number, waMsgId: string): void {
    this.db
      .prepare('UPDATE campaign_recipients SET wa_msg_id = ? WHERE id = ?')
      .run(waMsgId, recipientId)
  }

  /** mark a sent message delivered by its WA message id; returns its campaign id or null */
  markDelivered(waMsgId: string, whenIso: string): number | null {
    const r = this.db
      .prepare('SELECT id, campaign_id, delivered_at FROM campaign_recipients WHERE wa_msg_id = ?')
      .get(waMsgId) as any
    if (!r) return null
    if (!r.delivered_at) {
      this.db.prepare('UPDATE campaign_recipients SET delivered_at = ? WHERE id = ?').run(whenIso, r.id)
    }
    return r.campaign_id
  }

  markRead(waMsgId: string, whenIso: string): number | null {
    const r = this.db
      .prepare('SELECT id, campaign_id, delivered_at, read_at FROM campaign_recipients WHERE wa_msg_id = ?')
      .get(waMsgId) as any
    if (!r) return null
    if (!r.read_at) {
      this.db
        .prepare(
          'UPDATE campaign_recipients SET read_at = ?, delivered_at = COALESCE(delivered_at, ?) WHERE id = ?'
        )
        .run(whenIso, whenIso, r.id)
    }
    return r.campaign_id
  }

  /** record an inbound reply; updates contact + campaign recipients; returns affected campaign ids */
  recordInbound(phone: string, text: string, ts: number): number[] {
    const iso = new Date(ts).toISOString()
    const c = this.db.prepare('SELECT id FROM contacts WHERE phone = ?').get(phone) as any
    const contactId = c?.id ?? null
    this.db
      .prepare('INSERT INTO inbound_messages (phone, text, ts, contact_id) VALUES (?, ?, ?, ?)')
      .run(phone, text, ts, contactId)
    if (contactId) {
      this.db.prepare('UPDATE contacts SET replied_at = ? WHERE id = ?').run(iso, contactId)
    }
    const affected = this.db
      .prepare(
        "SELECT DISTINCT campaign_id FROM campaign_recipients WHERE phone = ? AND wa_msg_id IS NOT NULL AND replied_at IS NULL"
      )
      .all(phone) as any[]
    this.db
      .prepare(
        'UPDATE campaign_recipients SET replied_at = ? WHERE phone = ? AND wa_msg_id IS NOT NULL AND replied_at IS NULL'
      )
      .run(iso, phone)
    return affected.map((a) => a.campaign_id)
  }

  // ---- inbox / conversations ----
  inboundCount(phone: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) n FROM inbound_messages WHERE phone = ? AND direction = 'in'")
        .get(phone) as any
    ).n
  }

  recordOutbound(phone: string, text: string, ts: number): void {
    const c = this.db.prepare('SELECT id FROM contacts WHERE phone = ?').get(phone) as any
    this.db
      .prepare(
        "INSERT INTO inbound_messages (phone, text, ts, contact_id, direction) VALUES (?, ?, ?, ?, 'out')"
      )
      .run(phone, text, ts, c?.id ?? null)
  }

  listConversations(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        `SELECT phone, COUNT(*) count, MAX(ts) lastTs FROM inbound_messages GROUP BY phone ORDER BY lastTs DESC`
      )
      .all() as any[]
    return rows.map((r) => {
      const name = (this.db.prepare('SELECT name FROM contacts WHERE phone = ?').get(r.phone) as any)?.name ?? null
      const last = this.db
        .prepare('SELECT text FROM inbound_messages WHERE phone = ? ORDER BY ts DESC, id DESC LIMIT 1')
        .get(r.phone) as any
      return { phone: r.phone, name, lastText: last?.text ?? '', lastTs: r.lastTs, count: r.count }
    })
  }

  getConversation(phone: string): ConversationMessage[] {
    const rows = this.db
      .prepare('SELECT direction, text, ts FROM inbound_messages WHERE phone = ? ORDER BY ts ASC, id ASC')
      .all(phone) as any[]
    return rows.map((r) => ({ direction: (r.direction ?? 'in') as 'in' | 'out', text: r.text, ts: r.ts }))
  }

  // ---- auto-reply ----
  private rowToRule(r: any): AutoReplyRule {
    let keywords: string[] = []
    try {
      keywords = JSON.parse(r.keywords || '[]')
    } catch {
      keywords = []
    }
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      keywords,
      matchType: r.match_type,
      reply: r.reply,
      enabled: !!r.enabled
    }
  }

  listAutoReplyRules(): AutoReplyRule[] {
    const rows = this.db.prepare('SELECT * FROM autoreply_rules ORDER BY id').all() as any[]
    return rows.map((r) => this.rowToRule(r))
  }

  saveAutoReplyRule(rule: Partial<AutoReplyRule>): AutoReplyRule {
    const keywords = JSON.stringify(rule.keywords ?? [])
    if (rule.id) {
      this.db
        .prepare(
          'UPDATE autoreply_rules SET kind=?, name=?, keywords=?, match_type=?, reply=?, enabled=? WHERE id=?'
        )
        .run(
          rule.kind ?? 'keyword',
          rule.name ?? '',
          keywords,
          rule.matchType ?? 'contains',
          rule.reply ?? '',
          rule.enabled ? 1 : 0,
          rule.id
        )
      return this.rowToRule(this.db.prepare('SELECT * FROM autoreply_rules WHERE id=?').get(rule.id))
    }
    const info = this.db
      .prepare(
        'INSERT INTO autoreply_rules (kind, name, keywords, match_type, reply, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        rule.kind ?? 'keyword',
        rule.name ?? '',
        keywords,
        rule.matchType ?? 'contains',
        rule.reply ?? '',
        rule.enabled === false ? 0 : 1,
        nowIso()
      )
    return this.rowToRule(
      this.db.prepare('SELECT * FROM autoreply_rules WHERE id=?').get(Number(info.lastInsertRowid))
    )
  }

  deleteAutoReplyRule(id: number): void {
    this.db.prepare('DELETE FROM autoreply_rules WHERE id = ?').run(id)
  }

  getLastAutoReply(phone: string): number | null {
    const r = this.db.prepare('SELECT last_reply_ts FROM autoreply_state WHERE phone = ?').get(phone) as any
    return r ? r.last_reply_ts : null
  }

  setLastAutoReply(phone: string, ts: number): void {
    this.db
      .prepare(
        'INSERT INTO autoreply_state (phone, last_reply_ts) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET last_reply_ts = excluded.last_reply_ts'
      )
      .run(phone, ts)
  }

  /** re-queue failed recipients to pending; returns how many were reset */
  retryFailed(campaignId: number): number {
    const info = this.db
      .prepare(
        `UPDATE campaign_recipients
         SET status = 'pending', error = NULL, sent_at = NULL, wa_msg_id = NULL,
             delivered_at = NULL, read_at = NULL
         WHERE campaign_id = ? AND status = 'failed'`
      )
      .run(campaignId)
    return info.changes
  }

  // ---- audience (list / tag / reply filter) ----
  resolveAudience(input: {
    listId?: number | null
    tagId?: number | null
    audienceFilter?: AudienceFilter
  }): Contact[] {
    const base = input.tagId
      ? this.contactsForTag(input.tagId)
      : input.listId
        ? this.listContacts(input.listId)
        : []
    const f = input.audienceFilter ?? 'all'
    if (f === 'all') return base
    const replied = new Set<number>(
      (this.db.prepare('SELECT id FROM contacts WHERE replied_at IS NOT NULL').all() as any[]).map(
        (r) => r.id
      )
    )
    return base.filter((c) => (f === 'replied' ? replied.has(c.id) : !replied.has(c.id)))
  }

  hasInboundSince(phone: string, sinceTs: number): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM inbound_messages WHERE phone = ? AND direction = 'in' AND ts >= ? LIMIT 1")
      .get(phone, sinceTs)
  }

  // ---- templates ----
  private rowToTemplate(r: any): Template {
    return { id: r.id, name: r.name, body: r.body, mediaPath: r.media_path, mediaType: r.media_type as MediaType | null }
  }
  listTemplates(): Template[] {
    return (this.db.prepare('SELECT * FROM templates ORDER BY id DESC').all() as any[]).map((r) =>
      this.rowToTemplate(r)
    )
  }
  saveTemplate(t: Partial<Template>): Template {
    if (t.id) {
      this.db
        .prepare('UPDATE templates SET name=?, body=?, media_path=?, media_type=? WHERE id=?')
        .run(t.name ?? '', t.body ?? '', t.mediaPath ?? null, t.mediaType ?? null, t.id)
      return this.rowToTemplate(this.db.prepare('SELECT * FROM templates WHERE id=?').get(t.id))
    }
    const info = this.db
      .prepare('INSERT INTO templates (name, body, media_path, media_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(t.name ?? 'Şablon', t.body ?? '', t.mediaPath ?? null, t.mediaType ?? null, nowIso())
    return this.rowToTemplate(this.db.prepare('SELECT * FROM templates WHERE id=?').get(Number(info.lastInsertRowid)))
  }
  deleteTemplate(id: number): void {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  }

  // ---- tags ----
  listTags(): Tag[] {
    const rows = this.db.prepare('SELECT * FROM tags ORDER BY name').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      count: (this.db.prepare('SELECT COUNT(*) n FROM contact_tags WHERE tag_id = ?').get(r.id) as any).n
    }))
  }
  createTag(name: string, color = 'slate'): Tag {
    const info = this.db
      .prepare('INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)')
      .run(name, color, nowIso())
    return { id: Number(info.lastInsertRowid), name, color, count: 0 }
  }
  deleteTag(id: number): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  }
  assignTag(contactId: number, tagId: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO contact_tags (tag_id, contact_id) VALUES (?, ?)')
      .run(tagId, contactId)
  }
  unassignTag(contactId: number, tagId: number): void {
    this.db.prepare('DELETE FROM contact_tags WHERE tag_id = ? AND contact_id = ?').run(tagId, contactId)
  }
  contactsForTag(tagId: number): Contact[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM contacts c JOIN contact_tags ct ON ct.contact_id = c.id WHERE ct.tag_id = ? ORDER BY c.id`
      )
      .all(tagId) as any[]
    return rows.map((r) => this.rowToContact(r))
  }

  // ---- sequences ----
  private stepRows(seqId: number): SequenceStep[] {
    return (
      this.db.prepare('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY ord').all(seqId) as any[]
    ).map((r) => ({ id: r.id, ord: r.ord, body: r.body, delayHours: r.delay_hours, condition: r.condition }))
  }
  sequenceStats(seqId: number): SequenceStats {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) n FROM sequence_enrollments WHERE sequence_id = ? GROUP BY status')
      .all(seqId) as any[]
    const stats: SequenceStats = { total: 0, active: 0, done: 0, stopped: 0 }
    for (const r of rows) {
      stats.total += r.n
      if (r.status === 'active') stats.active = r.n
      else if (r.status === 'done') stats.done = r.n
      else stats.stopped += r.n
    }
    return stats
  }
  private rowToSequence(r: any): Sequence {
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: r.created_at,
      steps: this.stepRows(r.id),
      stats: this.sequenceStats(r.id)
    }
  }
  listSequences(): Sequence[] {
    return (this.db.prepare('SELECT * FROM sequences ORDER BY id DESC').all() as any[]).map((r) =>
      this.rowToSequence(r)
    )
  }
  getSequence(id: number): Sequence | null {
    const r = this.db.prepare('SELECT * FROM sequences WHERE id = ?').get(id) as any
    return r ? this.rowToSequence(r) : null
  }
  saveSequence(input: SequenceInput): Sequence {
    const tx = this.db.transaction((): number => {
      let seqId: number
      if (input.id) {
        this.db.prepare('UPDATE sequences SET name = ? WHERE id = ?').run(input.name, input.id)
        this.db.prepare('DELETE FROM sequence_steps WHERE sequence_id = ?').run(input.id)
        seqId = input.id
      } else {
        const info = this.db
          .prepare("INSERT INTO sequences (name, status, created_at) VALUES (?, 'active', ?)")
          .run(input.name, nowIso())
        seqId = Number(info.lastInsertRowid)
      }
      const ins = this.db.prepare(
        'INSERT INTO sequence_steps (sequence_id, ord, body, delay_hours, condition) VALUES (?, ?, ?, ?, ?)'
      )
      input.steps.forEach((s, i) => ins.run(seqId, i, s.body, s.delayHours, s.condition))
      return seqId
    })
    return this.getSequence(tx())!
  }
  deleteSequence(id: number): void {
    this.db.prepare('DELETE FROM sequences WHERE id = ?').run(id)
  }
  enrollSequence(seqId: number, contacts: { id: number; phone: string; name: string | null; vars: Record<string, string> }[], now: number): number {
    const steps = this.stepRows(seqId)
    if (steps.length === 0) return 0
    const firstDelayMs = Math.max(0, steps[0].delayHours) * 3_600_000
    const exists = this.db.prepare(
      "SELECT 1 FROM sequence_enrollments WHERE sequence_id = ? AND phone = ? AND status = 'active' LIMIT 1"
    )
    const ins = this.db.prepare(
      `INSERT INTO sequence_enrollments (sequence_id, contact_id, phone, name, vars, cur_step, status, next_run_at, enrolled_at)
       VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?)`
    )
    let n = 0
    const tx = this.db.transaction(() => {
      for (const c of contacts) {
        if (exists.get(seqId, c.phone)) continue
        ins.run(seqId, c.id, c.phone, c.name, JSON.stringify(c.vars ?? {}), now + firstDelayMs, now)
        n++
      }
    })
    tx()
    return n
  }
  dueEnrollments(now: number, limit = 50): {
    id: number
    sequenceId: number
    phone: string
    name: string | null
    vars: Record<string, string>
    curStep: number
    enrolledAt: number
  }[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM sequence_enrollments WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at LIMIT ?"
      )
      .all(now, limit) as any[]
    return rows.map((r) => ({
      id: r.id,
      sequenceId: r.sequence_id,
      phone: r.phone,
      name: r.name,
      vars: this.parseVars(r.vars),
      curStep: r.cur_step,
      enrolledAt: r.enrolled_at
    }))
  }
  getSequenceSteps(seqId: number): SequenceStep[] {
    return this.stepRows(seqId)
  }
  advanceEnrollment(id: number, nextStep: number, nextRunAt: number | null, lastSentAt: number): void {
    if (nextRunAt === null) {
      this.db
        .prepare("UPDATE sequence_enrollments SET cur_step = ?, status = 'done', last_sent_at = ? WHERE id = ?")
        .run(nextStep, lastSentAt, id)
    } else {
      this.db
        .prepare('UPDATE sequence_enrollments SET cur_step = ?, next_run_at = ?, last_sent_at = ? WHERE id = ?')
        .run(nextStep, nextRunAt, lastSentAt, id)
    }
  }
  stopEnrollment(id: number, status: 'done' | 'stopped_reply'): void {
    this.db.prepare('UPDATE sequence_enrollments SET status = ? WHERE id = ?').run(status, id)
  }

  // ---- scheduled campaigns ----
  dueScheduledCampaigns(now: number): number[] {
    return (
      this.db
        .prepare("SELECT id FROM campaigns WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?")
        .all(now) as any[]
    ).map((r) => r.id)
  }

  // ---- send log ----
  logSend(campaignId: number | null, phone: string, status: RecipientStatus, ts: number): void {
    this.db
      .prepare('INSERT INTO send_log (campaign_id, phone, status, ts) VALUES (?, ?, ?, ?)')
      .run(campaignId, phone, status, ts)
  }

  countSentToday(now: Date): number {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return (
      this.db
        .prepare("SELECT COUNT(*) n FROM send_log WHERE status = 'sent' AND ts >= ?")
        .get(startOfDay) as any
    ).n
  }

  // ---- logs ----
  addLog(e: LogEntry): void {
    this.db
      .prepare('INSERT INTO logs (ts, level, scope, message) VALUES (?, ?, ?, ?)')
      .run(e.ts, e.level, e.scope, e.message)
  }

  listLogs(search?: string, limit = 500): LogEntry[] {
    const rows = search
      ? this.db
          .prepare(
            'SELECT ts, level, scope, message FROM logs WHERE message LIKE ? OR scope LIKE ? ORDER BY ts DESC, id DESC LIMIT ?'
          )
          .all(`%${search}%`, `%${search}%`, limit)
      : this.db
          .prepare('SELECT ts, level, scope, message FROM logs ORDER BY ts DESC, id DESC LIMIT ?')
          .all(limit)
    return rows as LogEntry[]
  }

  clearLogs(): void {
    this.db.prepare('DELETE FROM logs').run()
  }

  pruneLogs(keep = 10000): void {
    this.db.prepare('DELETE FROM logs WHERE id <= (SELECT MAX(id) FROM logs) - ?').run(keep)
  }

  // ---- row mappers ----
  private parseVars(v: string): Record<string, string> {
    try {
      return JSON.parse(v || '{}')
    } catch {
      return {}
    }
  }

  private rowToContact(r: any): Contact {
    return { id: r.id, phone: r.phone, name: r.name, vars: this.parseVars(r.vars), createdAt: r.created_at }
  }

  private rowToCampaign(r: any): Campaign {
    let pollOptions: string[] = []
    try {
      pollOptions = JSON.parse(r.poll_options || '[]')
    } catch {
      pollOptions = []
    }
    return {
      id: r.id,
      name: r.name,
      messageTemplate: r.message_template,
      mediaPath: r.media_path,
      mediaType: r.media_type,
      status: r.status,
      createdAt: r.created_at,
      stats: this.campaignStats(r.id),
      contentType: r.content_type ?? 'message',
      poll: r.poll_question
        ? { question: r.poll_question, options: pollOptions, selectable: r.poll_selectable ?? 1 }
        : null,
      vcard: r.vcard_name ? { name: r.vcard_name, phone: r.vcard_phone } : null,
      scheduledAt: r.scheduled_at ?? null,
      templateName: r.template_name ?? null,
      templateLang: r.template_lang ?? null,
      variableMapping: this.parseVarMapping(r.variable_mapping)
    }
  }

  private parseVarMapping(v: string | null): Campaign['variableMapping'] {
    if (!v) return []
    try {
      const arr = JSON.parse(v)
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  private rowToRecipient(r: any): CampaignRecipient {
    return {
      id: r.id,
      campaignId: r.campaign_id,
      contactId: r.contact_id,
      phone: r.phone,
      name: r.name,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at ?? null,
      readAt: r.read_at ?? null,
      repliedAt: r.replied_at ?? null
    }
  }
}
