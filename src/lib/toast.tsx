import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cn } from './format'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {})

let nextId = 1

const styles: Record<ToastKind, string> = {
  success: 'bg-brand-600 text-white',
  error: 'bg-rose-600 text-white',
  info: 'bg-slate-800 text-white dark:bg-slate-700'
}
const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.kind]
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg',
                styles[t.kind]
              )}
            >
              <Icon size={16} />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
