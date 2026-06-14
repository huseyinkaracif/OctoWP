import type { Campaign, CampaignProgress, RecipientStatus } from '../../shared/types'
import type { Repos } from '../db/repositories'
import type { WhatsAppPort } from '../wa-engine/port'
import { renderMessage } from '../lib/template'
import {
  pickDelaySec,
  isWithinActiveHours,
  dailyCap,
  batchThreshold,
  warmupDayIndex
} from '../lib/throttle'

export interface EngineDeps {
  repos: Repos
  wa: WhatsAppPort
  now?: () => Date
  rng?: () => number
  sleep?: (ms: number) => Promise<void>
  onProgress?: (p: CampaignProgress) => void
}

const RETRY_DELAY_MS = 5_000
const SAFETY_MAX_ITERS = 1_000_000

export function msUntilActiveWindow(now: Date, from: number, to: number): number {
  if (isWithinActiveHours(now, from, to)) return 0
  const next = new Date(now)
  next.setMinutes(0, 0, 0)
  let guard = 0
  do {
    next.setHours(next.getHours() + 1)
    guard++
  } while (!isWithinActiveHours(next, from, to) && guard < 48)
  return Math.max(0, next.getTime() - now.getTime())
}

export function msUntilNextMidnight(now: Date): number {
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return mid.getTime() - now.getTime()
}

interface Control {
  paused: boolean
}

export class CampaignEngine {
  private repos: Repos
  private wa: WhatsAppPort
  private now: () => Date
  private rng: () => number
  private sleep: (ms: number) => Promise<void>
  private onProgress: (p: CampaignProgress) => void
  private controls = new Map<number, Control>()

  constructor(deps: EngineDeps) {
    this.repos = deps.repos
    this.wa = deps.wa
    this.now = deps.now ?? (() => new Date())
    this.rng = deps.rng ?? Math.random
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.onProgress = deps.onProgress ?? (() => {})
  }

  isRunning(campaignId: number): boolean {
    const c = this.controls.get(campaignId)
    return !!c && !c.paused
  }

  pause(campaignId: number): void {
    const c = this.controls.get(campaignId)
    if (c) c.paused = true
  }

  start(campaignId: number): Promise<void> {
    return this.run(campaignId)
  }

  resume(campaignId: number): Promise<void> {
    const c = this.controls.get(campaignId)
    if (c) c.paused = false
    return this.run(campaignId)
  }

  private emit(campaignId: number, extra: Partial<CampaignProgress> = {}): void {
    const stats = this.repos.campaignStats(campaignId)
    const campaign = this.repos.getCampaign(campaignId)
    this.onProgress({
      campaignId,
      status: campaign?.status ?? 'running',
      stats,
      ...extra
    })
  }

