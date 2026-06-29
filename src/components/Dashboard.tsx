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
  const [refreshError, setRefreshError] = useState<string | null>(null)

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
    setRefreshError(null)
    try {
      const res = await fetch('/api/prices/refresh', { method: 'POST' })
      if (!res.ok) {
        setRefreshError('Aggiornamento non riuscito. Riprova più tardi.')
        return
      }
      // Reload so the new market values (and totals) are reflected.
      location.reload()
    } catch {
      setRefreshError('Impossibile contattare il server. Controlla la connessione.')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-fg mb-4">Dashboard</h1>
        <p className="text-muted mb-6">
          La tua collezione è vuota. Inizia ad aggiungere articoli!
        </p>
        <Link
          href="/collezione"
          className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary glow-violet hover:bg-primary-hover transition-colors"
        >
          Vai alla Collezione
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold text-fg">Dashboard</h1>

      {/* Hero — the collection value as a neon vault readout */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 glow-violet">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Valore della collezione
        </p>
        <p className="font-display neon-text mt-2 text-4xl sm:text-5xl font-bold tabular-nums">
          {formatEUR(totals.totalValue)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          <span>
            Costo <span className="font-semibold text-fg">{formatEUR(totals.totalCost)}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            P/L{' '}
            <span className="font-semibold">
              <Money value={totals.profitLoss} signed />
            </span>
          </span>
        </div>
      </section>

      {/* Secondary stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
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
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
            Per gioco
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {gameGroups.map(([game, gameItems]) => {
              const gt = collectionTotals(gameItems)
              return (
                <div
                  key={game}
                  className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between transition-colors hover:border-primary/50"
                >
                  <div>
                    <p className="font-medium text-fg">{GAME_LABELS[game] ?? game}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {gt.itemCount} {gt.itemCount === 1 ? 'articolo' : 'articoli'} · {gt.pieceCount} {gt.pieceCount === 1 ? 'pezzo' : 'pezzi'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-fg text-sm tabular-nums">
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
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium text-fg">Aggiorna valori di mercato</p>
            <p className="text-sm text-muted mt-0.5">
              Aggiorna i valori di mercato delle carte Pokémon (fonte automatica).
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {loading ? 'Aggiornamento…' : 'Aggiorna valori'}
          </button>
        </div>
        {refreshError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {refreshError}
          </p>
        )}
      </section>
    </div>
  )
}
