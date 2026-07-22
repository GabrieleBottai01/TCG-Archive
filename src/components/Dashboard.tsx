'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collectionTotals, groupTotals, topByValue, topByDifference, averageValuePerPiece, itemDifference, itemDifferencePercent } from '@/lib/value'
import { effectiveValue } from '@/lib/priceSource'
import { formatEUR } from '@/lib/format'
import { Money } from '@/components/Money'
import { SummaryCard } from '@/components/SummaryCard'
import { GameBadge } from '@/components/GameBadge'
import { useT, CONDITION_LABELS } from '@/lib/i18n'
import type { PlainItem } from '@/components/CollectionView'
import { PortfolioChart } from '@/components/PortfolioChart'
import type { SnapshotPoint } from '@/lib/snapshots/series'

interface DashboardProps {
  items: PlainItem[]
  snapshots?: SnapshotPoint[]
}

export function Dashboard({ items, snapshots = [] }: DashboardProps) {
  const t = useT()
  const router = useRouter()
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
  // then soft-refresh the server component to show them — no full document reload.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/prices/refresh', { method: 'POST' })
        if (!res.ok) return
        const data = (await res.json()) as { updated: number }
        if (!cancelled && data.updated > 0) router.refresh()
      } catch {
        // Silent: auto-refresh failures shouldn't disrupt the page.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

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
      // Soft-refresh so the new market values (and totals) are reflected.
      router.refresh()
    } catch {
      setRefreshError(t('dash_networkErr'))
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="py-20">
        <div className="text-center">
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
        {/* An emptied collection still HAS a history: liquidating it must not
            erase the record of what it was worth. */}
        {snapshots.length > 0 && (
          <div className="mt-12 text-left">
            <PortfolioChart points={snapshots} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold text-fg">{t('dash_title')}</h1>

      {/* Hero — the collection balance, housed like the graded slab it is.
          See `.slab` in globals.css for why the shell is brushed metal. */}
      <section className="slab">
        <div className="slab-inner">
          <div className="flex items-center justify-between gap-4 border-b border-border bg-gradient-to-b from-primary-soft to-transparent px-4 py-2 sm:px-6">
            <h2 className="font-display text-[0.66rem] font-bold uppercase tracking-[0.17em] text-muted">
              {t('dash_balanceTitle')}
            </h2>
          </div>
          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <p className="font-display neon-text text-4xl sm:text-5xl font-black tabular-nums leading-none">
              {formatEUR(totals.totalValue)}
            </p>
            <p className="profit-gradient mt-2 text-base sm:text-lg font-bold tabular-nums">
              {totals.profitLoss >= 0 ? '+' : '−'}
              {formatEUR(Math.abs(totals.profitLoss))} {t('dash_netProfit')}
            </p>
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              {t('dash_investedOn')} {formatEUR(totals.totalCost)} {t('dash_invested')}
              {totals.totalCost > 0 && (
                <> · {totals.profitLoss >= 0 ? '+' : '−'}
                  {Math.abs((totals.profitLoss / totals.totalCost) * 100).toFixed(1)}%
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <PortfolioChart points={snapshots} />

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
      {gameGroups.length > 1 && (
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
        if (rows.length <= 1) return null
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
        if (rows.length <= 1) return null
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
                    {formatEUR(effectiveValue(item) * item.quantity)}
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
                        {itemDifferencePercent(item) !== null && (
                          <span className="ml-2 text-xs text-muted">
                            {/* ASCII '-' on purpose: it sits next to Money, which uses formatEUR's hyphen. */}
                            {itemDifferencePercent(item)! >= 0 ? '+' : '-'}
                            {Math.abs(itemDifferencePercent(item)!).toFixed(1)}%
                          </span>
                        )}
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
                        {itemDifferencePercent(item) !== null && (
                          <span className="ml-2 text-xs text-muted">
                            {/* ASCII '-' on purpose: it sits next to Money, which uses formatEUR's hyphen. */}
                            {itemDifferencePercent(item)! >= 0 ? '+' : '-'}
                            {Math.abs(itemDifferencePercent(item)!).toFixed(1)}%
                          </span>
                        )}
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
