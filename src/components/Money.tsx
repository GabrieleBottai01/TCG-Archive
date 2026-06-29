import { formatEUR } from '@/lib/format'

export function Money({ value, signed = false }: { value: number; signed?: boolean }) {
  // Break-even (0) is neutral; only true gains are green and losses red.
  const cls = signed
    ? value > 0
      ? 'text-success'
      : value < 0
        ? 'text-danger'
        : 'text-muted'
    : ''
  const text = signed && value > 0 ? `+${formatEUR(value)}` : formatEUR(value)
  return <span className={cls}>{text}</span>
}