  /**
   * Run a campaign until it is done, halted, or paused. Resumable and
   * idempotent: only `pending` recipients are processed; already-sent ones are
   * never re-sent.
   */
  async run(campaignId: number): Promise<void> {
    const control: Control = { paused: false }
    this.controls.set(campaignId, control)

    const campaign = this.repos.getCampaign(campaignId)
    if (!campaign) return
    const settings = this.repos.getCampaignSettings(campaignId)

    this.repos.setCampaignStatus(campaignId, 'running')
    this.emit(campaignId)

    let firstUsed = this.repos.getAccountFirstUsed()
    if (!firstUsed) {
      firstUsed = this.now()
      this.repos.setAccountFirstUsed(firstUsed)
    }

    let sentInBatch = 0
    let batchLimit = batchThreshold(settings.batchEveryMin, settings.batchEveryMax, this.rng)
    let iters = 0

    while (iters++ < SAFETY_MAX_ITERS) {
      if (control.paused) {
        this.repos.setCampaignStatus(campaignId, 'paused')
        this.emit(campaignId, { note: 'paused' })
        this.controls.delete(campaignId)
        return
      }

      const pending = this.repos.pendingRecipients(campaignId)
      if (pending.length === 0) {
        this.repos.setCampaignStatus(campaignId, 'done')
        this.emit(campaignId, { note: 'done' })
        this.controls.delete(campaignId)
        return
      }

      const nowD = this.now()

      // gate: active hours
      if (!isWithinActiveHours(nowD, settings.activeFrom, settings.activeTo)) {
        this.emit(campaignId, { note: 'active_hours' })
        await this.sleep(msUntilActiveWindow(nowD, settings.activeFrom, settings.activeTo))
        continue
      }

      // gate: daily cap (warmup aware)
      const cap = dailyCap(settings, warmupDayIndex(firstUsed, nowD))
      if (this.repos.countSentToday(nowD) >= cap) {
        this.emit(campaignId, { note: 'daily_cap' })
        await this.sleep(msUntilNextMidnight(nowD))
        continue
      }

      const r = pending[0]
      const isLast = pending.length === 1

      // opt-out re-check
      if (this.repos.isOptedOut(r.phone)) {
        this.repos.updateRecipientStatus(r.id, 'optout', null, null)
        this.emit(campaignId, { lastPhone: r.phone, lastStatus: 'optout' })
        continue
      }

      // validity check
      const onWa = await this.wa.exists(r.phone)
      if (!onWa) {
        this.markAndLog(campaignId, r.id, r.phone, 'skipped', 'not_on_whatsapp', nowD)
        this.emit(campaignId, { lastPhone: r.phone, lastStatus: 'skipped' })
        continue
      }

      const text = renderMessage(campaign.messageTemplate, r.vars, this.rng)
      const isMedia = !!campaign.mediaPath
      const isText = campaign.contentType === 'message' && !isMedia

      // typing simulation (human realism / anti-ban) — plain text only
      if (settings.typingSimulation && isText) {
        await this.wa.sendPresence(r.phone, 'composing')
        const typingMs =
          Math.min(3000, Math.max(700, text.length * 40)) * (0.7 + this.rng() * 0.6)
        await this.sleep(typingMs)
      }

      const result = await this.sendOnce(campaign, r.phone, text)

      if (result.banned) {
        this.repos.setCampaignStatus(campaignId, 'halted')
        this.emit(campaignId, { lastPhone: r.phone, note: 'banned' })
        this.controls.delete(campaignId)
        return
      }

      if (result.ok) {
        this.markAndLog(campaignId, r.id, r.phone, 'sent', null, this.now())
        if (result.id) this.repos.setRecipientWaMsgId(r.id, result.id)
      } else {
        // one retry
        await this.sleep(RETRY_DELAY_MS)
        const retry = await this.sendOnce(campaign, r.phone, text)
        if (retry.banned) {
          this.repos.setCampaignStatus(campaignId, 'halted')
          this.emit(campaignId, { lastPhone: r.phone, note: 'banned' })
          this.controls.delete(campaignId)
          return
        }
        if (retry.ok) {
          this.markAndLog(campaignId, r.id, r.phone, 'sent', null, this.now())
          if (retry.id) this.repos.setRecipientWaMsgId(r.id, retry.id)
        } else {
          this.markAndLog(campaignId, r.id, r.phone, 'failed', retry.error ?? 'send_failed', this.now())
        }
      }

      // pacing
      const delayMs = isMedia
        ? pickDelaySec(settings.mediaDelayMin, settings.mediaDelayMax, this.rng) * 1000
        : pickDelaySec(settings.msgDelayMin, settings.msgDelayMax, this.rng) * 1000

      this.emit(campaignId, {
        lastPhone: r.phone,
        lastStatus: this.repos.getRecipients(campaignId).find((x) => x.id === r.id)?.status,
        nextDelaySec: isLast ? 0 : Math.round(delayMs / 1000)
      })

      // no trailing wait after the final recipient — finish immediately
      if (isLast) continue

      sentInBatch++
      if (sentInBatch >= batchLimit) {
        const pauseMs =
          pickDelaySec(settings.batchPauseMin, settings.batchPauseMax, this.rng) * 1000
        this.emit(campaignId, { note: 'batch_pause', nextDelaySec: Math.round(pauseMs / 1000) })
        await this.sleep(pauseMs)
        sentInBatch = 0
        batchLimit = batchThreshold(settings.batchEveryMin, settings.batchEveryMax, this.rng)
      } else {
        await this.sleep(delayMs)
      }
    }
  }

  private async sendOnce(campaign: Campaign, phone: string, text: string) {
    if (campaign.contentType === 'poll' && campaign.poll) {
      return this.wa.sendPoll(phone, campaign.poll.question, campaign.poll.options, campaign.poll.selectable)
    }
    if (campaign.contentType === 'vcard' && campaign.vcard) {
      return this.wa.sendVCard(phone, campaign.vcard.name, campaign.vcard.phone)
    }
    if (campaign.mediaPath) {
      return this.wa.sendMedia(phone, campaign.mediaPath, campaign.mediaType ?? 'document', text)
    }
    return this.wa.sendText(phone, text)
  }

  private markAndLog(
    campaignId: number,
    recipientId: number,
    phone: string,
    status: RecipientStatus,
    error: string | null,
    when: Date
  ): void {
    this.repos.updateRecipientStatus(
      recipientId,
      status,
      error,
      status === 'sent' ? when.toISOString() : null
    )
    this.repos.logSend(campaignId, phone, status, when.getTime())
  }
}
