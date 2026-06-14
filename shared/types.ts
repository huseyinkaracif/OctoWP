// Shared DTOs between main and renderer. No runtime deps.

export type RiskPresetName = 'balanced' | 'conservative' | 'aggressive'

export interface ThrottleSettings {
  /** seconds between consecutive text messages (randomized in [min,max]) */
  msgDelayMin: number
  msgDelayMax: number
  /** seconds between media messages */
  mediaDelayMin: number
  mediaDelayMax: number
  /** take a batch pause after a randomized count in [batchEveryMin, batchEveryMax] */
  batchEveryMin: number
  batchEveryMax: number
  /** batch pause duration, seconds, randomized in [batchPauseMin, batchPauseMax] */
  batchPauseMin: number
  batchPauseMax: number
  /** warmup day-1 daily cap, ramps linearly to dailyCapMax over warmupDays */
  dailyCapStart: number
  dailyCapMax: number
  warmupDays: number
  /** active sending window, local hours [activeFrom, activeTo) on a 0-23 clock */
  activeFrom: number
  activeTo: number
}

export interface Settings extends ThrottleSettings {
  preset: RiskPresetName
  /** country code digits only, e.g. "90" */
  defaultCountryCode: string
  /** inbound replies matching one of these (case-insensitive) trigger opt-out */
  optOutKeywords: string[]
  theme: 'light' | 'dark'
  /** emit a "typing…" presence before each text send (human realism / anti-ban) */
  typingSimulation: boolean
}

export interface Contact {
  id: number
  /** E.164 digits only, no leading + (e.g. "905551234567") */
  phone: string
  name: string | null
  vars: Record<string, string>
  createdAt: string
  tags?: Tag[]
}

export interface ListDTO {
  id: number
  name: string
  count: number
  createdAt: string
}

export interface ColumnMapping {
  phone: string
  name?: string
  vars?: string[]
}

export interface ImportSkip {
  row: number
  reason: string
}

export interface ImportResult {
  total: number
  imported: number
  duplicates: number
  skipped: ImportSkip[]
  listId: number
}

export interface ImportPreview {
  columns: string[]
  sample: Record<string, string>[]
}

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'halted' | 'done'
export type AudienceFilter = 'all' | 'replied' | 'not_replied'
export type RecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'optout'

export interface CampaignStats {
  total: number
  pending: number
  sent: number
  failed: number
  skipped: number
  optout: number
  /** of sent: how many reached delivered/read/replied (cumulative funnel) */
  delivered: number
  read: number
  replied: number
}

export interface Campaign {
  id: number
  name: string
  messageTemplate: string
  mediaPath: string | null
  mediaType: MediaType | null
  status: CampaignStatus
  createdAt: string
  stats: CampaignStats
  contentType: CampaignContentType
  poll: PollContent | null
  vcard: VCardContent | null
  scheduledAt: number | null
}

export type MediaType = 'image' | 'document' | 'video'

export type CampaignContentType = 'message' | 'poll' | 'vcard'

export interface PollContent {
  question: string
  options: string[]
  selectable: number
}

export interface VCardContent {
  name: string
  phone: string
}

export interface CampaignRecipient {
  id: number
  campaignId: number
  contactId: number
  phone: string
  name: string | null
  status: RecipientStatus
  error: string | null
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  repliedAt: string | null
}

export interface CreateCampaignInput {
  name: string
  messageTemplate: string
  mediaPath?: string | null
  mediaType?: MediaType | null
  listId?: number | null
  tagId?: number | null
  audienceFilter?: AudienceFilter
  scheduledAt?: number | null
  contentType?: CampaignContentType
  poll?: PollContent | null
  vcard?: VCardContent | null
}

export interface Template {
  id: number
  name: string
  body: string
  mediaPath: string | null
  mediaType: MediaType | null
}

export interface Tag {
  id: number
  name: string
  color: string
  count: number
}

export type SequenceStepCondition = 'always' | 'if_no_reply'

export interface SequenceStep {
  id?: number
  ord: number
  body: string
  delayHours: number
  condition: SequenceStepCondition
}

export interface SequenceStats {
  total: number
  active: number
  done: number
  stopped: number
}

export interface Sequence {
  id: number
  name: string
  status: string
  createdAt: string
  steps: SequenceStep[]
  stats: SequenceStats
}

export interface SequenceInput {
  id?: number
  name: string
  steps: SequenceStep[]
}

export type AutoReplyKind = 'keyword' | 'greeting' | 'away'
export type MatchType = 'contains' | 'exact' | 'starts'

export interface AutoReplyRule {
  id: number
  kind: AutoReplyKind
  name: string
  keywords: string[]
  matchType: MatchType
  reply: string
  enabled: boolean
}

export interface ConversationSummary {
  phone: string
  name: string | null
  lastText: string
  lastTs: number
  count: number
}

export interface ConversationMessage {
  direction: 'in' | 'out'
  text: string
  ts: number
}

