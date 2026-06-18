import { useEffect, useState } from 'react'
import { KeyRound, CheckCircle2, AlertTriangle, ShieldCheck, Save } from 'lucide-react'
import type { WAStatus, Settings as SettingsT, CloudVerifyResult } from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Field, TextInput, Spinner } from '../components/ui'
import { displayPhone } from '../lib/format'

export function Account({ wa }: { wa: WAStatus }) {
  const [s, setS] = useState<SettingsT | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<CloudVerifyResult | null>(null)
  const toast = useToast()

  useEffect(() => {
    octo.settings.get().then(setS)
  }, [])

  if (!s) return <div className="p-6 text-slate-400">Yükleniyor…</div>

  const set = (patch: Partial<SettingsT>) => setS({ ...s, ...patch })

  const save = async () => {
    setBusy(true)
    try {
      const next = await octo.settings.set({
        waToken: s.waToken.trim(),
        phoneNumberId: s.phoneNumberId.trim(),
        wabaId: s.wabaId.trim(),
        graphVersion: s.graphVersion.trim() || 'v21.0'
      })
      setS(next)
      toast('Kimlik bilgileri kaydedildi', 'success')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    await save()
    setVerifying(true)
    try {
      const res = await octo.cloud.verify()
      setResult(res)
      toast(res.ok ? 'Bağlantı doğrulandı' : `Doğrulanamadı: ${res.error ?? ''}`, res.ok ? 'success' : 'error')
    } finally {
      setVerifying(false)
    }
  }

  const connected = wa.state === 'connected'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionTitle title="Hesap" subtitle="WhatsApp Cloud API (resmî) kimlik bilgileri" />

      {connected && (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15">
              <CheckCircle2 size={28} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold">{wa.name || 'WhatsApp İşletme'}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {wa.phone ? displayPhone(wa.phone) : 'Kimlik bilgileri kayıtlı'}
              </div>
            </div>
            {result?.quality && (
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
                Kalite: {result.quality}
              </span>
            )}
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <KeyRound size={16} /> Cloud API kimlik bilgileri
        </div>

        <Field label="Access Token" hint="Meta System User süresiz token">
          <TextInput
            type="password"
            placeholder="EAAG…"
            value={s.waToken}
            onChange={(e) => set({ waToken: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone Number ID">
            <TextInput placeholder="1234567890" value={s.phoneNumberId} onChange={(e) => set({ phoneNumberId: e.target.value })} />
          </Field>
          <Field label="WhatsApp Business Account ID (WABA)">
            <TextInput placeholder="1234567890" value={s.wabaId} onChange={(e) => set({ wabaId: e.target.value })} />
          </Field>
        </div>
        <Field label="Graph API sürümü" hint="Varsayılan v21.0">
          <TextInput placeholder="v21.0" value={s.graphVersion} onChange={(e) => set({ graphVersion: e.target.value })} />
        </Field>

        {result && !result.ok && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle size={16} /> {result.error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save size={16} />} Kaydet
          </Button>
          <Button onClick={verify} disabled={verifying || !s.waToken || !s.phoneNumberId}>
            {verifying ? <Spinner /> : <ShieldCheck size={16} />} Bağlantıyı test et
          </Button>
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Kurulum adımları için <b>docs/whatsapp-cloud-api-setup.md</b> dosyasına bak. Pazarlama mesajları
        için Meta'da onaylı şablon gerekir; mesaj başına ücret ve kademeli günlük limit uygulanır.
      </p>
    </div>
  )
}
