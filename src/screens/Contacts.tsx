import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Upload, Plus, Ban, Trash2, UserX, X, UserPlus, Download, Tag as TagIcon, Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import type { Contact, ListDTO, ImportPreview, ImportResult, ColumnMapping, RegionImportOptions, DistinctValue, OptOutEntry, Tag } from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, TextInput, Field, Spinner } from '../components/ui'
import { displayPhone, cn } from '../lib/format'

type Tab = 'lists' | 'optout'

export function Contacts() {
  const [tab, setTab] = useState<Tab>('lists')
  const [lists, setLists] = useState<ListDTO[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [importState, setImportState] = useState<ImportFlow | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [optouts, setOptouts] = useState<OptOutEntry[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [newListOpen, setNewListOpen] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagMenuContact, setTagMenuContact] = useState<Contact | null>(null)
  const toast = useToast()

  const loadTags = () => octo.tags.list().then(setAllTags)
  const reloadContacts = () => {
    if (selected) octo.contacts.list(selected).then(setContacts)
  }

  const loadLists = () =>
    octo.lists.all().then((ls) => {
      setLists(ls)
      setSelected((cur) => cur ?? ls[0]?.id ?? null)
    })

  useEffect(() => {
    loadLists()
    loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (selected) octo.contacts.list(selected).then(setContacts)
    else setContacts([])
  }, [selected])
  useEffect(() => {
    if (tab === 'optout') octo.optout.list().then(setOptouts)
  }, [tab, result])

  const newList = () => setNewListOpen(true)
  const createList = async (name: string) => {
    const l = await octo.lists.create(name.trim())
    await loadLists()
    setSelected(l.id)
    setNewListOpen(false)
    toast('Liste oluşturuldu', 'success')
  }

  const deleteList = async (l: ListDTO) => {
    if (!window.confirm(`"${l.name}" listesi ve sadece bu listedeki numaralar silinsin mi?`)) return
    await octo.lists.delete(l.id)
    if (selected === l.id) setSelected(null)
    await loadLists()
    toast('Liste silindi', 'success')
  }

  const deleteContact = async (c: Contact) => {
    if (!window.confirm(`${c.name || displayPhone(c.phone)} silinsin mi?`)) return
    await octo.contacts.delete(c.id)
    reloadContacts()
    loadLists()
    toast('Numara silindi', 'success')
  }

  const startImport = async () => {
    const file = await octo.dialog.openFile([
      { name: 'Tablolar', extensions: ['xlsx', 'xls', 'csv'] }
    ])
    if (!file) return
    const preview = await octo.contacts.previewColumns(file)
    setResult(null)
    setImportState({ file, preview })
  }

  const onImported = async (r: ImportResult) => {
    setImportState(null)
    setResult(r)
    const msg =
      r.groups && r.groups.length > 1
        ? `${r.groups.length} liste oluşturuldu · ${r.imported} kişi eklendi`
        : `${r.imported} kişi eklendi`
    toast(msg, 'success')
    await loadLists()
    setSelected(r.listId)
    octo.contacts.list(r.listId).then(setContacts)
  }

  const block = async (phone: string) => {
    await octo.optout.add(phone)
    toast('Numara engellendi', 'success')
    if (selected) octo.contacts.list(selected).then(setContacts)
  }

  const addManual = async (phone: string, name: string): Promise<boolean> => {
    if (!selected) {
      toast('Önce bir liste seç veya oluştur', 'error')
      return false
    }
    const res = await octo.contacts.add(selected, phone, name || null)
    if (!res.ok) {
      toast('Geçersiz numara', 'error')
      return false
    }
    toast(res.imported ? 'Numara eklendi' : 'Numara zaten listede', res.imported ? 'success' : 'info')
    await loadLists()
    octo.contacts.list(selected).then(setContacts)
    return true
  }

  const downloadTemplate = async () => {
    const path = await octo.contacts.downloadTemplate()
    if (path) toast('Örnek şablon kaydedildi', 'success')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SectionTitle
        title="Rehber"
        subtitle="Kişileri içe aktar, listeler ve engellenenleri yönet"
        action={
          <Button onClick={newList}>
            <Plus size={16} /> Yeni liste
          </Button>
        }
      />

      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-white/5 w-fit">
        <TabBtn active={tab === 'lists'} onClick={() => setTab('lists')}>
          Listeler
        </TabBtn>
        <TabBtn active={tab === 'optout'} onClick={() => setTab('optout')}>
          Engellenenler
        </TabBtn>
      </div>

      {result && (
        <Card className="flex items-center justify-between p-4 ring-1 ring-brand-500/30">
          <div className="text-sm">
            {result.groups && result.groups.length > 1 && (
              <><b>{result.groups.length}</b> liste · </>
            )}
            <b>{result.imported}</b> yeni eklendi · {result.duplicates} tekrar ·{' '}
            <b>{result.skipped.length}</b> atlandı (toplam {result.total} satır)
          </div>
          <button onClick={() => setResult(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </Card>
      )}

      {tab === 'lists' ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
          <Card className="h-fit p-2">
            {lists.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">Henüz liste yok</div>
            ) : (
              lists.map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                    selected === l.id
                      ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'hover:bg-slate-100 dark:hover:bg-white/5'
                  )}
                >
                  <button onClick={() => setSelected(l.id)} className="min-w-0 flex-1 truncate text-left">
                    {l.name}
                  </button>
                  <Badge>{l.count}</Badge>
                  <button
                    onClick={() => deleteList(l)}
                    title="Listeyi sil"
                    className="text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </Card>

          {contacts.length === 0 ? (
            <Card className="overflow-hidden">
              <ContactsEmpty
                onAdd={() => (selected ? setAddOpen(true) : toast('Önce bir liste seç', 'error'))}
                onImport={startImport}
                onTemplate={downloadTemplate}
              />
            </Card>
          ) : (
            <ContactsPanel
              contacts={contacts}
              onBlock={block}
              onDelete={deleteContact}
              onTag={setTagMenuContact}
              onAdd={() => (selected ? setAddOpen(true) : toast('Önce bir liste seç', 'error'))}
              onImport={startImport}
              onTemplate={downloadTemplate}
            />
          )}
        </div>
      ) : (
        <OptOutPanel optouts={optouts} reload={() => octo.optout.list().then(setOptouts)} />
      )}

      {importState && (
        <ImportModal
          flow={importState}
          lists={lists}
          onClose={() => setImportState(null)}
          onDone={onImported}
        />
      )}

      {addOpen && (
        <AddContactModal
          listName={lists.find((l) => l.id === selected)?.name ?? ''}
          onClose={() => setAddOpen(false)}
          onAdd={addManual}
        />
      )}

      {newListOpen && <NewListModal onClose={() => setNewListOpen(false)} onCreate={createList} />}

      {tagMenuContact && (
        <TagMenu
          contact={tagMenuContact}
          tags={allTags}
          onClose={() => setTagMenuContact(null)}
          onChanged={() => {
            loadTags()
            reloadContacts()
          }}
        />
      )}
    </div>
  )
}

function TagMenu({
  contact,
  tags,
  onClose,
  onChanged
}: {
  contact: Contact
  tags: Tag[]
  onClose: () => void
  onChanged: () => void
}) {
  const [assigned, setAssigned] = useState<Set<number>>(
    new Set((contact.tags ?? []).map((t) => t.id))
  )
  const [newName, setNewName] = useState('')

  const toggle = async (tag: Tag) => {
    if (assigned.has(tag.id)) {
      await octo.tags.unassign(contact.id, tag.id)
      setAssigned((s) => {
        const n = new Set(s)
        n.delete(tag.id)
        return n
      })
    } else {
      await octo.tags.assign(contact.id, tag.id)
      setAssigned((s) => new Set(s).add(tag.id))
    }
    onChanged()
  }
  const create = async () => {
    if (!newName.trim()) return
    const t = await octo.tags.create(newName.trim())
    await octo.tags.assign(contact.id, t.id)
    setAssigned((s) => new Set(s).add(t.id))
    setNewName('')
    onChanged()
  }
  const remove = async (tag: Tag) => {
    await octo.tags.delete(tag.id)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-semibold">Etiketler</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <p className="mb-4 text-xs text-slate-400">{contact.name || displayPhone(contact.phone)}</p>

          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const on = assigned.has(t.id)
              return (
                <span key={t.id} className="group inline-flex items-center">
                  <button
                    onClick={() => toggle(t)}
                    className={cn(
                      'rounded-l-lg border px-2.5 py-1 text-xs transition',
                      on
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'border-slate-300 text-slate-500 dark:border-white/10'
                    )}
                  >
                    {on ? '✓ ' : ''}
                    {t.name}
                  </button>
                  <button
                    onClick={() => remove(t)}
                    title="Etiketi tamamen sil"
                    className="rounded-r-lg border border-l-0 border-slate-300 px-1 py-1 text-slate-300 hover:text-rose-500 dark:border-white/10"
                  >
                    <X size={11} />
                  </button>
                </span>
              )
            })}
            {tags.length === 0 && <span className="text-sm text-slate-400">Henüz etiket yok</span>}
          </div>

          <div className="mt-4 flex gap-2">
            <TextInput
              placeholder="Yeni etiket"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <Button onClick={create} disabled={!newName.trim()}>
              <Plus size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function SortableTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button onClick={onClick} className={cn('inline-flex items-center gap-1', active && 'text-slate-600 dark:text-slate-200')}>
        {label}
        <ArrowUpDown size={12} className={active ? 'opacity-100' : 'opacity-30'} />
        {active && <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

function ContactsPanel({
  contacts,
  onBlock,
  onDelete,
  onTag,
  onAdd,
  onImport,
  onTemplate
}: {
  contacts: Contact[]
  onBlock: (phone: string) => void
  onDelete: (c: Contact) => void
  onTag: (c: Contact) => void
  onAdd: () => void
  onImport: () => void
  onTemplate: () => void
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'phone'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const pageSize = 50

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    const digits = q.replace(/\D/g, '')
    let arr = contacts
    if (q) {
      arr = arr.filter(
        (c) =>
          (c.name ?? '').toLocaleLowerCase('tr-TR').includes(q) || (digits !== '' && c.phone.includes(digits))
      )
    }
    return [...arr].sort((a, b) => {
      const av = sortKey === 'name' ? a.name ?? '' : a.phone
      const bv = sortKey === 'name' ? b.name ?? '' : b.phone
      const cmp = av.localeCompare(bv, 'tr')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [contacts, search, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const curPage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(curPage * pageSize, curPage * pageSize + pageSize)

  useEffect(() => {
    setPage(0)
  }, [search, sortKey, sortDir])

  const toggleSort = (k: 'name' | 'phone') => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  return (
    <Card className="flex h-[68vh] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-white/5">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput placeholder="İsim veya numara ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={onAdd}>
          <UserPlus size={15} /> Numara ekle
        </Button>
        <Button onClick={onImport}>
          <Upload size={15} /> Excel/CSV içe aktar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase text-slate-400 dark:bg-[#0b141a]">
            <tr>
              <SortableTh label="İsim" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
              <SortableTh label="Numara" active={sortKey === 'phone'} dir={sortDir} onClick={() => toggleSort('phone')} />
              <th className="px-4 py-2.5 font-medium">Etiketler</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <td className="px-4 py-2.5 font-medium">{c.name || '—'}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-500">{displayPhone(c.phone)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {(c.tags ?? []).map((t) => (
                      <Badge key={t.id} tone="blue">
                        {t.name}
                      </Badge>
                    ))}
                    <button onClick={() => onTag(c)} title="Etiket ekle/çıkar" className="rounded p-0.5 text-slate-400 hover:text-brand-600">
                      <TagIcon size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onBlock(c.phone)} title="Engelle (gönderme)" className="text-slate-400 hover:text-amber-500">
                      <Ban size={15} />
                    </button>
                    <button onClick={() => onDelete(c)} title="Numarayı sil" className="text-slate-400 hover:text-rose-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-sm text-slate-400">Eşleşen kişi yok</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500 dark:border-white/5">
        <div>
          {filtered.length} kişi ·{' '}
          <button onClick={onTemplate} className="text-brand-600 hover:underline">
            Örnek şablon indir
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={curPage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/5"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">
            {curPage + 1} / {pageCount}
          </span>
          <button
            disabled={curPage >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/5"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Card>
  )
}

function ContactsEmpty({
  onAdd,
  onImport,
  onTemplate
}: {
  onAdd: () => void
  onImport: () => void
  onTemplate: () => void
}) {
  return (
    <div className="p-6">
      <div className="text-center">
        <h3 className="text-base font-semibold">Bu listede henüz kişi yok</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Tek tek numara ekleyebilir veya Excel/CSV dosyası içe aktarabilirsin. Dosyanın ilk satırı
          başlık olmalı:
        </p>
      </div>

      <div className="mx-auto mt-5 max-w-md overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-50 text-left text-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
              <th className="px-3 py-2 font-semibold">Telefon</th>
              <th className="px-3 py-2 font-semibold">Ad</th>
              <th className="px-3 py-2 font-semibold">Sehir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            <tr>
              <td className="px-3 py-2 tabular-nums">0555 123 45 67</td>
              <td className="px-3 py-2">Ahmet</td>
              <td className="px-3 py-2 text-slate-400">İzmir</td>
            </tr>
            <tr>
              <td className="px-3 py-2 tabular-nums">5326549810</td>
              <td className="px-3 py-2">Ayşe</td>
              <td className="px-3 py-2 text-slate-400">Bursa</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mx-auto mt-3 max-w-md text-center text-xs text-slate-400">
        <b>Telefon</b> zorunlu (0 ile veya ülke koduyla). <b>Ad</b> ve diğer sütunlar opsiyonel —
        mesajda <code className="rounded bg-slate-100 px-1 dark:bg-white/10">{'{ad}'}</code>,{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-white/10">{'{sehir}'}</code> olarak kullanılır.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onAdd}>
          <UserPlus size={16} /> Numara ekle
        </Button>
        <Button variant="outline" onClick={onImport}>
          <Upload size={16} /> Excel/CSV içe aktar
        </Button>
        <Button variant="ghost" onClick={onTemplate}>
          <Download size={16} /> Örnek şablon indir
        </Button>
      </div>
    </div>
  )
}

function NewListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onCreate(name.trim())
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Yeni liste</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <Field label="Liste adı">
            <TextInput
              autoFocus
              placeholder="Örn. Mayıs müşterileri"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Kapat
            </Button>
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy ? <Spinner /> : <Plus size={16} />} Oluştur
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function AddContactModal({
  listName,
  onClose,
  onAdd
}: {
  listName: string
  onClose: () => void
  onAdd: (phone: string, name: string) => Promise<boolean>
}) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!phone.trim()) return
    setBusy(true)
    try {
      const ok = await onAdd(phone.trim(), name.trim())
      if (ok) {
        setPhone('')
        setName('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-base font-semibold">Numara ekle</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          {listName && <p className="mb-4 text-xs text-slate-400">Liste: {listName}</p>}
          <div className="space-y-3">
            <Field label="Telefon">
              <TextInput
                autoFocus
                placeholder="0555 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
            <Field label="İsim (opsiyonel)">
              <TextInput
                placeholder="Ahmet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Kapat
            </Button>
            <Button onClick={submit} disabled={busy || !phone.trim()}>
              {busy ? <Spinner /> : <UserPlus size={16} />} Ekle
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg px-4 py-1.5 text-sm font-medium transition',
        active ? 'bg-white text-slate-800 shadow-sm dark:bg-[#111b21] dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
      )}
    >
      {children}
    </button>
  )
}

interface ImportFlow {
  file: string
  preview: ImportPreview
}

function ImportModal({
  flow,
  lists,
  onClose,
  onDone
}: {
  flow: ImportFlow
  lists: ListDTO[]
  onClose: () => void
  onDone: (r: ImportResult) => void
}) {
  const cols = flow.preview.columns
  const [phone, setPhone] = useState(cols[0] ?? '')
  const [name, setName] = useState('')
  const [vars, setVars] = useState<string[]>([])
  const [region, setRegion] = useState('')
  const [regionMode, setRegionMode] = useState<'auto' | 'manual'>('auto')
  const [regionValues, setRegionValues] = useState<DistinctValue[]>([])
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [loadingRegions, setLoadingRegions] = useState(false)
  const [target, setTarget] = useState<string>(lists[0] ? String(lists[0].id) : 'new')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const varCandidates = useMemo(
    () => cols.filter((c) => c !== phone && c !== name && c !== region),
    [cols, phone, name, region]
  )

  useEffect(() => {
    if (!region) {
      setRegionValues([])
      setSelectedRegions([])
      return
    }
    setVars((v) => v.filter((c) => c !== region))
    let active = true
    setLoadingRegions(true)
    octo.contacts.distinctValues(flow.file, region).then((vals) => {
      if (!active) return
      setRegionValues(vals)
      setSelectedRegions([])
      setLoadingRegions(false)
    })
    return () => {
      active = false
    }
  }, [region, flow.file])

  const toggleRegionSel = (val: string) =>
    setSelectedRegions((s) => (s.includes(val) ? s.filter((x) => x !== val) : [...s, val]))

  const showTarget = !region || regionMode === 'manual'
  const canRun =
    !!phone &&
    (!region
      ? true
      : regionMode === 'auto'
        ? regionValues.length > 0
        : selectedRegions.length > 0)

  const run = async () => {
    setBusy(true)
    try {
      const mapping: ColumnMapping = {
        phone,
        name: name || undefined,
        vars,
        region: region || undefined
      }
      if (region) {
        const opts: RegionImportOptions =
          regionMode === 'auto'
            ? { mode: 'auto' }
            : {
                mode: 'manual',
                regions: selectedRegions,
                targetListId: target === 'new' ? null : Number(target),
                newListName: newName || undefined
              }
        onDone(await octo.contacts.importByRegion(flow.file, mapping, opts))
      } else {
        const listId = target === 'new' ? (await octo.lists.create(newName || 'İçe aktarılan')).id : Number(target)
        onDone(await octo.contacts.import(flow.file, mapping, listId))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-6" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sütunları eşleştir</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <Field label="Telefon sütunu">
              <select className="input-base" value={phone} onChange={(e) => setPhone(e.target.value)}>
                {cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="İsim sütunu (opsiyonel)">
              <select className="input-base" value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">— yok —</option>
                {cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            {varCandidates.length > 0 && (
              <Field label="Değişken sütunlar (mesajda {sütun} olarak kullan)">
                <div className="flex flex-wrap gap-2">
                  {varCandidates.map((c) => {
                    const on = vars.includes(c)
                    return (
                      <button
                        key={c}
                        onClick={() => setVars((v) => (on ? v.filter((x) => x !== c) : [...v, c]))}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs transition',
                          on
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : 'border-slate-300 text-slate-500 dark:border-white/10'
                        )}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}

            <Field label="Bölge sütunu (opsiyonel — listelere böler)">
              <select className="input-base" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">— bölme yok —</option>
                {cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            {region && (
              <RegionPanel
                mode={regionMode}
                setMode={setRegionMode}
                loading={loadingRegions}
                values={regionValues}
                selected={selectedRegions}
                onToggle={toggleRegionSel}
              />
            )}

            {showTarget && (
              <Field label={region ? 'Hedef liste (seçili bölgeler buraya)' : 'Hedef liste'}>
                <select className="input-base" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {lists.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name} ({l.count})
                    </option>
                  ))}
                  <option value="new">+ Yeni liste</option>
                </select>
              </Field>
            )}

            {showTarget && target === 'new' && (
              <TextInput placeholder="Yeni liste adı" value={newName} onChange={(e) => setNewName(e.target.value)} />
            )}

            <div className="mt-2 text-xs text-slate-400">
              İlk satırlar: {flow.preview.sample.slice(0, 2).map((r) => r[phone]).filter(Boolean).join(', ') || '—'}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button onClick={run} disabled={busy || !canRun}>
              {busy ? <Spinner /> : <Upload size={16} />} İçe aktar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function RegionPanel({
  mode,
  setMode,
  loading,
  values,
  selected,
  onToggle
}: {
  mode: 'auto' | 'manual'
  setMode: (m: 'auto' | 'manual') => void
  loading: boolean
  values: DistinctValue[]
  selected: string[]
  onToggle: (val: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-200/60 p-1 dark:bg-white/5 w-fit">
        <button
          onClick={() => setMode('auto')}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition',
            mode === 'auto' ? 'bg-white text-slate-800 shadow-sm dark:bg-[#111b21] dark:text-white' : 'text-slate-500'
          )}
        >
          Otomatik (her bölge ayrı liste)
        </button>
        <button
          onClick={() => setMode('manual')}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition',
            mode === 'manual' ? 'bg-white text-slate-800 shadow-sm dark:bg-[#111b21] dark:text-white' : 'text-slate-500'
          )}
        >
          Manuel (seçili bölgeler)
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
          <Spinner /> Bölgeler taranıyor…
        </div>
      ) : values.length === 0 ? (
        <div className="py-2 text-sm text-slate-400">Bu sütunda bölge bulunamadı</div>
      ) : mode === 'auto' ? (
        <div>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            <b>{values.length}</b> liste oluşturulacak (bölge adıyla):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <Badge key={v.value}>
                {v.value} · {v.count}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            İçe aktarılacak bölgeleri seç ({selected.length} seçili):
          </p>
          <div className="flex flex-wrap gap-2">
            {values.map((v) => {
              const on = selected.includes(v.value)
              return (
                <button
                  key={v.value}
                  onClick={() => onToggle(v.value)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs transition',
                    on
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'border-slate-300 text-slate-500 dark:border-white/10'
                  )}
                >
                  {on ? '✓ ' : ''}
                  {v.value} · {v.count}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function OptOutPanel({ optouts, reload }: { optouts: OptOutEntry[]; reload: () => void }) {
  const [phone, setPhone] = useState('')
  const add = async () => {
    if (!phone.trim()) return
    await octo.optout.add(phone.replace(/\D/g, ''))
    setPhone('')
    reload()
  }
  const remove = async (p: string) => {
    await octo.optout.remove(p)
    reload()
  }
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
        <UserX size={16} /> Engellenen numaralar — bunlara asla mesaj gönderilmez
      </div>
      <div className="mb-4 flex gap-2">
        <TextInput placeholder="905551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button onClick={add}>
          <Ban size={16} /> Engelle
        </Button>
      </div>
      {optouts.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">Engellenen numara yok</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {optouts.map((o) => (
            <div key={o.phone} className="flex items-center justify-between py-2 text-sm">
              <span className="tabular-nums">{displayPhone(o.phone)}</span>
              <div className="flex items-center gap-3">
                <Badge tone={o.reason === 'user_reply' ? 'amber' : 'slate'}>
                  {o.reason === 'user_reply' ? 'Yanıt verdi' : 'Manuel'}
                </Badge>
                <button onClick={() => remove(o.phone)} className="text-slate-400 hover:text-rose-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
