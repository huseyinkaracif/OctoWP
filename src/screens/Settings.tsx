import { useEffect, useState, type ChangeEvent } from 'react'
import { Save, ShieldCheck, Gauge, Clock, Database, Upload, AlertTriangle } from 'lucide-react'
import type { Settings as SettingsT, RiskPresetName } from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { usePrompt } from '../lib/dialog'
import { Card, SectionTitle, Button, Field, NumberInput, TextInput, Spinner } from '../components/ui'
import { cn } from '../lib/format'

const presetMeta: { key: RiskPresetName; label: string; desc: string }[] = [
  { key: 'balanced', label: 'Dengeli', desc: 'Önerilen: hız + güvenlik dengesi' },
  { key: 'conservative', label: 'Konservatif', desc: 'En düşük ban riski, en yavaş' },
  { key: 'aggressive', label: 'Agresif', desc: 'Hızlı ama riskli' }
]

export function Settings() {
  const [s, setS] = useState<SettingsT | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const toast = useToast()
  const prompt = usePrompt()

  useEffect(() => {
    octo.settings.get().then(setS)
  }, [])

  if (!s) return <div className="p-6 text-slate-400">Yükleniyor…</div>

  const set = (patch: Partial<SettingsT>) => {
    setS({ ...s, ...patch })
    setSaved(false)
  }
  const num = (k: keyof SettingsT) => (e: ChangeEvent<HTMLInputElement>) =>
    set({ [k]: Number(e.target.value) } as Partial<SettingsT>)

  const applyPreset = async (name: RiskPresetName) => {
    const next = await octo.settings.applyPreset(name)
    setS(next)
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    try {
      const next = await octo.settings.set(s)
      setS(next)
      setSaved(true)
      toast('Ayarlar kaydedildi', 'success')
    } finally {
      setBusy(false)
    }
  }

  const exportBackup = async () => {
    const pw = await prompt({
      title: 'Yedek al',
      label: 'Yedeği şifrelemek için parola',
      password: true
    })
    if (!pw) return
    try {
      const path = await octo.backup.export(pw)
      if (path) toast('Yedek kaydedildi', 'success')
    } catch {
      toast('Yedek alınamadı', 'error')
    }
  }
  const importBackup = async () => {
    const f = await octo.dialog.openFile([{ name: 'OctoWP Yedek', extensions: ['octw'] }])
    if (!f) return
    const pw = await prompt({ title: 'Yedek yükle', label: 'Yedek parolası', password: true })
    if (!pw) return
    if (window.confirm('Mevcut veriler bu yedekle değiştirilecek ve uygulama yeniden başlayacak. Devam?')) {
      try {
        await octo.backup.import(f, pw)
      } catch {
        toast('Yedek yüklenemedi (parola yanlış olabilir)', 'error')
      }
    }
  }

  const lowDelay = s.msgDelayMin < 5

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle
        title="Ayarlar"
        subtitle="Risk profili, gönderim hızı ve güvenlik"
        action={
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save size={16} />} {saved ? 'Kaydedildi' : 'Kaydet'}
          </Button>
        }
      />

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
          <ShieldCheck size={16} /> Risk profili
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {presetMeta.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={cn(
                'rounded-xl border p-4 text-left transition',
                s.preset === p.key
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
              )}
            >
              <div className="font-medium">{p.label}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{p.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {lowDelay && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={16} /> Çok düşük gecikme (&lt;5 sn) Cloud API hız limitine takılma riskini artırır.
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
          <Gauge size={16} /> Gönderim hızı (saniye)
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Mesaj min"><NumberInput value={s.msgDelayMin} onChange={num('msgDelayMin')} /></Field>
          <Field label="Mesaj max"><NumberInput value={s.msgDelayMax} onChange={num('msgDelayMax')} /></Field>
          <Field label="Medya min"><NumberInput value={s.mediaDelayMin} onChange={num('mediaDelayMin')} /></Field>
          <Field label="Medya max"><NumberInput value={s.mediaDelayMax} onChange={num('mediaDelayMax')} /></Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Mola: her N mesajda"><NumberInput value={s.batchEveryMin} onChange={num('batchEveryMin')} /></Field>
          <Field label="… max"><NumberInput value={s.batchEveryMax} onChange={num('batchEveryMax')} /></Field>
          <Field label="Mola süresi min (sn)"><NumberInput value={s.batchPauseMin} onChange={num('batchPauseMin')} /></Field>
          <Field label="… max (sn)"><NumberInput value={s.batchPauseMax} onChange={num('batchPauseMax')} /></Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
          <Clock size={16} /> Günlük limit ve aktif saat
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Günlük gönderim limiti" hint="Meta mesajlaşma kademen (250 → 1K → 10K…)"><NumberInput value={s.dailyCapMax} onChange={num('dailyCapMax')} /></Field>
          <Field label="Aktif saat (başlangıç)" hint="0-23"><NumberInput value={s.activeFrom} onChange={num('activeFrom')} /></Field>
          <Field label="Aktif saat (bitiş)" hint="0=24s"><NumberInput value={s.activeTo} onChange={num('activeTo')} /></Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 text-sm font-medium text-slate-500">Genel</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Varsayılan ülke kodu" hint="Sadece rakam, ör. 90">
            <TextInput value={s.defaultCountryCode} onChange={(e) => set({ defaultCountryCode: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Opt-out kelimeleri" hint="Virgülle ayır">
            <TextInput
              value={s.optOutKeywords.join(', ')}
              onChange={(e) => set({ optOutKeywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
          <Database size={16} /> Yedekleme (şifreli)
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportBackup}>
            <Database size={16} /> Yedek al
          </Button>
          <Button variant="outline" onClick={importBackup}>
            <Upload size={16} /> Yedek yükle
          </Button>
        </div>
      </Card>
    </div>
  )
}
