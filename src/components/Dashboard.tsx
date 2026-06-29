'use client'

import { useState } from 'react'
import Link from 'next/link'
import { collectionTotals } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { SummaryCard } from '@/components/SummaryCard'
import { GAME_LABELS } from '@/lib/labels'
import type { PlainItem } from '@/components/CollectionView'

interface DashboardProps {
  items: PlainItem[]
}

export function Dashboard({ items }: DashboardProps) {
  const [loading, setLoading] = useState(false)

  const totals = collectionTotals(items)

  // Group items by game
  const gameGroups = Object.entries(
    items.reduce<Record<string, PlainItem[]>>((acc, item) => {
      const g = item.game
      if (!acc[g]) acc[g] = []
      acc[g].push(item)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await fetch('/api/prices/refresh', { method: 'POST' })
      location.reload()
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Dashboard</h1>
        <p className="text-gray-500 mb-6">
          La tua collezione è vuota. Inizia ad aggiungere articoli!
        </p>
        <Link
          href="/collezione"
          className="inline-block rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Vai alla Collezione
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <SummaryCard label="Valore totale">{formatEUR(totals.totalValue)}</SummaryCard>
        <SummaryCard label="Costo totale">{formatEUR(totals.totalCost)}</SummaryCard>
        <SummaryCard label="P/L">
          <Money value={totals.profitLoss} signed />
        </SummaryCard>
        <SummaryCard label="N. articoli">{totals.itemCount}</SummaryCard>
        <SummaryCard label="Pezzi">{totals.pieceCount}</SummaryCard>
      </div>

      {/* Per-game breakdown */}
      {gameGroups.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">
            Per gioco
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {gameGroups.map(([game, gameItems]) => {
              const gt = collectionTotals(gameItems)
              return (
                <div
                  key={game}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {GAME_LABELS[game] ?? game}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {gt.itemCount} {gt.itemCount === 1 ? 'articolo' : 'articoli'} · {gt.pieceCount} {gt.pieceCount === 1 ? 'pezzo' : 'pezzi'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm">
                      {formatEUR(gt.totalValue)}
                    </p>
                    <p className="text-xs mt-0.5">
                      <Money value={gt.profitLoss} signed />
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Price refresh */}
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900">Aggiorna valori di mercato</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Aggiorna i valori di mercato delle carte Pokémon (fonte automatica).
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0 rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Aggiornamento…' : 'Aggiorna valori'}
          </button>
        </div>
      </section>
    </div>
  )
}
