'use client'

import { useState } from 'react'
import { filterItems, collectionTotals, itemDifference, type Filters } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { FilterBar } from '@/components/FilterBar'
import { GAME_LABELS, ITEM_TYPE_LABELS, CONDITION_LABELS } from '@/lib/labels'
import { ItemFormModal } from '@/components/ItemFormModal'

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

interface CollectionViewProps {
  initialItems: PlainItem[]
}

export function CollectionView({ initialItems }: CollectionViewProps) {
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
    if (!confirm('Eliminare questo articolo?')) return
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-fg">Collezione</h1>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring glow-violet"
          onClick={() => { setEditing(null); setShowModal(true) }}
        >
          Aggiungi
        </button>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Totals bar */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <div>
          <span className="text-muted">Valore</span>{' '}
          <span className="font-semibold text-fg">{formatEUR(totals.totalValue)}</span>
        </div>
        <div>
          <span className="text-muted">Costo</span>{' '}
          <span className="font-semibold text-fg">{formatEUR(totals.totalCost)}</span>
        </div>
        <div>
          <span className="text-muted">P/L</span>{' '}
          <span className="font-semibold"><Money value={totals.profitLoss} signed /></span>
        </div>
        <div>
          <span className="text-muted">Pezzi</span>{' '}
          <span className="font-semibold text-fg">{totals.pieceCount}</span>
        </div>
        <div>
          <span className="text-muted">N. articoli</span>{' '}
          <span className="font-semibold text-fg">{totals.itemCount}</span>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <p className="py-12 text-center text-muted">
          Nessun articolo in collezione. Aggiungine uno!
        </p>
      )}

      {/* Desktop table */}
      {visible.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Articolo</th>
                <th className="py-2 pr-4">Gioco</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Cond.</th>
                <th className="py-2 pr-4 text-right">Qtà</th>
                <th className="py-2 pr-4 text-right">Acquisto</th>
                <th className="py-2 pr-4 text-right">Valore</th>
                <th className="py-2 pr-4 text-right">Differenza</th>
                <th className="py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-b border-border hover:bg-primary-soft transition-colors">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-fg">{item.name}</span>
                    {item.setName && (
                      <span className="block text-xs text-muted">{item.setName}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {GAME_LABELS[item.game] ?? item.game}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}
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
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => handleDelete(item.id)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {visible.length > 0 && (
        <ul className="md:hidden space-y-3">
          {visible.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-fg">{item.name}</p>
                  {item.setName && (
                    <p className="text-xs text-muted">{item.setName}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-fg">{formatEUR(item.marketValue)}</p>
                  <Money value={itemDifference(item)} signed />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{GAME_LABELS[item.game] ?? item.game}</span>
                <span>{ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}</span>
                {item.condition && <span>{CONDITION_LABELS[item.condition] ?? item.condition}</span>}
                <span>Qtà: {item.quantity}</span>
                <span>Acquisto: {formatEUR(item.purchasePrice)}</span>
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setEditing(item); setShowModal(true) }}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() => handleDelete(item.id)}
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
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
