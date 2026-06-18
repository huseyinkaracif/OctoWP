import { LayoutDashboard, Smartphone, Users, Send, Settings, ScrollText } from 'lucide-react'
import type { WAStatus } from '@shared/types'
import { cn, displayPhone } from '../lib/format'

export type NavKey =
  | 'dashboard'
  | 'account'
  | 'contacts'
  | 'campaigns'
  | 'settings'
  | 'logs'

const items: { key: NavKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
  { key: 'account', label: 'Hesap', icon: Smartphone },
  { key: 'contacts', label: 'Rehber', icon: Users },
  { key: 'campaigns', label: 'Kampanyalar', icon: Send },
  { key: 'settings', label: 'Ayarlar', icon: Settings },
  { key: 'logs', label: 'Loglar', icon: ScrollText }
]

function statusTone(state: WAStatus['state']) {
  if (state === 'connected') return { dot: 'bg-brand-500', text: 'Bağlı' }
  if (state === 'qr' || state === 'connecting') return { dot: 'bg-amber-400 animate-pulse', text: 'Bekliyor' }
  return { dot: 'bg-slate-400', text: 'Bağlı değil' }
}

export function Sidebar({
  route,
  setRoute,
  wa
}: {
  route: NavKey
  setRoute: (k: NavKey) => void
  wa: WAStatus
}) {
  const s = statusTone(wa.state)
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-white/10 dark:bg-[#111b21]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-sm">
          🐙
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">OctoWP</div>
          <div className="text-[11px] text-slate-400">WhatsApp Gönderim</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ key, label, icon: Icon }) => {
          const active = route === key
          return (
            <button
              key={key}
              onClick={() => setRoute(key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
              )}
            >
              <Icon size={18} className={active ? 'text-brand-600 dark:text-brand-400' : ''} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="m-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/10">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} />
          <span className="text-slate-600 dark:text-slate-300">{s.text}</span>
        </div>
        {wa.state === 'connected' && wa.name && (
          <div className="mt-0.5 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{wa.name}</div>
        )}
        {wa.phone && <div className="text-[11px] text-slate-400">{displayPhone(wa.phone)}</div>}
      </div>
    </aside>
  )
}
