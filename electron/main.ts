import { app, BrowserWindow, powerSaveBlocker, session } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { initDatabase, getDatabase } from './db/database'
import { Repos } from './db/repositories'
import { BaileysAdapter } from './wa-engine/baileys-adapter'
import { CampaignEngine } from './campaign-engine/engine'
import { registerIpc } from './ipc/handlers'
import { CH } from './ipc/channels'
import { logger, setLogSink } from './logging/logger'
import { matchAutoReply } from './lib/autoreply'
import { sequenceTick, nextRunAfter } from './lib/sequence'
import { applyVars } from './lib/template'
import type { IncomingMessage, WhatsAppPort } from './wa-engine/port'

const AUTOREPLY_COOLDOWN_MS = 5 * 60 * 1000
const SEQ_TICK_INTERVAL_MS = 30_000
const SEQ_MAX_PER_TICK = 5
const SEQ_SEND_GAP_MS = 3_000
let sequenceRunning = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runSequences(repos: Repos, wa: WhatsAppPort): Promise<void> {
  const due = repos.dueEnrollments(Date.now(), SEQ_MAX_PER_TICK)
  if (due.length === 0) return
  let progressed = false
  for (const enr of due) {
    const now = Date.now()
    const steps = repos.getSequenceSteps(enr.sequenceId)
    const hasReplied = repos.hasInboundSince(enr.phone, enr.enrolledAt)
    const tick = sequenceTick({ curStep: enr.curStep, nextRunAt: 0 }, steps, { now, hasReplied })
    if (tick.action === 'done') {
      repos.stopEnrollment(enr.id, 'done')
      progressed = true
      continue
    }
    if (tick.action === 'stop') {
      repos.stopEnrollment(enr.id, 'stopped_reply')
      logger.info('sequence', `paused ${enr.phone} (replied)`)
      progressed = true
      continue
    }
    if (tick.action !== 'send') continue
    if (repos.isOptedOut(enr.phone)) {
      repos.stopEnrollment(enr.id, 'done')
      continue
    }
    const body = applyVars(tick.step.body, { ad: enr.name ?? '', name: enr.name ?? '', ...enr.vars })
    const res = await wa.sendText(enr.phone, body)
    if (res.banned) {
      logger.error('sequence', 'ban signal during sequence; stopping tick')
      break
    }
    if (res.ok) {
      repos.recordOutbound(enr.phone, body, Date.now())
      const next = nextRunAfter(steps, enr.curStep, Date.now())
      repos.advanceEnrollment(enr.id, enr.curStep + 1, next, Date.now())
      logger.info('sequence', `sent step ${enr.curStep + 1} to ${enr.phone}`)
      progressed = true
    }
    await sleep(SEQ_SEND_GAP_MS)
  }
  if (progressed) emit(CH.SEQ_PROGRESS_EVENT, null)
}

function startScheduler(repos: Repos, wa: WhatsAppPort, engine: CampaignEngine): void {
  const tick = async () => {
    try {
      for (const id of repos.dueScheduledCampaigns(Date.now())) {
        logger.info('scheduler', `starting scheduled campaign #${id}`)
        void engine.start(id)
      }
      if (!sequenceRunning) {
        sequenceRunning = true
        try {
          await runSequences(repos, wa)
        } finally {
          sequenceRunning = false
        }
      }
    } catch (err) {
      logger.error('scheduler', 'tick failed:', err)
    }
  }
  void tick()
  setInterval(() => void tick(), SEQ_TICK_INTERVAL_MS)
}

// avoid GPU compositing repaint artifacts (diagonal trails) seen on some Windows GPUs
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
let blockerId = -1

process.on('uncaughtException', (err) => logger.error('main', 'uncaughtException:', err))
process.on('unhandledRejection', (reason) => logger.error('main', 'unhandledRejection:', reason))

