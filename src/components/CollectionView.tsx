'use client'

import { useState, useSyncExternalStore } from 'react'
import { filterItems, collectionTotals, itemDifference, type Filters } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { FilterBar } from '@/components/FilterBar'
import { useT, CONDITION_LABELS } from '@/lib/i18n'
import { ItemFormModal } from '@/components/ItemFormModal'
import { ItemImage } from '@/components/ItemImage'
import { GameBadge } from '@/components/GameBadge'

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

interface CollectionViewProps {
  initialItems: PlainItem[]
}

export function CollectionView({ initialItems }: CollectionViewProps) {
  const t = useT()
  const view = useSyncExternalStore(subscribeView, readView, () => 'gallery' as const)
  const [items, setItems] = useState<PlainItem[]>(initialItems)
  const [filters, setFilters] = useState<Filters>({})
  const [editing, setEditing] = useState<PlainItem | null>(null)
  const [showModal, setShowModal] = useState(false)

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
    if (!confirm(t('coll_confirmDelete'))) return
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
  }

  const visible = filterItems(items, filters)
  const totals = collectionTotals(visible)

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-fg">{t('coll_title')}</h1>
        <div className="flex items-center gap-2">
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
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 list-none p-0 m-0">
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
                  <span className="text-sm font-semibold text-fg">{formatEUR(item.marketValue)}</span>
                  <Money value={itemDifference(item)} signed />
                </div>
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
                    onClick={() => handleDelete(item.id)}
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
                  <td className="py-2 pr-4 text-right text-fg">{item.quantity}</td>
                  <td className="py-2 pr-4 text-right text-fg">{formatEUR(item.purchasePrice)}</td>
                  <td className="py-2 pr-4 text-right text-fg">{formatEUR(item.marketValue)}</td>
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
                      onClick={() => handleDelete(item.id)}
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
    </div>
  )
}
