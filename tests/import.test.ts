import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseBuffer, mapRows } from '../electron/contacts/import'

function buildXlsx(aoa: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('parseBuffer', () => {
  it('reads columns and rows from an xlsx buffer', () => {
    const buf = buildXlsx([
      ['Telefon', 'Ad'],
      ['0555 111 22 33', 'Ali'],
      ['0555 111 22 44', 'Veli']
    ])
    const sheet = parseBuffer(buf)
    expect(sheet.columns).toEqual(['Telefon', 'Ad'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0].Ad).toBe('Ali')
  })
})

describe('mapRows', () => {
  const rows = [
    { Telefon: '0555 111 22 33', Ad: 'Ali', Sehir: 'İzmir' },
    { Telefon: 'bozuk', Ad: 'X', Sehir: '' },
    { Telefon: '0555 111 22 33', Ad: 'Tekrar', Sehir: '' },
    { Telefon: '0555 111 22 44', Ad: 'Veli', Sehir: 'Bursa' }
  ]

  it('normalizes valid rows and skips invalid + duplicates', () => {
    const { contacts, skipped } = mapRows(
      rows,
      { phone: 'Telefon', name: 'Ad', vars: ['Sehir'] },
      '90'
    )
    expect(contacts.map((c) => c.phone)).toEqual(['905551112233', '905551112244'])
    expect(skipped).toHaveLength(2)
    expect(skipped[0].row).toBe(3) // invalid is data row 2 -> file row 3
  })

  it('exposes name as {ad} and keeps extra vars', () => {
    const { contacts } = mapRows(rows, { phone: 'Telefon', name: 'Ad', vars: ['Sehir'] }, '90')
    expect(contacts[0].vars.ad).toBe('Ali')
    expect(contacts[0].vars.Sehir).toBe('İzmir')
  })
})
