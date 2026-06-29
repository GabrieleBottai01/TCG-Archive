'use client'

import { GAME_LABELS, ITEM_TYPE_LABELS, CONDITION_LABELS } from '@/lib/labels'
import type { Filters } from '@/lib/value'

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const inputClass = 'rounded border border-border bg-card px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Game filter */}
      <select
        className={inputClass}
        value={filters.game ?? ''}
        onChange={(e) => onChange({ ...filters, game: e.target.value || undefined })}
        aria-label="Filtra per gioco"
      >
        <option value="">Tutti i giochi</option>
        {Object.entries(GAME_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      {/* Item type filter */}
      <select
        className={inputClass}
        value={filters.itemType ?? ''}
        onChange={(e) => onChange({ ...filters, itemType: e.target.value || undefined })}
        aria-label="Filtra per tipo"
      >
        <option value="">Tutti i tipi</option>
        {Object.entries(ITEM_TYPE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      {/* Condition filter */}
      <select
        className={inputClass}
        value={filters.condition ?? ''}
        onChange={(e) => onChange({ ...filters, condition: e.target.value || undefined })}
        aria-label="Filtra per condizione"
      >
        <option value="">Tutte le condizioni</option>
        {Object.entries(CONDITION_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      {/* Free-text search */}
      <input
        type="text"
        className={inputClass}
        placeholder="Cerca per nome o set…"
        value={filters.search ?? ''}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        aria-label="Cerca articolo"
      />
    </div>
  )
}
