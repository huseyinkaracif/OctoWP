import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

const MAGIC = Buffer.from('OCTOWP01')

/** Encrypt a buffer with a password (scrypt + AES-256-GCM). Output is self-describing. */
export function encryptBuffer(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(password, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, salt, iv, tag, enc])
}

export function decryptBuffer(blob: Buffer, password: string): Buffer {
  if (!blob.subarray(0, 8).equals(MAGIC)) throw new Error('Geçersiz yedek dosyası')
  const salt = blob.subarray(8, 24)
  const iv = blob.subarray(24, 36)
  const tag = blob.subarray(36, 52)
  const enc = blob.subarray(52)
  const key = scryptSync(password, salt, 32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()])
}

/** Write an encrypted, consistent snapshot of the database to outPath. */
export function exportBackup(db: Database.Database, outPath: string, password: string): void {
  const tmp = join(tmpdir(), `octowp-backup-${randomBytes(6).toString('hex')}.db`)
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
  try {
    writeFileSync(outPath, encryptBuffer(readFileSync(tmp), password))
  } finally {
    rmSync(tmp, { force: true })
  }
}

/** Decrypt a backup and overwrite the database file. Caller must reopen/restart. */
export function importBackup(inPath: string, dbPath: string, password: string): void {
  writeFileSync(dbPath, decryptBuffer(readFileSync(inPath), password))
}
