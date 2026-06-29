'use client'

import { useT, CONDITION_LABELS } from '@/lib/i18n'
import type { Filters } from '@/lib/value'

// Enumerate valid keys; labels come from i18n (t('game_*') / t('type_*'))
const GAME_KEYS = ['POKEMON', 'MAGIC', 'YUGIOH', 'ONEPIECE', 'OTHER'] as const
const TYPE_KEYS = ['RAW', 'GRADED', 'SEALED'] as const

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const t = useT()
  const inputClass = 'rounded border border-border bg-card px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Game filter */}
      <select
        className={inputClass}
        value={filters.game ?? ''}
        onChange={(e) => onChange({ ...filters, game: e.target.value || undefined })}
        aria-label={t('filter_byGame')}
      >
        <option value="">{t('filter_allGames')}</option>
        {GAME_KEYS.map((key) => (
          <option key={key} value={key}>{t('game_' + key)}</option>
        ))}
      </select>

      {/* Item type filter */}
      <select
        className={inputClass}
        value={filters.itemType ?? ''}
        onChange={(e) => onChange({ ...filters, itemType: e.target.value || undefined })}
        aria-label={t('filter_byType')}
      >
        <option value="">{t('filter_allTypes')}</option>
        {TYPE_KEYS.map((key) => (
          <option key={key} value={key}>{t('type_' + key)}</option>
        ))}
      </select>

      {/* Condition filter */}
      <select
        className={inputClass}
        value={filters.condition ?? ''}
        onChange={(e) => onChange({ ...filters, condition: e.target.value || undefined })}
        aria-label={t('filter_byCondition')}
      >
        <option value="">{t('filter_allConditions')}</option>
        {Object.entries(CONDITION_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      {/* Free-text search */}
      <input
        type="text"
        className={inputClass}
        placeholder={t('filter_search')}
        value={filters.search ?? ''}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        aria-label={t('filter_searchAria')}
      />
    </div>
  )
}
