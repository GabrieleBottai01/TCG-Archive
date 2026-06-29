'use client'

import { useState } from 'react'
import Link from 'next/link'
import { collectionTotals } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { SummaryCard } from '@/components/SummaryCard'
import { GameBadge } from '@/components/GameBadge'
import { useT } from '@/lib/i18n'
import type { PlainItem } from '@/components/CollectionView'

interface DashboardProps {
  items: PlainItem[]
}

export function Dashboard({ items }: DashboardProps) {
  const t = useT()
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
        setRefreshError(t('dash_refreshErr'))
        return
      }
      // Reload so the new market values (and totals) are reflected.
      location.reload()
    } catch {
      setRefreshError(t('dash_networkErr'))
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-fg mb-4">{t('dash_title')}</h1>
        <p className="text-muted mb-6">
          {t('dash_emptyDesc')}
        </p>
        <Link
          href="/collezione"
          className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary glow-violet hover:bg-primary-hover transition-colors"
        >
          {t('dash_goToCollection')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold text-fg">{t('dash_title')}</h1>

      {/* Hero — the collection value as a neon vault readout */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 glow-violet">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          {t('dash_collectionValue')}
        </p>
        <p className="font-display neon-text mt-2 text-4xl sm:text-5xl font-bold tabular-nums">
          {formatEUR(totals.totalValue)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          <span>
            {t('dash_cost')}{' '}
            <span className="font-semibold text-fg">{formatEUR(totals.totalCost)}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            {t('dash_pl')}{' '}
            <span className="font-semibold">
              <Money value={totals.profitLoss} signed />
            </span>
          </span>
        </div>
      </section>

      {/* Secondary stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <SummaryCard label={t('dash_costTotal')}>{formatEUR(totals.totalCost)}</SummaryCard>
        <SummaryCard label={t('dash_pl')}>
          <Money value={totals.profitLoss} signed />
        </SummaryCard>
        <SummaryCard label={t('dash_items')}>{totals.itemCount}</SummaryCard>
        <SummaryCard label={t('dash_pieces')}>{totals.pieceCount}</SummaryCard>
      </div>

      {/* Per-game breakdown */}
      {gameGroups.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
            {t('dash_perGame')}
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
                    <p className="font-medium text-fg"><GameBadge game={game} /></p>
                    <p className="text-xs text-muted mt-0.5">
                      {`${gt.itemCount} ${t(gt.itemCount === 1 ? 'unit_article' : 'unit_articles')} · ${gt.pieceCount} ${t(gt.pieceCount === 1 ? 'unit_piece' : 'unit_pieces')}`}
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
            <p className="font-medium text-fg">{t('dash_updateTitle')}</p>
            <p className="text-sm text-muted mt-0.5">
              {t('dash_updateDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {loading ? t('dash_updating') : t('dash_updateBtn')}
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
