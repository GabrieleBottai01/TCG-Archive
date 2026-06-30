'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { collectionTotals, groupTotals, topByValue, topByDifference, averageValuePerPiece, itemDifference } from '@/lib/value'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { SummaryCard } from '@/components/SummaryCard'
import { GameBadge } from '@/components/GameBadge'
import { useT, CONDITION_LABELS } from '@/lib/i18n'
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

  // Auto-update: on load, refresh AUTO values that are stale (server-side throttled),
  // and reload to show them. Runs at most one reload (fresh values skip the throttle).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/prices/refresh', { method: 'POST' })
        if (!res.ok) return
        const data = (await res.json()) as { updated: number }
        if (!cancelled && data.updated > 0) location.reload()
      } catch {
        // Silent: auto-refresh failures shouldn't disrupt the page.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Manual button forces a full refresh of every AUTO value.
  const handleRefresh = async () => {
    setLoading(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/prices/refresh?force=1', { method: 'POST' })
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
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <SummaryCard label={t('dash_costTotal')}>{formatEUR(totals.totalCost)}</SummaryCard>
        <SummaryCard label={t('dash_pl')}>
          <Money value={totals.profitLoss} signed />
        </SummaryCard>
        <SummaryCard label={t('dash_items')}>{totals.itemCount}</SummaryCard>
        <SummaryCard label={t('dash_pieces')}>{totals.pieceCount}</SummaryCard>
        <SummaryCard label={t('stats_avgPerPiece')}>{formatEUR(averageValuePerPiece(items))}</SummaryCard>
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

      {/* Per tipo */}
      {(() => {
        const rows = groupTotals(items, (i) => i.itemType ?? '')
        if (rows.length === 0) return null
        return (
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              {t('stats_byType')}
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {rows.map(({ key, totals: gt }) => (
                <div
                  key={key}
                  className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between transition-colors hover:border-primary/50"
                >
                  <div>
                    <p className="font-medium text-fg">{t('type_' + key)}</p>
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
              ))}
            </div>
          </section>
        )
      })()}

      {/* Per condizione */}
      {(() => {
        const rows = groupTotals(items, (i) => i.condition ?? '')
        if (rows.length === 0) return null
        return (
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              {t('stats_byCondition')}
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {rows.map(({ key, totals: gt }) => (
                <div
                  key={key || '__none__'}
                  className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between transition-colors hover:border-primary/50"
                >
                  <div>
                    <p className="font-medium text-fg">
                      {key ? (CONDITION_LABELS[key] ?? key) : t('stats_noCondition')}
                    </p>
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
              ))}
            </div>
          </section>
        )
      })()}

      {/* Top per valore */}
      {(() => {
        const rows = topByValue(items, 5)
        if (rows.length === 0) return null
        return (
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
              {t('stats_topValue')}
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {rows.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted tabular-nums w-4 shrink-0">{idx + 1}</span>
                    <span className="font-medium text-fg truncate">{item.name}</span>
                    <GameBadge game={item.game ?? ''} />
                  </div>
                  <span className="font-semibold text-fg text-sm tabular-nums shrink-0">
                    {formatEUR(item.marketValue * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {/* Top guadagni / Top perdite */}
      {(() => {
        const gains = topByDifference(items, 5, 'desc').filter((i) => itemDifference(i) > 0)
        const losses = topByDifference(items, 5, 'asc').filter((i) => itemDifference(i) < 0)
        if (gains.length === 0 && losses.length === 0) return null
        return (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {gains.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
                  {t('stats_topGain')}
                </h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                  {gains.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted tabular-nums w-4 shrink-0">{idx + 1}</span>
                        <span className="font-medium text-fg truncate">{item.name}</span>
                      </div>
                      <span className="text-sm tabular-nums shrink-0">
                        <Money value={itemDifference(item)} signed />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {losses.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
                  {t('stats_topLoss')}
                </h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                  {losses.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted tabular-nums w-4 shrink-0">{idx + 1}</span>
                        <span className="font-medium text-fg truncate">{item.name}</span>
                      </div>
                      <span className="text-sm tabular-nums shrink-0">
                        <Money value={itemDifference(item)} signed />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      })()}

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
