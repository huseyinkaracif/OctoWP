import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/format'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger'
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm',
  outline:
    'border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200',
  ghost: 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
}

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        btnVariants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    green: 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
  }
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function StatCard({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <Card className={cn('p-5', accent && 'ring-1 ring-brand-500/30')}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </Card>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input-base', props.className)} />
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={cn('input-base', props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input-base resize-none', props.className)} />
}

export function EmptyState({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-white/10 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300 dark:text-slate-600">{icon}</div>}
      <div className="font-medium">{title}</div>
      {subtitle && <div className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  )
}
