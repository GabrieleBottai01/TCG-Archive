import React from 'react'

interface SummaryCardProps {
  label: string
  children: React.ReactNode
}

export function SummaryCard({ label, children }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 text-xl font-semibold text-gray-900">{children}</div>
    </div>
  )
}
