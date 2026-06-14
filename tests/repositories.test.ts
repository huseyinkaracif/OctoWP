import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase } from '../electron/db/database'
import { Repos, type NewContact } from '../electron/db/repositories'

function freshRepos(): Repos {
  return new Repos(openDatabase(':memory:'))
}

const c = (phone: string, name: string): NewContact => ({ phone, name, vars: { ad: name } })

describe('Repos contacts & lists', () => {
  let repos: Repos
  let listId: number
  beforeEach(() => {
    repos = freshRepos()
    listId = repos.createList('Test Listesi').id
  })

  it('imports contacts and links them to a list', () => {
    const res = repos.bulkImportContacts(
      [c('905551112233', 'Ali'), c('905551112244', 'Veli')],
      listId
    )
    expect(res).toEqual({ imported: 2, duplicates: 0 })
    expect(repos.countContacts()).toBe(2)
    expect(repos.listContacts(listId).map((x) => x.name).sort()).toEqual(['Ali', 'Veli'])
  })

  it('counts re-imported phones as duplicates', () => {
    repos.bulkImportContacts([c('905551112233', 'Ali')], listId)
    const res = repos.bulkImportContacts([c('905551112233', 'Ali')], listId)
    expect(res).toEqual({ imported: 0, duplicates: 1 })
    expect(repos.countContacts()).toBe(1)
  })

  it('reports list count', () => {
    repos.bulkImportContacts([c('905551112233', 'Ali')], listId)
    expect(repos.getList(listId)!.count).toBe(1)
  })
})

describe('Repos opt-outs', () => {
  it('adds, checks, lists and removes', () => {
    const repos = freshRepos()
    repos.addOptOut('905551112233', 'manual')
    expect(repos.isOptedOut('905551112233')).toBe(true)
    expect(repos.listOptOuts()).toHaveLength(1)
    repos.removeOptOut('905551112233')
    expect(repos.isOptedOut('905551112233')).toBe(false)
  })
})

describe('Repos settings', () => {
  it('returns balanced defaults when empty', () => {
    const repos = freshRepos()
    expect(repos.getSettings().preset).toBe('balanced')
  })
  it('persists settings', () => {
    const repos = freshRepos()
    const s = repos.getSettings()
    s.msgDelayMin = 1
    s.msgDelayMax = 2
    repos.saveSettings(s)
    expect(repos.getSettings().msgDelayMin).toBe(1)
  })
})

describe('Repos campaigns', () => {
  let repos: Repos
  let listId: number
  beforeEach(() => {
    repos = freshRepos()
    listId = repos.createList('L').id
    repos.bulkImportContacts(
      [c('905551112233', 'Ali'), c('905551112244', 'Veli'), c('905551112255', 'Ayşe')],
      listId
    )
  })

  it('expands recipients and marks opted-out ones', () => {
    repos.addOptOut('905551112255', 'manual')
    const camp = repos.createCampaign({
      name: 'Kampanya',
      messageTemplate: 'Merhaba {ad}',
      listId
    })
    const stats = repos.campaignStats(camp.id)
    expect(stats.total).toBe(3)
    expect(stats.optout).toBe(1)
    expect(stats.pending).toBe(2)
    expect(repos.pendingRecipients(camp.id)).toHaveLength(2)
  })

  it('updates recipient status and reflects it in stats', () => {
    const camp = repos.createCampaign({ name: 'K', messageTemplate: 'x', listId })
    const pending = repos.pendingRecipients(camp.id)
    repos.updateRecipientStatus(pending[0].id, 'sent', null, new Date().toISOString())
    const stats = repos.campaignStats(camp.id)
    expect(stats.sent).toBe(1)
    expect(stats.pending).toBe(2)
  })

  it('carries vars into recipients for rendering', () => {
    const camp = repos.createCampaign({ name: 'K', messageTemplate: 'Merhaba {ad}', listId })
    const pending = repos.pendingRecipients(camp.id)
    expect(pending[0].vars.ad).toBeTruthy()
  })
})

describe('Repos logs', () => {
  it('adds, searches, and clears logs', () => {
    const repos = freshRepos()
    repos.addLog({ ts: 1000, level: 'info', scope: 'wa', message: 'connected' })
    repos.addLog({ ts: 2000, level: 'error', scope: 'campaign', message: 'banned signal' })
    expect(repos.listLogs()).toHaveLength(2)
    // newest first
    expect(repos.listLogs()[0].message).toBe('banned signal')
    // search by message
    expect(repos.listLogs('banned')).toHaveLength(1)
    // search by scope
    expect(repos.listLogs('wa')).toHaveLength(1)
    repos.clearLogs()
    expect(repos.listLogs()).toHaveLength(0)
  })

  it('getOrCreateList reuses an existing list by name', () => {
    const repos = freshRepos()
    const a = repos.getOrCreateList('WhatsApp Kişileri')
    const b = repos.getOrCreateList('WhatsApp Kişileri')
    expect(a.id).toBe(b.id)
  })
})

describe('Repos v2 acks, inbound & retry', () => {
  let repos: Repos
  let campId: number
  let recId: number
  beforeEach(() => {
    repos = freshRepos()
    const listId = repos.createList('L').id
    repos.bulkImportContacts([c('905551112233', 'Ali')], listId)
    campId = repos.createCampaign({ name: 'K', messageTemplate: 'x', listId }).id
    recId = repos.pendingRecipients(campId)[0].id
    repos.updateRecipientStatus(recId, 'sent', null, new Date().toISOString())
    repos.setRecipientWaMsgId(recId, 'MSG1')
  })

  it('tracks delivered/read by wa_msg_id and reflects in the funnel', () => {
    expect(repos.markDelivered('MSG1', new Date().toISOString())).toBe(campId)
    expect(repos.campaignStats(campId).delivered).toBe(1)
    expect(repos.campaignStats(campId).read).toBe(0)
    expect(repos.markRead('MSG1', new Date().toISOString())).toBe(campId)
    const s = repos.campaignStats(campId)
    expect(s.read).toBe(1)
    expect(s.delivered).toBe(1) // read implies delivered
  })

  it('ignores acks for unknown message ids', () => {
    expect(repos.markDelivered('UNKNOWN', new Date().toISOString())).toBeNull()
  })

  it('records an inbound reply and marks the recipient replied', () => {
    const affected = repos.recordInbound('905551112233', 'merhaba', Date.now())
    expect(affected).toContain(campId)
    expect(repos.campaignStats(campId).replied).toBe(1)
    const rec = repos.getRecipients(campId)[0]
    expect(rec.repliedAt).toBeTruthy()
  })

  it('retryFailed re-queues only failed recipients', () => {
    repos.updateRecipientStatus(recId, 'failed', 'boom', null)
    expect(repos.campaignStats(campId).failed).toBe(1)
    expect(repos.retryFailed(campId)).toBe(1)
    expect(repos.campaignStats(campId).failed).toBe(0)
    expect(repos.campaignStats(campId).pending).toBe(1)
  })
})

describe('Repos send log', () => {
  it('counts sends from today only', () => {
    const repos = freshRepos()
    const now = new Date()
    repos.logSend(null, '905551112233', 'sent', now.getTime())
    repos.logSend(null, '905551112244', 'sent', now.getTime())
    repos.logSend(null, '905551112255', 'failed', now.getTime())
    // yesterday
    repos.logSend(null, '905551112266', 'sent', now.getTime() - 86_400_000 - 3_600_000)
    expect(repos.countSentToday(now)).toBe(2)
  })
})
