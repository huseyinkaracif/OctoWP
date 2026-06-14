import { describe, it, expect } from 'vitest'
import { openDatabase } from '../electron/db/database'
import { Repos, type NewContact } from '../electron/db/repositories'
import { FakeWhatsApp } from '../electron/wa-engine/fake'
import { CampaignEngine } from '../electron/campaign-engine/engine'
import type { CampaignProgress, Settings } from '../shared/types'

function makeClock(start: Date) {
  let current = new Date(start)
  const slept: number[] = []
  return {
    now: () => new Date(current),
    sleep: async (ms: number) => {
      slept.push(ms)
      current = new Date(current.getTime() + ms)
    },
    slept
  }
}

function setup(n: number, patch: Partial<Settings> = {}) {
  const repos = new Repos(openDatabase(':memory:'))
  const s = repos.getSettings()
  Object.assign(s, {
    activeFrom: 0,
    activeTo: 0,
    msgDelayMin: 1,
    msgDelayMax: 1,
    mediaDelayMin: 1,
    mediaDelayMax: 1,
    batchEveryMin: 100000,
    batchEveryMax: 100000,
    batchPauseMin: 1,
    batchPauseMax: 1,
    dailyCapStart: 100000,
    dailyCapMax: 100000,
    warmupDays: 1,
    typingSimulation: false,
    ...patch
  } as Partial<Settings>)
  repos.saveSettings(s)
  const listId = repos.createList('L').id
  const contacts: NewContact[] = Array.from({ length: n }, (_, i) => ({
    phone: '90555000' + String(1000 + i),
    name: 'U' + i,
    vars: { ad: 'U' + i }
  }))
  repos.bulkImportContacts(contacts, listId)
  const camp = repos.createCampaign({ name: 'K', messageTemplate: 'Merhaba {ad}', listId })
  return { repos, camp }
}

const rng0 = () => 0

