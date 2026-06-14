import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Smartphone, LogOut, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { WAStatus } from '@shared/types'
import { octo } from '../lib/ipc'
import { Card, SectionTitle, Button, Spinner } from '../components/ui'
import { displayPhone } from '../lib/format'

export function Account({ wa }: { wa: WAStatus }) {
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (wa.qr) {
      QRCode.toDataURL(wa.qr, { width: 260, margin: 1 }).then(setQrImg).catch(() => setQrImg(null))
    } else {
      setQrImg(null)
    }
  }, [wa.qr])

  const connect = async () => {
    setBusy(true)
    try {
      await octo.wa.connect()
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async () => {
    setBusy(true)
    try {
      await octo.wa.disconnect()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionTitle title="Hesap" subtitle="WhatsApp numaranı QR ile bağla" />

      {wa.error && wa.state !== 'connected' && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={16} /> {wa.error}
        </div>
      )}

      {wa.state === 'connected' ? (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15">
              <CheckCircle2 size={28} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold">{wa.name || 'WhatsApp Hesabı'}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {wa.phone ? displayPhone(wa.phone) : 'Bağlı'}
              </div>
            </div>
            <Button variant="danger" onClick={disconnect} disabled={busy}>
              {busy ? <Spinner /> : <LogOut size={16} />} Bağlantıyı kes
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-black/20">
              {qrImg ? (
                <img src={qrImg} alt="WhatsApp QR" className="rounded-xl bg-white p-2" />
              ) : wa.state === 'connecting' ? (
                <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
                  <Spinner className="h-6 w-6 text-brand-500" />
                  <span className="text-sm">QR oluşturuluyor…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
                  <Smartphone size={40} />
                  <span className="text-sm">Bağlanmak için QR oluştur</span>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <div className="font-medium">Nasıl bağlanır?</div>
                <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>1. Telefonunda WhatsApp&apos;ı aç.</li>
                  <li>2. <b>Ayarlar → Bağlı Cihazlar</b>&apos;a gir.</li>
                  <li>3. <b>Cihaz Bağla</b>&apos;ya dokun.</li>
                  <li>4. Buradaki QR kodu okut.</li>
                </ol>
              </div>
              <div className="mt-5">
                <Button onClick={connect} disabled={busy || wa.state === 'connecting'}>
                  {busy || wa.state === 'connecting' ? <Spinner /> : <RefreshCw size={16} />}
                  {wa.state === 'qr' ? 'Yeni QR' : 'Bağlan'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Not: Resmi olmayan bağlantı WhatsApp kullanım şartlarına aykırıdır; numara ban riski her zaman
        vardır. Güvenli gönderim ayarlarını kullan.
      </p>
    </div>
  )
}
