import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseBuffer, mapRows, mapRowsByRegion, distinctValues } from '../electron/contacts/import'

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

  it('exposes name as {ad}, {name}, {listeadı} and keeps extra vars', () => {
    const { contacts } = mapRows(rows, { phone: 'Telefon', name: 'Ad', vars: ['Sehir'] }, '90')
    expect(contacts[0].vars.ad).toBe('Ali')
    expect(contacts[0].vars.name).toBe('Ali')
    expect(contacts[0].vars['listeadı']).toBe('Ali')
    expect(contacts[0].vars.Sehir).toBe('İzmir')
  })
})

describe('mapRowsByRegion', () => {
  const rows = [
    { Telefon: '0555 111 22 33', Ad: 'Ali', Bolge: 'BOLGE01' },
    { Telefon: '0555 111 22 44', Ad: 'Veli', Bolge: 'BOLGE02' },
    { Telefon: '0555 111 22 33', Ad: 'Ali2', Bolge: 'BOLGE02' }, // same phone, other region -> both
    { Telefon: '0555 111 22 33', Ad: 'dup', Bolge: 'BOLGE01' }, // same phone+region -> skip
    { Telefon: 'bozuk', Ad: 'X', Bolge: 'BOLGE01' }, // invalid
    { Telefon: '0555 111 22 55', Ad: 'Bos', Bolge: '' } // empty region -> skip
  ]
  const mapping = { phone: 'Telefon', name: 'Ad' }

  it('groups by region, dedupes per-region, skips invalid + empty region', () => {
    const { groups, skipped } = mapRowsByRegion(rows, mapping, 'Bolge', '90')
    const byRegion = Object.fromEntries(groups.map((g) => [g.region, g.contacts.map((c) => c.phone)]))
    expect(byRegion['BOLGE01']).toEqual(['905551112233'])
    expect(byRegion['BOLGE02']).toEqual(['905551112244', '905551112233'])
    expect(skipped).toHaveLength(3)
    expect(skipped.some((s) => s.reason === 'boş bölge')).toBe(true)
  })

  it('regionFilter imports only selected regions and ignores others silently', () => {
    const { groups, skipped } = mapRowsByRegion(rows, mapping, 'Bolge', '90', ['BOLGE02'])
    expect(groups.map((g) => g.region)).toEqual(['BOLGE02'])
    expect(groups[0].contacts).toHaveLength(2)
    // only the empty-region row is reported; BOLGE01 rows are filtered out, not skipped
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('boş bölge')
  })
})

describe('distinctValues', () => {
  it('counts non-empty values and sorts by value', () => {
    const rows = [
      { Bolge: 'BOLGE02' },
      { Bolge: 'BOLGE01' },
      { Bolge: 'BOLGE01' },
      { Bolge: '' }
    ]
    expect(distinctValues(rows, 'Bolge')).toEqual([
      { value: 'BOLGE01', count: 2 },
      { value: 'BOLGE02', count: 1 }
    ])
  })
})
