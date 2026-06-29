'use client'

import { useState } from 'react'
import { filterItems, collectionTotals, itemDifference, type Filters } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { FilterBar } from '@/components/FilterBar'
import { GAME_LABELS, ITEM_TYPE_LABELS, CONDITION_LABELS } from '@/lib/labels'

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
  const [items] = useState<PlainItem[]>(initialItems)
  const [filters, setFilters] = useState<Filters>({})

  const visible = filterItems(items, filters) as PlainItem[]
  const totals = collectionTotals(visible)

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Collezione</h1>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          onClick={() => console.log('Aggiungi articolo — Task 10')}
        >
          Aggiungi
        </button>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Totals bar */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <div>
          <span className="text-gray-500">Valore</span>{' '}
          <span className="font-semibold text-gray-900">{formatEUR(totals.totalValue)}</span>
        </div>
        <div>
          <span className="text-gray-500">Costo</span>{' '}
          <span className="font-semibold text-gray-900">{formatEUR(totals.totalCost)}</span>
        </div>
        <div>
          <span className="text-gray-500">P/L</span>{' '}
          <span className="font-semibold"><Money value={totals.profitLoss} signed /></span>
        </div>
        <div>
          <span className="text-gray-500">Pezzi</span>{' '}
          <span className="font-semibold text-gray-900">{totals.pieceCount}</span>
        </div>
        <div>
          <span className="text-gray-500">N. articoli</span>{' '}
          <span className="font-semibold text-gray-900">{totals.itemCount}</span>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <p className="py-12 text-center text-gray-500">
          Nessun articolo in collezione. Aggiungine uno!
        </p>
      )}

      {/* Desktop table */}
      {visible.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
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
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-gray-900">{item.name}</span>
                    {item.setName && (
                      <span className="block text-xs text-gray-400">{item.setName}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {GAME_LABELS[item.game] ?? item.game}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {item.condition ? (CONDITION_LABELS[item.condition] ?? item.condition) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-700">{item.quantity}</td>
                  <td className="py-2 pr-4 text-right text-gray-700">{formatEUR(item.purchasePrice)}</td>
                  <td className="py-2 pr-4 text-right text-gray-700">{formatEUR(item.marketValue)}</td>
                  <td className="py-2 pr-4 text-right">
                    <Money value={itemDifference(item)} signed />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline mr-2"
                      onClick={() => console.log('Modifica', item.id)}
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => console.log('Elimina', item.id)}
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
            <li key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {item.setName && (
                    <p className="text-xs text-gray-400">{item.setName}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatEUR(item.marketValue)}</p>
                  <Money value={itemDifference(item)} signed />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{GAME_LABELS[item.game] ?? item.game}</span>
                <span>{ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}</span>
                {item.condition && <span>{CONDITION_LABELS[item.condition] ?? item.condition}</span>}
                <span>Qtà: {item.quantity}</span>
                <span>Acquisto: {formatEUR(item.purchasePrice)}</span>
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => console.log('Modifica', item.id)}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => console.log('Elimina', item.id)}
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
