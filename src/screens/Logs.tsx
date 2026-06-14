import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Lock, Search, Trash2, RefreshCw, ShieldAlert } from 'lucide-react'
import type { LogEntry, LogLevel } from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, TextInput, EmptyState, Spinner } from '../components/ui'

const ADMIN_PIN = '1453'

const levelTone: Record<LogLevel, Parameters<typeof Badge>[0]['tone']> = {
  info: 'slate',
  warn: 'amber',
  error: 'red'
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('tr-TR', { hour12: false })
}

export function Logs() {
  const [authed, setAuthed] = useState(false)

  if (!authed) return <PinGate onOk={() => setAuthed(true)} />
  return <LogViewer />
}

function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) onOk()
    else {
      setErr(true)
      setPin('')
    }
  }
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-xs p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5">
          <Lock size={22} />
        </div>
        <h2 className="text-base font-semibold">Yönetici girişi</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Log ekranı için PIN gir</p>
        <form onSubmit={submit} className="mt-4">
          <TextInput
            autoFocus
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setErr(false)
            }}
            placeholder="••••"
            className={err ? 'border-rose-500 text-center tracking-[0.5em]' : 'text-center tracking-[0.5em]'}
          />
          {err && <p className="mt-2 text-xs text-rose-500">Hatalı PIN</p>}
          <Button type="submit" className="mt-4 w-full">
            Giriş
          </Button>
        </form>
      </Card>
    </div>
  )
}

function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const toast = useToast()

  const load = useCallback(() => {
    octo.logs.list(search || undefined).then(setLogs)
  }, [search])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [load])

  const clear = async () => {
    if (!window.confirm('Tüm loglar silinecek. Devam?')) return
    await octo.logs.clear()
    toast('Loglar temizlendi', 'success')
    load()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionTitle
        title="Loglar"
        subtitle="Uygulama olayları, hatalar ve takılmalar"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw size={15} /> Yenile
            </Button>
            <Button variant="danger" onClick={clear}>
              <Trash2 size={15} /> Temizle
            </Button>
          </div>
        }
      />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <TextInput
          placeholder="Loglarda ara (mesaj, kapsam)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {logs === null ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Spinner /> Yükleniyor…
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<ShieldAlert size={26} />} title={search ? 'Eşleşen log yok' : 'Henüz log yok'} />
        ) : (
          <div className="max-h-[64vh] overflow-y-auto font-mono text-xs">
            <table className="w-full">
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {logs.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmtTime(l.ts)}</td>
                    <td className="px-2 py-2">
                      <Badge tone={levelTone[l.level]}>{l.level}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">{l.scope}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 break-all">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Otomatik yenileniyor (3 sn). Son {logs?.length ?? 0} kayıt gösteriliyor.
      </p>
    </div>
  )
}
