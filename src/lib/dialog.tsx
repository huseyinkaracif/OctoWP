import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Card, Button, TextInput } from '../components/ui'

interface PromptOpts {
  title: string
  label?: string
  placeholder?: string
  password?: boolean
  defaultValue?: string
  okText?: string
}
type Resolver = (v: string | null) => void

const DialogCtx = createContext<(opts: PromptOpts) => Promise<string | null>>(async () => null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<PromptOpts | null>(null)
  const [value, setValue] = useState('')
  const resolver = useRef<Resolver | null>(null)

  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((res) => {
        resolver.current = res
        setValue(o.defaultValue ?? '')
        setOpts(o)
      }),
    []
  )

  const close = (v: string | null) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
    setValue('')
  }

  return (
    <DialogCtx.Provider value={prompt}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(null)}
        >
          <Card className="w-full max-w-sm p-5">
            <div onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold">{opts.title}</h3>
              {opts.label && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{opts.label}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  close(value)
                }}
              >
                <TextInput
                  autoFocus
                  type={opts.password ? 'password' : 'text'}
                  placeholder={opts.placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-3"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => close(null)}>
                    Vazgeç
                  </Button>
                  <Button type="submit">{opts.okText ?? 'Tamam'}</Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}
    </DialogCtx.Provider>
  )
}

export const usePrompt = () => useContext(DialogCtx)
