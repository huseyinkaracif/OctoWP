import { Moon, Sun } from 'lucide-react'
import type { WAStatus } from '@shared/types'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/format'
import { displayPhone } from '../lib/format'

function pill(state: WAStatus['state']) {
  if (state === 'connected') return { dot: 'bg-brand-500', label: 'Bağlı', tone: 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10' }
  if (state === 'qr' || state === 'connecting')
    return { dot: 'bg-amber-400 animate-pulse', label: 'Bekliyor', tone: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10' }
  return { dot: 'bg-slate-400', label: 'Bağlı değil', tone: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5' }
}

export function TopBar({ wa }: { wa: WAStatus }) {
  const { theme, toggle } = useTheme()
  const p = pill(wa.state)
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 dark:border-white/10 dark:bg-[#111b21]">
      <div className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium', p.tone)}>
        <span className={cn('h-2 w-2 rounded-full', p.dot)} />
        {p.label}
        {wa.state === 'connected' && wa.name && (
          <span className="font-semibold">· {wa.name}</span>
        )}
        {wa.phone && <span className="text-slate-400 dark:text-slate-500">· {displayPhone(wa.phone)}</span>}
      </div>
      <button
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
        title="Tema değiştir"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  )
}