function emit(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function updatePowerBlocker(active: boolean): void {
  if (active && blockerId < 0) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (!active && blockerId >= 0) {
    powerSaveBlocker.stop(blockerId)
    blockerId = -1
  }
}

function emitCampaignRefresh(repos: Repos, campaignId: number): void {
  const c = repos.getCampaign(campaignId)
  if (c) emit(CH.CAMP_PROGRESS_EVENT, { campaignId, status: c.status, stats: c.stats })
}

async function handleIncoming(m: IncomingMessage, repos: Repos, wa: WhatsAppPort): Promise<void> {
  const ts = Date.now()
  const isFirstInbound = repos.inboundCount(m.from) === 0

  // record reply for tracking (anti-ban #1 signal) + mark recipients replied
  const affected = repos.recordInbound(m.from, m.text, ts)
  for (const id of affected) emitCampaignRefresh(repos, id)
  emit(CH.INBOX_MESSAGE_EVENT, m.from)

  // opt-out keyword handling
  const keywords = repos.getSettings().optOutKeywords.map((k) => k.trim().toLocaleUpperCase('tr-TR'))
  const upper = m.text.trim().toLocaleUpperCase('tr-TR')
  if (keywords.some((k) => k.length > 0 && (upper === k || upper.startsWith(k)))) {
    repos.addOptOut(m.from, 'user_reply')
    logger.info('optout', `auto opt-out from reply: ${m.from}`)
  }

  // auto-reply (never to opted-out contacts)
  if (repos.isOptedOut(m.from)) return
  const rule = matchAutoReply(m.text, repos.listAutoReplyRules(), {
    isFirstInbound,
    lastAutoReplyTs: repos.getLastAutoReply(m.from),
    now: ts,
    cooldownMs: AUTOREPLY_COOLDOWN_MS
  })
  if (!rule) return
  const contact = repos.getContactByPhone(m.from)
  const replyText = applyVars(rule.reply, { ad: contact?.name ?? '', name: contact?.name ?? '' })
  try {
    const res = await wa.sendText(m.from, replyText)
    if (res.ok) {
      repos.recordOutbound(m.from, replyText, Date.now())
      repos.setLastAutoReply(m.from, ts)
      emit(CH.INBOX_MESSAGE_EVENT, m.from)
      logger.info('autoreply', `replied to ${m.from} via ${rule.kind} rule #${rule.id}`)
    }
  } catch (err) {
    logger.error('autoreply', 'send failed:', err)
  }
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../build/icon.png')
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b141a',
    show: false,
    autoHideMenuBar: true,
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  try {
    const userData = app.getPath('userData')
    const dbPath = join(userData, 'octowp.db')
    initDatabase(dbPath)
    const repos = new Repos(getDatabase())
    setLogSink((e) => {
      try {
        repos.addLog(e)
      } catch {
        /* never let logging crash the app */
      }
    })
    repos.pruneLogs()
    logger.info('main', `startup: db ready at ${dbPath}`)

    if (!process.env.ELECTRON_RENDERER_URL) {
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
            ]
          }
        })
      })
    }

    const authDir = join(userData, 'wa-session')
    const wa = new BaileysAdapter(authDir)
    const engine = new CampaignEngine({
      repos,
      wa,
      onProgress: (p) => {
        emit(CH.CAMP_PROGRESS_EVENT, p)
        if (p.note) {
          logger[p.note === 'banned' ? 'error' : 'info'](
            'campaign',
            `#${p.campaignId} ${p.note} (sent ${p.stats.sent}/${p.stats.total})`
          )
        }
        updatePowerBlocker(repos.campaignsByStatus('running').length > 0)
      }
    })

    wa.onStatus((st) => emit(CH.WA_STATUS_EVENT, st))
    wa.onIncoming((m) => void handleIncoming(m, repos, wa))
    wa.onAck((ack) => {
      const iso = new Date().toISOString()
      const cid = ack.status === 'read' ? repos.markRead(ack.id, iso) : repos.markDelivered(ack.id, iso)
      if (cid) emitCampaignRefresh(repos, cid)
    })
    wa.onContacts((contacts) => {
      try {
        const listId = repos.getOrCreateList('WhatsApp Kişileri').id
        const { imported } = repos.bulkImportContacts(
          contacts.map((c) => ({
            phone: c.phone,
            name: c.name,
            vars: (c.name ? { ad: c.name } : {}) as Record<string, string>
          })),
          listId
        )
        if (imported > 0) {
          logger.info('contacts', `auto-synced ${imported} WhatsApp contacts`)
          emit(CH.CONTACTS_SYNCED_EVENT, imported)
        }
      } catch (err) {
        logger.error('contacts', 'sync failed:', err)
      }
    })

    registerIpc({ repos, wa, engine, dbPath })
    createWindow()

    // auto-reconnect using the saved session (no QR re-scan needed)
    if (existsSync(join(authDir, 'creds.json'))) {
      logger.info('main', 'saved session found — auto-connecting')
      void wa.connect()
    }

    for (const c of repos.campaignsByStatus('running')) void engine.resume(c.id)
    startScheduler(repos, wa, engine)
    logger.info('main', 'startup complete')
    if (process.env.OCTO_SMOKE) setTimeout(() => app.quit(), Number(process.env.OCTO_SMOKE_MS) || 2000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    logger.error('main', 'startup failed:', err)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
