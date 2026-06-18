import * as XLSX from 'xlsx'
import { normalizePhone } from '../lib/phone'
import type { ColumnMapping, ImportSkip } from '../../shared/types'
import type { NewContact } from '../db/repositories'

export interface ParsedSheet {
  columns: string[]
  rows: Record<string, string>[]
}

function workbookToSheet(wb: XLSX.WorkBook): ParsedSheet {
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { columns: [], rows: [] }
  const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false
  })
  const rows = objects.map((r) => {
    const o: Record<string, string> = {}
    for (const k of Object.keys(r)) o[k] = r[k] == null ? '' : String(r[k]).trim()
    return o
  })
  const headerAoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const headerRow = (headerAoa[0] as unknown[] | undefined) ?? []
  const columns = headerRow.map((c) => String(c).trim()).filter((c) => c.length > 0)
  return {
    columns: columns.length ? columns : rows.length ? Object.keys(rows[0]) : [],
    rows
  }
}

/** Parse an .xlsx/.csv buffer into columns + string rows. */
export function parseBuffer(buf: Buffer): ParsedSheet {
  return workbookToSheet(XLSX.read(buf, { type: 'buffer', raw: false }))
}

/** Read an .xlsx/.csv file from disk. */
export function readSheetFile(filePath: string): ParsedSheet {
  return workbookToSheet(XLSX.readFile(filePath, { raw: false }))
}

/**
 * Map raw rows to normalized contacts using the column mapping.
 * Skips rows with invalid phones and in-file duplicates. The mapped name is
 * also exposed as the `{ad}`, `{name}` and `{listeadı}` template variables.
 */
export function mapRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  defaultCountryCode: string
): { contacts: NewContact[]; skipped: ImportSkip[] } {
  const contacts: NewContact[] = []
  const skipped: ImportSkip[] = []
  const seen = new Set<string>()

  rows.forEach((row, i) => {
    const rowNo = i + 2 // header = row 1
    const rawPhone = row[mapping.phone] ?? ''
    const phone = normalizePhone(rawPhone, defaultCountryCode)
    if (!phone) {
      skipped.push({ row: rowNo, reason: `geçersiz numara: "${rawPhone}"` })
      return
    }
    if (seen.has(phone)) {
      skipped.push({ row: rowNo, reason: `dosya içi tekrar: ${phone}` })
      return
    }
    seen.add(phone)
    contacts.push(buildContact(row, mapping, phone))
  })

  return { contacts, skipped }
}

function buildContact(
  row: Record<string, string>,
  mapping: ColumnMapping,
  phone: string
): NewContact {
  const name = mapping.name && row[mapping.name] ? row[mapping.name] : null
  const vars: Record<string, string> = {}
  for (const col of mapping.vars ?? []) {
    if (row[col]) vars[col] = row[col]
  }
  if (name) {
    vars.ad = name
    vars.name = name
    vars['listeadı'] = name
  }
  return { phone, name, vars }
}

export interface RegionGroup {
  region: string
  contacts: NewContact[]
}

/**
 * Like {@link mapRows} but groups contacts by the distinct values of
 * `regionColumn`. Duplicates and validity are checked per-region, so the same
 * number may appear in two regions. When `regionFilter` is given, rows outside
 * it are silently ignored (not reported as skips).
 */
export function mapRowsByRegion(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  regionColumn: string,
  defaultCountryCode: string,
  regionFilter?: string[]
): { groups: RegionGroup[]; skipped: ImportSkip[] } {
  const groups = new Map<string, NewContact[]>()
  const skipped: ImportSkip[] = []
  const seenByRegion = new Map<string, Set<string>>()
  const filter = regionFilter ? new Set(regionFilter) : null

  rows.forEach((row, i) => {
    const rowNo = i + 2
    const region = (row[regionColumn] ?? '').trim()
    if (!region) {
      skipped.push({ row: rowNo, reason: 'boş bölge' })
      return
    }
    if (filter && !filter.has(region)) return

    const rawPhone = row[mapping.phone] ?? ''
    const phone = normalizePhone(rawPhone, defaultCountryCode)
    if (!phone) {
      skipped.push({ row: rowNo, reason: `geçersiz numara: "${rawPhone}"` })
      return
    }
    let seen = seenByRegion.get(region)
    if (!seen) {
      seen = new Set<string>()
      seenByRegion.set(region, seen)
    }
    if (seen.has(phone)) {
      skipped.push({ row: rowNo, reason: `dosya içi tekrar: ${phone}` })
      return
    }
    seen.add(phone)

    const arr = groups.get(region) ?? []
    arr.push(buildContact(row, mapping, phone))
    groups.set(region, arr)
  })

  return {
    groups: [...groups.entries()].map(([region, contacts]) => ({ region, contacts })),
    skipped
  }
}

/** Distinct non-empty values of a column with row counts, sorted by value. */
export function distinctValues(
  rows: Record<string, string>[],
  column: string
): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = (r[column] ?? '').trim()
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'tr'))
}
