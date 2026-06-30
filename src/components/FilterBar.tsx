'use client'

import { useState } from 'react'
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
  const [advOpen, setAdvOpen] = useState(false)
  const inputClass = 'rounded border border-border bg-card px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex flex-col gap-2">
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

        {/* Advanced toggle */}
        <button
          type="button"
          className="text-sm text-muted underline underline-offset-2 hover:text-fg transition-colors"
          aria-expanded={advOpen}
          aria-controls="adv-filters"
          onClick={() => setAdvOpen((o) => !o)}
        >
          {t('adv_toggle')}
        </button>
      </div>

      {/* Advanced filters row */}
      {advOpen && (
        <div id="adv-filters" className="flex flex-wrap gap-2 items-center">
          {/* Min value */}
          <input
            type="number"
            className={inputClass}
            placeholder={t('adv_minValue')}
            aria-label={t('adv_minValue')}
            value={filters.minValue ?? ''}
            onChange={(e) =>
              onChange({ ...filters, minValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />

          {/* Max value */}
          <input
            type="number"
            className={inputClass}
            placeholder={t('adv_maxValue')}
            aria-label={t('adv_maxValue')}
            value={filters.maxValue ?? ''}
            onChange={(e) =>
              onChange({ ...filters, maxValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />

          {/* P/L select */}
          <select
            className={inputClass}
            aria-label={t('adv_pl')}
            value={filters.pl ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                pl: e.target.value === '' ? undefined : (e.target.value as 'gain' | 'loss'),
              })
            }
          >
            <option value="">{t('adv_pl_all')}</option>
            <option value="gain">{t('adv_pl_gain')}</option>
            <option value="loss">{t('adv_pl_loss')}</option>
          </select>

          {/* Set name */}
          <input
            type="text"
            className={inputClass}
            placeholder={t('adv_set')}
            aria-label={t('adv_set')}
            value={filters.setName ?? ''}
            onChange={(e) => onChange({ ...filters, setName: e.target.value || undefined })}
          />

          {/* Language */}
          <input
            type="text"
            className={inputClass}
            placeholder={t('adv_language')}
            aria-label={t('adv_language')}
            value={filters.language ?? ''}
            onChange={(e) => onChange({ ...filters, language: e.target.value || undefined })}
          />

          {/* Reset */}
          <button
            type="button"
            className="rounded border border-primary/40 bg-primary-soft px-3 py-1 text-sm font-medium text-primary hover:bg-primary/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange({})}
          >
            {t('filter_reset')}
          </button>
        </div>
      )}
    </div>
  )
}
