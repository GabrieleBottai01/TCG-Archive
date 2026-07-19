'use client'

import { useState, useSyncExternalStore } from 'react'
import { filterItems, sortItems, collectionTotals, itemDifference, type Filters, type Sort, type SortKey } from '@/lib/value'
import { itemsToCsv, type CsvLabels } from '@/lib/csv'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { FilterBar } from '@/components/FilterBar'
import { useT, CONDITION_LABELS } from '@/lib/i18n'
import { ItemFormModal } from '@/components/ItemFormModal'
import { ItemImage } from '@/components/ItemImage'
import { GameBadge } from '@/components/GameBadge'
import { PriceSourceChip } from '@/components/PriceSourceChip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { effectiveValue, type EuReference } from '@/lib/priceSource'

// Mirrors the Prisma Item shape (plain object, serialized from server)
export type PlainItem = {
  id: string
  game: string
  itemType: string
  name: string
  setName: string | null
  cardNumber: string | null
  language: string | null
  externalId: string | null
  priceQuery: string | null
  cardtraderBlueprintId: number | null
  autoPriceSource: string | null
  imageUrl: string | null
  condition: string | null
  gradingCompany: string | null
  grade: string | null
  quantity: number
  purchasePrice: number
  marketValue: number
  marketValueSource: string | null
  marketValueUpdatedAt: string | null
  notes: string | null
  userId: string
  createdAt: string
  updatedAt: string
  /** Attached by the server read path for sealed tcgcsv items; null otherwise. */
  euReference?: EuReference | null
}

// --- View toggle external store (no setState-in-effect, no hydration mismatch) ---
const viewListeners = new Set<() => void>()
function readView(): 'gallery' | 'table' {
  try { return localStorage.getItem('collView') === 'table' ? 'table' : 'gallery' } catch { return 'gallery' }
}
function setView(v: 'gallery' | 'table') {
  try { localStorage.setItem('collView', v) } catch {}
  viewListeners.forEach((f) => f())
}
function subscribeView(cb: () => void) { viewListeners.add(cb); return () => viewListeners.delete(cb) }

const SORT_KEYS: SortKey[] = ['createdAt', 'marketValue', 'difference', 'name', 'game', 'quantity']
const GKEYS = ['POKEMON', 'MAGIC', 'YUGIOH', 'ONEPIECE', 'OTHER']
const TKEYS = ['RAW', 'GRADED', 'SEALED']
const CKEYS = ['POOR', 'PLAYED', 'LIGHT_PLAYED', 'GOOD', 'EXCELLENT', 'NEAR_MINT', 'MINT']

interface CollectionViewProps {
  initialItems: PlainItem[]
}

