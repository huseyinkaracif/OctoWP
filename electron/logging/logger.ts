import type { LogEntry, LogLevel } from '../../shared/types'

let sink: ((e: LogEntry) => void) | null = null
const buffer: LogEntry[] = []

/** Install the persistent sink (DB). Flushes anything buffered before init. */
export function setLogSink(fn: (e: LogEntry) => void): void {
  sink = fn
  for (const e of buffer) fn(e)
  buffer.length = 0
}

function stringify(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack || a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  const message = args.map(stringify).join(' ')
  const entry: LogEntry = { ts: Date.now(), level, scope, message }
  ;(level === 'error' ? console.error : console.log)(`[${scope}]`, message)
  if (sink) sink(entry)
  else {
    buffer.push(entry)
    if (buffer.length > 1000) buffer.shift()
  }
}

export const logger = {
  info: (scope: string, ...args: unknown[]) => emit('info', scope, args),
  warn: (scope: string, ...args: unknown[]) => emit('warn', scope, args),
  error: (scope: string, ...args: unknown[]) => emit('error', scope, args)
}
