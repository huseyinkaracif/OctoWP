import { ipcMain, dialog, app } from 'electron'
import { z } from 'zod'
import { CH } from './channels'
import type { Repos } from '../db/repositories'
import type { CloudApiPort } from '../wa-engine/port'
import type { CampaignEngine } from '../campaign-engine/engine'
import * as XLSX from 'xlsx'
import { readSheetFile, mapRows, mapRowsByRegion, distinctValues } from '../contacts/import'
import { normalizePhone } from '../lib/phone'
import { applyPreset } from '../lib/presets'
import { exportBackup, importBackup } from '../settings/backup'
import { getDatabase } from '../db/database'
import { dailyCap, warmupDayIndex } from '../lib/throttle'
import { logger } from '../logging/logger'
import type { RiskPresetName, Settings, WAStatus } from '../../shared/types'

export interface IpcServices {
  repos: Repos
  wa: CloudApiPort
  engine: CampaignEngine
  dbPath: string
  /** send an event to the renderer (e.g. status updates) */
  emit: (channel: string, payload: unknown) => void
}

/** Derive the connection status shown in the UI from stored credentials. */
export function computeWaStatus(s: Settings): WAStatus {
  const configured = !!(s.waToken && s.phoneNumberId)
  return {
    state: configured ? 'connected' : 'disconnected',
    phone: s.waVerifiedPhone,
    name: s.waVerifiedName,
    qr: null,
    error: null
  }
}

const mappingSchema = z.object({
  phone: z.string(),
  name: z.string().optional(),
  vars: z.array(z.string()).optional(),
  region: z.string().optional()
})

const regionImportSchema = z.object({
  mode: z.enum(['auto', 'manual']),
  regions: z.array(z.string()).optional(),
  targetListId: z.number().int().positive().nullable().optional(),
  newListName: z.string().optional()
})

const createSchema = z.object({
  name: z.string().min(1).max(120),
  messageTemplate: z.string().optional(),
  mediaPath: z.string().nullable().optional(),
  mediaType: z.enum(['image', 'document', 'video']).nullable().optional(),
  listId: z.number().int().positive().nullable().optional(),
  tagId: z.number().int().positive().nullable().optional(),
  audienceFilter: z.enum(['all', 'replied', 'not_replied']).optional(),
  scheduledAt: z.number().nullable().optional(),
  contentType: z.enum(['message', 'poll', 'vcard']).optional(),
  poll: z
    .object({ question: z.string(), options: z.array(z.string()), selectable: z.number() })
    .nullable()
    .optional(),
  vcard: z.object({ name: z.string(), phone: z.string() }).nullable().optional(),
  templateName: z.string().nullable().optional(),
  templateLang: z.string().nullable().optional(),
  variableMapping: z
    .array(z.object({ kind: z.enum(['column', 'static']), value: z.string() }))
    .optional()
})

const templateSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  body: z.string(),
  mediaPath: z.string().nullable().optional(),
  mediaType: z.enum(['image', 'document', 'video']).nullable().optional()
})

