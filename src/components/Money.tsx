import { formatEUR } from '@/lib/format'

export function Money({ value, signed = false }: { value: number; signed?: boolean }) {
  const cls = signed ? (value >= 0 ? 'text-emerald-600' : 'text-red-600') : ''
  const text = signed && value > 0 ? `+${formatEUR(value)}` : formatEUR(value)
  return <span className={cls}>{text}</span>
}
