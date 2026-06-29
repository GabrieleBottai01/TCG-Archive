interface SummaryCardProps {
  label: string
  children: React.ReactNode
}

export function SummaryCard({ label, children }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1.5 text-xl font-semibold text-fg">{children}</div>
    </div>
  )
}
