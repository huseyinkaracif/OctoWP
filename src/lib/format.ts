export function displayPhone(phone: string): string {
  if (!phone) return ''
  if (phone.length >= 12) {
    const cc = phone.slice(0, phone.length - 10)
    const rest = phone.slice(-10).replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')
    return `+${cc} ${rest}`
  }
  return `+${phone}`
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