describe('CampaignEngine', () => {
  it('sends to all valid recipients and skips invalid numbers', async () => {
    const { repos, camp } = setup(3)
    const wa = new FakeWhatsApp()
    const recipients = repos.getRecipients(camp.id)
    wa.setExists(recipients[1].phone, false)
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })

    await engine.run(camp.id)

    const stats = repos.campaignStats(camp.id)
    expect(stats.sent).toBe(2)
    expect(stats.skipped).toBe(1)
    expect(wa.sent).toHaveLength(2)
    expect(repos.getCampaign(camp.id)!.status).toBe('done')
  })

  it('renders variables into the sent message', async () => {
    const { repos, camp } = setup(1)
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })
    await engine.run(camp.id)
    expect(wa.sent[0].text).toBe('Merhaba U0')
  })

  it('respects the daily cap and resumes the next day', async () => {
    const { repos, camp } = setup(5, { dailyCapStart: 2, dailyCapMax: 2, warmupDays: 1 })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const notes: string[] = []
    const engine = new CampaignEngine({
      repos,
      wa,
      now: clock.now,
      sleep: clock.sleep,
      rng: rng0,
      onProgress: (p: CampaignProgress) => p.note && notes.push(p.note)
    })

    await engine.run(camp.id)

    expect(repos.campaignStats(camp.id).sent).toBe(5)
    expect(notes).toContain('daily_cap')
    // at least one ~midnight wait (> 10h)
    expect(clock.slept.some((ms) => ms > 10 * 3600 * 1000)).toBe(true)
  })

  it('defers sending outside active hours', async () => {
    const { repos, camp } = setup(2, { activeFrom: 9, activeTo: 21 })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 22, 0, 0)) // 22:00, outside window
    const notes: string[] = []
    const engine = new CampaignEngine({
      repos,
      wa,
      now: clock.now,
      sleep: clock.sleep,
      rng: rng0,
      onProgress: (p) => p.note && notes.push(p.note)
    })

    await engine.run(camp.id)

    expect(repos.campaignStats(camp.id).sent).toBe(2)
    expect(notes).toContain('active_hours')
    expect(clock.slept.some((ms) => ms > 3 * 3600 * 1000)).toBe(true)
  })

  it('halts on a ban signal and leaves the rest pending', async () => {
    const { repos, camp } = setup(5)
    const wa = new FakeWhatsApp()
    wa.banAfter = 2
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const notes: string[] = []
    const engine = new CampaignEngine({
      repos,
      wa,
      now: clock.now,
      sleep: clock.sleep,
      rng: rng0,
      onProgress: (p) => p.note && notes.push(p.note)
    })

    await engine.run(camp.id)

    const stats = repos.campaignStats(camp.id)
    expect(stats.sent).toBe(2)
    expect(stats.pending).toBe(3)
    expect(repos.getCampaign(camp.id)!.status).toBe('halted')
    expect(notes).toContain('banned')
    expect(wa.sent).toHaveLength(2)
  })

  it('is idempotent on resume — never re-sends', async () => {
    const { repos, camp } = setup(4)
    const recipients = repos.getRecipients(camp.id)
    repos.updateRecipientStatus(recipients[0].id, 'sent', null, new Date().toISOString())
    repos.updateRecipientStatus(recipients[1].id, 'sent', null, new Date().toISOString())
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })

    await engine.run(camp.id)

    expect(wa.sent).toHaveLength(2)
    const sentPhones = wa.sent.map((m) => m.phone)
    expect(sentPhones).not.toContain(recipients[0].phone)
    expect(sentPhones).not.toContain(recipients[1].phone)
  })

  it('honors opt-out added after campaign creation', async () => {
    const { repos, camp } = setup(3)
    const recipients = repos.getRecipients(camp.id)
    repos.addOptOut(recipients[0].phone, 'user_reply')
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })

    await engine.run(camp.id)

    const stats = repos.campaignStats(camp.id)
    expect(stats.optout).toBe(1)
    expect(stats.sent).toBe(2)
    expect(wa.sent.map((m) => m.phone)).not.toContain(recipients[0].phone)
  })

  it('stores the wa message id so delivery acks match recipients', async () => {
    const { repos, camp } = setup(1, { typingSimulation: false })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })
    await engine.run(camp.id)
    const msgId = wa.sent[0].id!
    expect(msgId).toBeTruthy()
    expect(repos.markDelivered(msgId, new Date().toISOString())).toBe(camp.id)
    expect(repos.campaignStats(camp.id).delivered).toBe(1)
  })

  it('sends a poll campaign via sendPoll', async () => {
    const repos = new Repos(openDatabase(':memory:'))
    const s = repos.getSettings()
    Object.assign(s, {
      activeFrom: 0,
      activeTo: 0,
      msgDelayMin: 1,
      msgDelayMax: 1,
      batchEveryMin: 1000,
      batchEveryMax: 1000,
      dailyCapStart: 1000,
      dailyCapMax: 1000,
      warmupDays: 1,
      typingSimulation: false
    })
    repos.saveSettings(s)
    const listId = repos.createList('L').id
    repos.bulkImportContacts([{ phone: '905550001000', name: 'U', vars: {} }], listId)
    const camp = repos.createCampaign({
      name: 'P',
      messageTemplate: '',
      listId,
      contentType: 'poll',
      poll: { question: 'Soru?', options: ['A', 'B'], selectable: 1 }
    })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })
    await engine.run(camp.id)
    expect(wa.sent[0].text).toBe('poll:Soru?')
    expect(repos.campaignStats(camp.id).sent).toBe(1)
  })

  it('emits a typing presence before sending when enabled', async () => {
    const { repos, camp } = setup(1, { typingSimulation: true })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const engine = new CampaignEngine({ repos, wa, now: clock.now, sleep: clock.sleep, rng: rng0 })
    await engine.run(camp.id)
    expect(wa.presences.some((p) => p.state === 'composing')).toBe(true)
  })

  it('takes a batch pause after the threshold', async () => {
    const { repos, camp } = setup(3, {
      batchEveryMin: 2,
      batchEveryMax: 2,
      batchPauseMin: 100,
      batchPauseMax: 100
    })
    const wa = new FakeWhatsApp()
    const clock = makeClock(new Date(2026, 0, 1, 12, 0, 0))
    const notes: string[] = []
    const engine = new CampaignEngine({
      repos,
      wa,
      now: clock.now,
      sleep: clock.sleep,
      rng: rng0,
      onProgress: (p) => p.note && notes.push(p.note)
    })

    await engine.run(camp.id)

    expect(notes).toContain('batch_pause')
    expect(clock.slept).toContain(100 * 1000)
  })
})
