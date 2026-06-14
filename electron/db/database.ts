import Database from 'better-sqlite3'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { migrate } from './schema'
import { logger } from '../logging/logger'

function openAndMigrate(path: string): Database.Database {
  const db = new Database(path)
  try {
    migrate(db)
    db.prepare('SELECT 1').get() // sanity check — throws if the image is malformed
    return db
  } catch (e) {
    // release the file handle so a corrupt file can be quarantined/renamed (Windows locks open files)
    try {
      db.close()
    } catch {
      /* ignore */
    }
    throw e
  }
}

/**
 * Open the database, recovering automatically if the file is corrupt
 * (e.g. after a hard kill mid-write). Tries clearing the WAL first; if the
 * main image is malformed, quarantines it (kept as *.corrupt-<ts>) and starts
 * fresh so the app always launches.
 */
export function openDatabase(path: string): Database.Database {
  try {
    return openAndMigrate(path)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (path === ':memory:' || !/malformed|not a database|disk image|encrypted|corrupt/i.test(msg)) {
      throw e
    }
    logger.error('db', `corruption detected (${msg}); attempting recovery`)

    // 1) drop WAL/SHM — frequently the only damaged part after a hard kill
    for (const s of ['-wal', '-shm']) {
      const f = path + s
      if (existsSync(f)) {
        try {
          rmSync(f, { force: true })
        } catch {
          /* ignore */
        }
      }
    }
    try {
      const db = openAndMigrate(path)
      logger.warn('db', 'recovered by clearing WAL (data intact)')
      return db
    } catch {
      // 2) main image is corrupt — quarantine everything and start fresh
      const stamp = Date.now()
      for (const s of ['', '-wal', '-shm']) {
        const f = path + s
        if (existsSync(f)) {
          try {
            renameSync(f, `${f}.corrupt-${stamp}`)
          } catch {
            /* ignore */
          }
        }
      }
      logger.warn('db', `quarantined corrupt db -> *.corrupt-${stamp}; starting fresh`)
      return openAndMigrate(path)
    }
  }
}

let instance: Database.Database | null = null

export function initDatabase(path: string): Database.Database {
  instance = openDatabase(path)
  return instance
}

export function getDatabase(): Database.Database {
  if (!instance) throw new Error('Database not initialized; call initDatabase first')
  return instance
}
