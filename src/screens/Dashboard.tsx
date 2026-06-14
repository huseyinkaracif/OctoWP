import { useEffect, useState } from 'react'
import { Smartphone, Send, Users, Activity, ArrowRight } from 'lucide-react'
import type { WAStatus, DashboardStats, Campaign } from '@shared/types'
import { octo } from '../lib/ipc'
import { Card, StatCard, SectionTitle, ProgressBar, Button, Badge, EmptyState } from '../components/ui'
import { pct } from '../lib/format'
import type { NavKey } from '../components/Sidebar'

export function statusBadge(status: Campaign['status']) {
  switch (status) {
    case 'running':
      return <Badge tone="green">Çalışıyor</Badge>
    case 'scheduled':
      return <Badge tone="blue">Zamanlandı</Badge>
    case 'paused':
      return <Badge tone="amber">Duraklatıldı</Badge>
    case 'halted':
      return <Badge tone="red">Durduruldu</Badge>
    case 'done':
      return <Badge tone="blue">Tamamlandı</Badge>
    default:
      return <Badge>Taslak</Badge>
  }
}

export function Dashboard({ wa, go }: { wa: WAStatus; go: (k: NavKey) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [camps, setCamps] = useState<Campaign[]>([])

  const refresh = () => {
    octo.stats.dashboard().then(setStats)
    octo.campaigns.all().then(setCamps)
  }
  useEffect(() => {
    refresh()
    return octo.campaigns.onProgress(() => refresh())
  }, [])

  const active =
    camps.find((c) => c.status === 'running') ??
    camps.find((c) => c.status === 'paused' || c.status === 'halted')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle title="Genel Bakış" subtitle="Hesap durumu, günlük limit ve aktif kampanya" />

      {wa.state !== 'connected' && (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15">
              <Smartphone size={20} />
            </div>
            <div>
              <div className="font-medium">WhatsApp bağlı değil</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Gönderim yapmak için önce numaranı bağla.
              </div>
            </div>
          </div>
          <Button onClick={() => go('account')}>
            Hesabı bağla <ArrowRight size={16} />
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Bugün gönderilen"
          value={`${stats?.sentToday ?? 0} / ${stats?.dailyCap ?? '—'}`}
          hint="Günlük güvenli limit"
          accent
        />
        <StatCard label="Toplam kişi" value={stats?.contacts ?? 0} hint="Rehberdeki numara" />
        <StatCard label="Aktif kampanya" value={stats?.running ?? 0} hint="Şu an çalışan" />
      </div>

      {active ? (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-brand-600" />
              <span className="font-medium">{active.name}</span>
              {statusBadge(active.status)}
            </div>
            <Button variant="outline" onClick={() => go('campaigns')}>
              Detay
            </Button>
          </div>
          <ProgressBar value={pct(active.stats.sent + active.stats.failed + active.stats.skipped + active.stats.optout, active.stats.total)} />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Counter label="Gönderildi" value={active.stats.sent} tone="text-brand-600" />
            <Counter label="İletildi" value={active.stats.delivered} tone="text-sky-500" />
            <Counter label="Okundu" value={active.stats.read} tone="text-indigo-500" />
            <Counter label="Yanıtladı" value={active.stats.replied} tone="text-brand-600" />
            <Counter label="Bekleyen" value={active.stats.pending} tone="text-slate-500" />
            <Counter label="Başarısız" value={active.stats.failed} tone="text-rose-500" />
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<Send size={28} />}
          title="Aktif kampanya yok"
          subtitle="Yeni bir toplu mesaj kampanyası oluştur ve güvenli gönderime başla."
          action={<Button onClick={() => go('campaigns')}>Kampanya oluştur</Button>}
        />
      )}

      {camps.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
            <Users size={16} /> Son kampanyalar
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {camps.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <span className="font-medium">{c.name}</span>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="tabular-nums">
                    {c.stats.sent}/{c.stats.total}
                  </span>
                  {statusBadge(c.status)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-base font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </span>
  )
}