export function registerIpc(s: IpcServices): void {
  const { repos, wa, engine } = s

  // wrap every handler so failures are logged to the persistent log
  const handle = (channel: string, fn: (...args: any[]) => any) => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...args)
      } catch (err) {
        logger.error('ipc', `${channel} failed:`, err)
        throw err
      }
    })
  }

  // ---- WhatsApp Cloud API ----
  handle(CH.WA_GET_STATUS, () => computeWaStatus(repos.getSettings()))
  handle(CH.CLOUD_VERIFY, async () => {
    const res = await wa.verifyConnection()
    if (res.ok) {
      const cur = repos.getSettings()
      repos.saveSettings({
        ...cur,
        waVerifiedName: res.name ?? null,
        waVerifiedPhone: res.phone ? res.phone.replace(/\D/g, '') : null
      })
      logger.info('cloud', `verified: ${res.name ?? ''} ${res.phone ?? ''} (kalite: ${res.quality ?? '—'})`)
    } else {
      logger.warn('cloud', `verify failed: ${res.error ?? 'unknown'}`)
    }
    s.emit(CH.WA_STATUS_EVENT, computeWaStatus(repos.getSettings()))
    return res
  })
  handle(CH.CLOUD_TEMPLATES, () => wa.listTemplates())

  // ---- contacts ----
  handle(CH.CONTACTS_PREVIEW, (filePath: string) => {
    const sheet = readSheetFile(String(filePath))
    return { columns: sheet.columns, sample: sheet.rows.slice(0, 5) }
  })

  handle(CH.CONTACTS_IMPORT, (filePath: string, mapping: unknown, listId: number) => {
    const m = mappingSchema.parse(mapping)
    const sheet = readSheetFile(String(filePath))
    const cc = repos.getSettings().defaultCountryCode
    const { contacts, skipped } = mapRows(sheet.rows, m, cc)
    const { imported, duplicates } = repos.bulkImportContacts(contacts, Number(listId))
    logger.info('import', `${imported} new, ${duplicates} dup, ${skipped.length} skipped from ${sheet.rows.length} rows`)
    return { total: sheet.rows.length, imported, duplicates, skipped, listId: Number(listId) }
  })

  handle(CH.CONTACTS_DISTINCT, (filePath: string, column: string) => {
    const sheet = readSheetFile(String(filePath))
    return distinctValues(sheet.rows, String(column))
  })

  handle(CH.CONTACTS_IMPORT_REGION, (filePath: string, mapping: unknown, opts: unknown) => {
    const m = mappingSchema.parse(mapping)
    const o = regionImportSchema.parse(opts)
    if (!m.region) throw new Error('region column required')
    const sheet = readSheetFile(String(filePath))
    const cc = repos.getSettings().defaultCountryCode
    const filter = o.mode === 'manual' ? o.regions : undefined
    const { groups, skipped } = mapRowsByRegion(sheet.rows, m, m.region, cc, filter)

    const resultGroups: { listId: number; listName: string; imported: number; duplicates: number }[] = []
    let imported = 0
    let duplicates = 0

    if (o.mode === 'manual') {
      const list = o.targetListId
        ? repos.getList(Number(o.targetListId))
        : repos.createList((o.newListName || 'İçe aktarılan').slice(0, 120))
      if (!list) throw new Error('target list not found')
      const all = groups.flatMap((g) => g.contacts)
      const res = repos.bulkImportContacts(all, list.id)
      imported = res.imported
      duplicates = res.duplicates
      resultGroups.push({ listId: list.id, listName: list.name, ...res })
    } else {
      for (const g of groups) {
        const list = repos.createList(g.region.slice(0, 120))
        const res = repos.bulkImportContacts(g.contacts, list.id)
        imported += res.imported
        duplicates += res.duplicates
        resultGroups.push({ listId: list.id, listName: list.name, ...res })
      }
    }

    const primaryListId = resultGroups[0]?.listId ?? 0
    logger.info(
      'import',
      `region(${o.mode}): ${imported} new into ${resultGroups.length} list(s), ${duplicates} dup, ${skipped.length} skipped from ${sheet.rows.length} rows`
    )
    return {
      total: sheet.rows.length,
      imported,
      duplicates,
      skipped,
      listId: primaryListId,
      groups: resultGroups
    }
  })

  handle(CH.CONTACTS_LIST, (listId?: number) =>
    repos.listContacts(listId ? Number(listId) : undefined)
  )
  handle(CH.CONTACTS_COUNT, () => repos.countContacts())

  handle(CH.CONTACTS_ADD, (listId: number, phone: string, name: string | null) => {
    const norm = normalizePhone(String(phone), repos.getSettings().defaultCountryCode)
    if (!norm) return { ok: false, imported: 0 }
    const vars: Record<string, string> = {}
    if (name) vars.ad = name
    const { imported } = repos.bulkImportContacts(
      [{ phone: norm, name: name || null, vars }],
      Number(listId)
    )
    logger.info('contacts', `manual add ${norm} -> list ${listId}`)
    return { ok: true, imported }
  })

  handle(CH.CONTACTS_DELETE, (id: number) => {
    repos.deleteContact(Number(id))
    logger.info('contacts', `deleted contact #${id}`)
  })

  handle(CH.CONTACTS_TEMPLATE, async () => {
    const res = await dialog.showSaveDialog({
      defaultPath: 'ornek-sablon.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return ''
    const ws = XLSX.utils.aoa_to_sheet([
      ['Telefon', 'Ad', 'Sehir'],
      ['0555 123 45 67', 'Ahmet', 'İzmir'],
      ['5326549810', 'Ayşe', 'Bursa']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kisiler')
    XLSX.writeFile(wb, res.filePath)
    logger.info('contacts', `template saved to ${res.filePath}`)
    return res.filePath
  })

  // ---- lists ----
  handle(CH.LISTS_CREATE, (name: string) => {
    const list = repos.createList(String(name).slice(0, 120) || 'Liste')
    logger.info('list', `created "${list.name}" (#${list.id})`)
    return list
  })
  handle(CH.LISTS_ALL, () => repos.allLists())
  handle(CH.LISTS_DELETE, (id: number) => {
    repos.deleteList(Number(id))
    logger.info('list', `deleted #${id}`)
  })

  // ---- opt-outs ----
  handle(CH.OPTOUT_LIST, () => repos.listOptOuts())
  handle(CH.OPTOUT_ADD, (phone: string) => {
    repos.addOptOut(String(phone), 'manual')
    logger.info('optout', `added ${phone}`)
  })
  handle(CH.OPTOUT_REMOVE, (phone: string) => repos.removeOptOut(String(phone)))

  // ---- campaigns ----
  handle(CH.CAMP_CREATE, (input: unknown) => {
    const camp = repos.createCampaign(createSchema.parse(input))
    logger.info('campaign', `created "${camp.name}" (#${camp.id}) with ${camp.stats.total} recipients`)
    return camp
  })
  handle(CH.CAMP_ALL, () => repos.allCampaigns())
  handle(CH.CAMP_GET, (id: number) => ({
    campaign: repos.getCampaign(Number(id)),
    recipients: repos.getRecipients(Number(id))
  }))
  handle(CH.CAMP_DELETE, (id: number) => {
    engine.pause(Number(id)) // stop the loop if it is running before removing rows
    repos.deleteCampaign(Number(id))
    logger.info('campaign', `deleted #${id}`)
  })
  handle(CH.CAMP_START, (id: number) => {
    logger.info('campaign', `start #${id}`)
    void engine.start(Number(id))
  })
  handle(CH.CAMP_PAUSE, (id: number) => {
    logger.info('campaign', `pause #${id}`)
    engine.pause(Number(id))
  })
  handle(CH.CAMP_RESUME, (id: number) => {
    logger.info('campaign', `resume #${id}`)
    void engine.resume(Number(id))
  })
  handle(CH.CAMP_ESTIMATE, (listId: number) => {
    const contacts = repos.listContacts(Number(listId))
    const eligible = contacts.filter((c) => !repos.isOptedOut(c.phone)).length
    const cap = Math.max(1, repos.getSettings().dailyCapMax)
    return { recipients: eligible, days: Math.max(1, Math.ceil(eligible / cap)) }
  })
  handle(CH.CAMP_RETRY, (id: number) => {
    const n = repos.retryFailed(Number(id))
    logger.info('campaign', `retry #${id}: ${n} re-queued`)
    if (n > 0) void engine.start(Number(id))
    return n
  })
  handle(CH.CAMP_EXPORT, async (id: number) => {
    const campaign = repos.getCampaign(Number(id))
    const recipients = repos.getRecipients(Number(id))
    const res = await dialog.showSaveDialog({
      defaultPath: `${(campaign?.name || 'kampanya').replace(/[^\p{L}\p{N}_-]+/gu, '_')}-sonuc.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return ''
    const aoa = [
      ['Ad', 'Telefon', 'Durum', 'Gonderildi', 'Iletildi', 'Okundu', 'Yanitladi', 'Hata'],
      ...recipients.map((r) => [
        r.name ?? '',
        r.phone,
        r.status,
        r.sentAt ?? '',
        r.deliveredAt ?? '',
        r.readAt ?? '',
        r.repliedAt ?? '',
        r.error ?? ''
      ])
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sonuc')
    XLSX.writeFile(wb, res.filePath)
    logger.info('campaign', `exported results #${id} -> ${res.filePath}`)
    return res.filePath
  })

  // ---- settings ----
  handle(CH.SETTINGS_GET, () => repos.getSettings())
  handle(CH.SETTINGS_SET, (patch: Partial<Settings>) => {
    const next = { ...repos.getSettings(), ...patch }
    repos.saveSettings(next)
    logger.info('settings', 'updated')
    return next
  })
  handle(CH.SETTINGS_PRESET, (name: RiskPresetName) => {
    const next = applyPreset(repos.getSettings(), name)
    repos.saveSettings(next)
    logger.info('settings', `preset -> ${name}`)
    return next
  })

  // ---- dashboard stats ----
  handle(CH.STATS_DASHBOARD, () => {
    const now = new Date()
    const settings = repos.getSettings()
    const firstUsed = repos.getAccountFirstUsed()
    const cap = dailyCap(settings, firstUsed ? warmupDayIndex(firstUsed, now) : 1)
    return {
      sentToday: repos.countSentToday(now),
      dailyCap: cap,
      contacts: repos.countContacts(),
      running: repos.campaignsByStatus('running').length
    }
  })

  // ---- templates ----
  handle(CH.TEMPLATES_LIST, () => repos.listTemplates())
  handle(CH.TEMPLATES_SAVE, (t: unknown) => repos.saveTemplate(templateSchema.parse(t)))
  handle(CH.TEMPLATES_DELETE, (id: number) => repos.deleteTemplate(Number(id)))

  // ---- tags ----
  handle(CH.TAGS_LIST, () => repos.listTags())
  handle(CH.TAGS_CREATE, (name: string, color?: string) =>
    repos.createTag(String(name).slice(0, 40) || 'Etiket', color ? String(color) : undefined)
  )
  handle(CH.TAGS_DELETE, (id: number) => repos.deleteTag(Number(id)))
  handle(CH.TAGS_ASSIGN, (contactId: number, tagId: number) =>
    repos.assignTag(Number(contactId), Number(tagId))
  )
  handle(CH.TAGS_UNASSIGN, (contactId: number, tagId: number) =>
    repos.unassignTag(Number(contactId), Number(tagId))
  )

  // ---- logs ----
  handle(CH.LOGS_LIST, (search?: string) => repos.listLogs(search ? String(search) : undefined))
  handle(CH.LOGS_CLEAR, () => {
    repos.clearLogs()
    logger.info('app', 'logs cleared by user')
  })

  // ---- backup ----
  handle(CH.BACKUP_EXPORT, async (password: string) => {
    const res = await dialog.showSaveDialog({
      defaultPath: 'octowp-yedek.octw',
      filters: [{ name: 'OctoWP Yedek', extensions: ['octw'] }]
    })
    if (res.canceled || !res.filePath) return ''
    exportBackup(getDatabase(), res.filePath, String(password))
    logger.info('backup', `exported to ${res.filePath}`)
    return res.filePath
  })
  handle(CH.BACKUP_IMPORT, async (filePath: string, password: string) => {
    importBackup(String(filePath), s.dbPath, String(password))
    logger.warn('backup', 'imported; relaunching')
    app.relaunch()
    app.exit(0)
  })

  // ---- dialog ----
  handle(CH.DIALOG_OPEN, async (filters?: Electron.FileFilter[]) => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters && filters.length ? filters : undefined
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
}
