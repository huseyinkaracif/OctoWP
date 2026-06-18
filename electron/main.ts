import { app, BrowserWindow, powerSaveBlocker, session } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { initDatabase, getDatabase } from './db/database'
import { Repos } from './db/repositories'
import { CloudApiAdapter } from './wa-engine/cloud-api-adapter'
import { CampaignEngine } from './campaign-engine/engine'
import { registerIpc, computeWaStatus } from './ipc/handlers'
import { CH } from './ipc/channels'
import { logger, setLogSink } from './logging/logger'

const SCHED_TICK_INTERVAL_MS = 30_000

function startScheduler(repos: Repos, engine: CampaignEngine): void {
  const tick = () => {
    try {
      for (const id of repos.dueScheduledCampaigns(Date.now())) {
        logger.info('scheduler', `starting scheduled campaign #${id}`)
        void engine.start(id)
      }
    } catch (err) {
      logger.error('scheduler', 'tick failed:', err)
    }
  }
  tick()
  setInterval(tick, SCHED_TICK_INTERVAL_MS)
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

    const wa = new CloudApiAdapter(() => {
      const s = repos.getSettings()
      return {
        waToken: s.waToken,
        phoneNumberId: s.phoneNumberId,
        wabaId: s.wabaId,
        graphVersion: s.graphVersion
      }
    })
    const engine = new CampaignEngine({
      repos,
      wa,
      onProgress: (p) => {
        emit(CH.CAMP_PROGRESS_EVENT, p)
        if (p.note) {
          const isErr = p.note === 'banned' || p.note === 'media_error' || p.note === 'no_template'
          logger[isErr ? 'error' : 'info'](
            'campaign',
            `#${p.campaignId} ${p.note} (sent ${p.stats.sent}/${p.stats.total})`
          )
        }
        updatePowerBlocker(repos.campaignsByStatus('running').length > 0)
      }
    })

    registerIpc({ repos, wa, engine, dbPath, emit })
    createWindow()

    // push the initial connection status once the window is up
    emit(CH.WA_STATUS_EVENT, computeWaStatus(repos.getSettings()))

    for (const c of repos.campaignsByStatus('running')) void engine.resume(c.id)
    startScheduler(repos, engine)
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