export function CollectionView({ initialItems }: CollectionViewProps) {
  const t = useT()
  const view = useSyncExternalStore(subscribeView, readView, () => 'gallery' as const)
  const [items, setItems] = useState<PlainItem[]>(initialItems)
  const [filters, setFilters] = useState<Filters>({})
  const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' })
  const [editing, setEditing] = useState<PlainItem | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const handleSaved = (saved: PlainItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
    setPendingDelete(null)
  }

  const visible = sortItems(filterItems(items, filters), sort)
  const totals = collectionTotals(visible)

  function handleExportCsv() {
    const csvLabels: CsvLabels = {
      game: Object.fromEntries(GKEYS.map((k) => [k, t('game_' + k)])),
      itemType: Object.fromEntries(TKEYS.map((k) => [k, t('type_' + k)])),
      condition: Object.fromEntries(CKEYS.map((k) => [k, CONDITION_LABELS[k]])),
      headers: ['csv_h_name', 'csv_h_game', 'csv_h_type', 'csv_h_condition', 'csv_h_language', 'csv_h_set', 'csv_h_quantity', 'csv_h_purchase', 'csv_h_value', 'csv_h_difference', 'csv_h_source'].map((k) => t(k)),
    }
    const csv = itemsToCsv(
      visible.map((i) => ({
        name: i.name,
        game: i.game,
        itemType: i.itemType,
        condition: i.condition,
        language: i.language,
        setName: i.setName,
        quantity: i.quantity,
        purchasePrice: i.purchasePrice,
        marketValue: i.marketValue,
        marketValueSource: i.marketValueSource,
      })),
      csvLabels,
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tcg-archive-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a) // Firefox requires the anchor in the DOM to trigger download
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-fg">{t('coll_title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort controls */}
          <div className="flex items-center gap-1">
            <select
              aria-label={t('sort_label')}
              value={sort.key}
              onChange={(e) => setSort((s) => ({ ...s, key: e.target.value as SortKey }))}
              className="rounded border border-border bg-card px-2 py-1.5 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>{t('sort_' + k)}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label={t('sort_dir')}
              className="rounded border border-border bg-card px-2 py-1.5 text-sm text-fg hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
            >
              {sort.dir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          {/* View toggle — styled like theme/lang toggles */}
          <div className="flex overflow-hidden rounded border border-border bg-card text-sm">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${view === 'gallery' ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg'}`}
              onClick={() => setView('gallery')}
            >
              {t('coll_viewGallery')}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${view === 'table' ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg'}`}
              onClick={() => setView('table')}
            >
              {t('coll_viewTable')}
            </button>
          </div>
          <button
            type="button"
            className="rounded border border-border bg-card px-3 py-1.5 text-sm text-fg hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={handleExportCsv}
          >
            {t('csv_export')}
          </button>
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring glow-violet"
            onClick={() => { setEditing(null); setShowModal(true) }}
          >
            {t('coll_add')}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Totals bar — reflects the filtered set */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <div>
          <span className="text-muted">{t('tot_value')}</span>{' '}
          <span className="font-semibold text-fg">{formatEUR(totals.totalValue)}</span>
        </div>
        <div>
          <span className="text-muted">{t('tot_cost')}</span>{' '}
          <span className="font-semibold text-fg">{formatEUR(totals.totalCost)}</span>
        </div>
        <div>
          <span className="text-muted">P/L</span>{' '}
          <span className="font-semibold"><Money value={totals.profitLoss} signed /></span>
        </div>
        <div>
          <span className="text-muted">{t('tot_pieces')}</span>{' '}
          <span className="font-semibold text-fg">{totals.pieceCount}</span>
        </div>
        <div>
          <span className="text-muted">{t('tot_items')}</span>{' '}
          <span className="font-semibold text-fg">{totals.itemCount}</span>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <p className="py-12 text-center text-muted">{t('coll_empty')}</p>
      )}

      {/* Gallery view (default) */}
      {visible.length > 0 && view === 'gallery' && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 list-none p-0 m-0">
          {visible.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
            >
              <ItemImage item={item} className="aspect-[5/7] w-full" />
              <div className="p-3 space-y-1.5">
                <p className="font-medium text-fg truncate">{item.name}</p>
                {item.setName && (
                  <p className="text-xs text-muted truncate">{item.setName}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <GameBadge game={item.game} />
                  <span className="text-xs text-muted">{t('type_' + item.itemType)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg tabular-nums">{formatEUR(effectiveValue(item))}</span>
                  <Money value={itemDifference(item)} signed />
                </div>
                {/* Says how much to trust the figure above it. */}
                <PriceSourceChip item={item} />
                {item.quantity > 1 && (
                  <p className="text-xs text-muted">x{item.quantity}</p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => { setEditing(item); setShowModal(true) }}
                  >
                    {t('coll_edit')}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-danger hover:underline"
                    onClick={() => setPendingDelete(item.id)}
                  >
                    {t('coll_delete')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Table view */}
      {visible.length > 0 && view === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">{t('th_article')}</th>
                <th className="py-2 pr-4">{t('th_game')}</th>
                <th className="py-2 pr-4">{t('th_type')}</th>
                <th className="py-2 pr-4">{t('th_cond')}</th>
                <th className="py-2 pr-4 text-right">{t('th_qty')}</th>
                <th className="py-2 pr-4 text-right">{t('th_purchase')}</th>
                <th className="py-2 pr-4 text-right">{t('th_value')}</th>
                <th className="py-2 pr-4 text-right">{t('th_difference')}</th>
                <th className="py-2 text-right">{t('th_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-primary-soft transition-colors">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <ItemImage item={item} className="h-12 w-9 rounded shrink-0" />
                      <div>
                        <span className="font-medium text-fg">{item.name}</span>
                        {item.setName && (
                          <span className="block text-xs text-muted">{item.setName}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <GameBadge game={item.game} />
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {t('type_' + item.itemType)}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {item.condition ? (CONDITION_LABELS[item.condition] ?? item.condition) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right text-fg tabular-nums">{item.quantity}</td>
                  <td className="py-2 pr-4 text-right text-fg tabular-nums">{formatEUR(item.purchasePrice)}</td>
                  <td className="py-2 pr-4 text-right text-fg tabular-nums">
                    <span className="inline-flex flex-col items-end gap-0.5">
                      {formatEUR(effectiveValue(item))}
                      <PriceSourceChip item={item} />
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Money value={itemDifference(item)} signed />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline mr-2"
                      onClick={() => { setEditing(item); setShowModal(true) }}
                    >
                      {t('coll_edit')}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => setPendingDelete(item.id)}
                    >
                      {t('coll_delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ItemFormModal
          item={editing ?? undefined}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('coll_deleteTitle')}
          message={t('coll_confirmDelete')}
          confirmLabel={t('coll_delete')}
          cancelLabel={t('m_cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}
    </div>
  )
}
