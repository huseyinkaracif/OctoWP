import { useEffect, useState } from 'react'
import { UsersRound, RefreshCw, Download, Smartphone } from 'lucide-react'
import type { WAStatus, WAGroup } from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, EmptyState, TextInput, Field, Spinner } from '../components/ui'
import { cn } from '../lib/format'

export function Groups({ wa }: { wa: WAStatus }) {
  const [groups, setGroups] = useState<WAGroup[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [listName, setListName] = useState('Grup Numaraları')
  const [loading, setLoading] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const toast = useToast()

  const connected = wa.state === 'connected'

  const load = async () => {
    setLoading(true)
    try {
      setGroups(await octo.groups.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (connected) load()
    else setGroups(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const collect = async () => {
    if (selected.size === 0) return
    setCollecting(true)
    try {
      const res = await octo.groups.collect([...selected], listName.trim() || 'Grup Numaraları')
      if (res.total === 0) {
        toast('Numara bulunamadı — üyeler gizli numaralı (LID) olabilir. Detay: Loglar.', 'info')
      } else {
        toast(`${res.imported} yeni numara eklendi (${res.total} bulundu)`, 'success')
        setSelected(new Set())
      }
    } catch {
      toast('Numara toplanamadı', 'error')
    } finally {
      setCollecting(false)
    }
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionTitle title="Gruplar" subtitle="WhatsApp gruplarından numara topla" />
        <EmptyState
          icon={<Smartphone size={28} />}
          title="Önce WhatsApp'a bağlan"
          subtitle="Grupları görebilmek için Hesap ekranından numaranı bağlamalısın."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        title="Gruplar"
        subtitle="Üye olduğun gruplardan numaraları bir listeye topla"
        action={
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw size={15} />} Yenile
          </Button>
        }
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[200px]">
          <Field label="Hedef liste adı">
            <TextInput value={listName} onChange={(e) => setListName(e.target.value)} />
          </Field>
        </div>
        <Button onClick={collect} disabled={selected.size === 0 || collecting}>
          {collecting ? <Spinner /> : <Download size={16} />} {selected.size} gruptan topla
        </Button>
      </Card>

      <Card className="overflow-hidden">
        {loading && groups === null ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Spinner /> Gruplar yükleniyor…
          </div>
        ) : !groups || groups.length === 0 ? (
          <EmptyState icon={<UsersRound size={26} />} title="Grup bulunamadı" subtitle="Bu numarayla bir gruba üye değilsin ya da senkron tamamlanmadı." />
        ) : (
          <div className="max-h-[58vh] overflow-y-auto">
            {groups.map((g) => {
              const on = selected.has(g.id)
              return (
                <button
                  key={g.id}
                  onClick={() => toggle(g.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-0 dark:border-white/5',
                    on ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-md border',
                        on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 dark:border-white/20'
                      )}
                    >
                      {on && '✓'}
                    </span>
                    <span className="font-medium">{g.subject}</span>
                  </div>
                  <Badge>{g.size} üye</Badge>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Not: Yalnızca üyesi olduğun grupların numaralarına erişebilirsin. Rıza olmadan toplu mesaj
        ban riskini artırır.
      </p>
    </div>
  )
}