export interface CampaignProgress {
  campaignId: number
  status: CampaignStatus
  stats: CampaignStats
  lastPhone?: string
  lastStatus?: RecipientStatus
  nextDelaySec?: number
  note?: string
}

export type WAConnState = 'disconnected' | 'connecting' | 'qr' | 'connected'

export interface WAStatus {
  state: WAConnState
  phone: string | null
  name: string | null
  /** QR payload string when state === 'qr' */
  qr: string | null
  /** human-readable reason for the last disconnect/ban, if any */
  error?: string | null
}

export interface OptOutEntry {
  phone: string
  reason: string
  createdAt: string
}

export interface WAGroup {
  id: string
  subject: string
  size: number
}

export interface CampaignEstimate {
  recipients: number
  days: number
}

export interface DashboardStats {
  sentToday: number
  dailyCap: number
  contacts: number
  running: number
}

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  scope: string
  message: string
}

export interface FileFilter {
  name: string
  extensions: string[]
}

/** The API surface exposed to the renderer via contextBridge (window.octo). */
export interface OctoApi {
  wa: {
    getStatus(): Promise<WAStatus>
    connect(): Promise<void>
    disconnect(): Promise<void>
    onStatus(cb: (s: WAStatus) => void): () => void
  }
  contacts: {
    previewColumns(filePath: string): Promise<ImportPreview>
    import(filePath: string, mapping: ColumnMapping, listId: number): Promise<ImportResult>
    list(listId?: number): Promise<Contact[]>
    count(): Promise<number>
    add(listId: number, phone: string, name: string | null): Promise<{ ok: boolean; imported: number }>
    delete(id: number): Promise<void>
    /** pull WhatsApp address-book contacts into the "WhatsApp Kişileri" list */
    syncWhatsapp(): Promise<{ imported: number; total: number }>
    /** save an example xlsx template; returns the saved path ('' if cancelled) */
    downloadTemplate(): Promise<string>
    /** fired when WhatsApp contacts are auto-synced; payload = newly added count */
    onSynced(cb: (count: number) => void): () => void
  }
  lists: {
    create(name: string): Promise<ListDTO>
    all(): Promise<ListDTO[]>
    delete(id: number): Promise<void>
  }
  optout: {
    list(): Promise<OptOutEntry[]>
    add(phone: string): Promise<void>
    remove(phone: string): Promise<void>
  }
  campaigns: {
    create(input: CreateCampaignInput): Promise<Campaign>
    all(): Promise<Campaign[]>
    get(id: number): Promise<{ campaign: Campaign; recipients: CampaignRecipient[] }>
    start(id: number): Promise<void>
    pause(id: number): Promise<void>
    resume(id: number): Promise<void>
    estimate(listId: number): Promise<CampaignEstimate>
    /** re-queue failed recipients back to pending */
    retryFailed(id: number): Promise<number>
    /** export per-recipient results to an xlsx; returns saved path ('' if cancelled) */
    exportResults(id: number): Promise<string>
    onProgress(cb: (p: CampaignProgress) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    applyPreset(name: RiskPresetName): Promise<Settings>
  }
  stats: {
    dashboard(): Promise<DashboardStats>
  }
  logs: {
    list(search?: string): Promise<LogEntry[]>
    clear(): Promise<void>
  }
  inbox: {
    conversations(): Promise<ConversationSummary[]>
    conversation(phone: string): Promise<ConversationMessage[]>
    reply(phone: string, text: string): Promise<{ ok: boolean }>
    onMessage(cb: () => void): () => void
  }
  autoreply: {
    listRules(): Promise<AutoReplyRule[]>
    saveRule(rule: Partial<AutoReplyRule>): Promise<AutoReplyRule>
    deleteRule(id: number): Promise<void>
  }
  templates: {
    list(): Promise<Template[]>
    save(t: Partial<Template>): Promise<Template>
    delete(id: number): Promise<void>
  }
  tags: {
    list(): Promise<Tag[]>
    create(name: string, color?: string): Promise<Tag>
    delete(id: number): Promise<void>
    assign(contactId: number, tagId: number): Promise<void>
    unassign(contactId: number, tagId: number): Promise<void>
  }
  sequences: {
    list(): Promise<Sequence[]>
    get(id: number): Promise<Sequence | null>
    save(seq: SequenceInput): Promise<Sequence>
    delete(id: number): Promise<void>
    enroll(id: number, source: { listId?: number; tagId?: number }): Promise<number>
    onProgress(cb: () => void): () => void
  }
  groups: {
    list(): Promise<WAGroup[]>
    collect(groupIds: string[], listName: string): Promise<{ imported: number; total: number }>
  }
  backup: {
    export(password: string): Promise<string>
    import(filePath: string, password: string): Promise<void>
  }
  dialog: {
    openFile(filters?: FileFilter[]): Promise<string | null>
  }
}
