'use client'

import { useState, useMemo } from 'react'
import { useT, useLang } from '@/lib/i18n'
import { formatEUR } from '@/lib/format'
import {
  RANGES, filterRange, computeDelta, buildChartGeometry,
  type SnapshotPoint, type Range,
} from '@/lib/snapshots/series'

// The collection's value over time. One series, so there is no legend — the
// heading names it. The line wears the primary accent rather than green/red: a
// line as a whole is not "up" or "down"; the delta beside it carries that.
//
// Below two points in the chosen range we say so instead of drawing: a line
// through a single point reads as a flat market, which is a claim about data we
// do not have.

const W = 600
const H = 140

export function PortfolioChart({ points }: { points: SnapshotPoint[] }) {
  const t = useT()
  const lang = useLang()
  const [range, setRange] = useState<Range>('1M')
  const [hover, setHover] = useState<number | null>(null)

  const inRange = useMemo(() => filterRange(points, range, new Date()), [points, range])
  const geometry = useMemo(() => buildChartGeometry(inRange, W, H), [inRange])
  const delta = useMemo(() => computeDelta(inRange), [inRange])

  const locale = lang === 'en' ? 'en-GB' : 'it-IT'
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  const firstDay = points.length > 0 ? fmtDay(points[0].day) : null

  const hovered = hover !== null && geometry ? geometry.coords[hover] : null

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{t('chart_title')}</h2>
        {delta && (
          <p className={`text-sm font-medium ${delta.absolute >= 0 ? 'text-success' : 'text-danger'}`}>
            {delta.absolute >= 0 ? '+' : '−'}{formatEUR(Math.abs(delta.absolute))}
            {delta.percent !== null && ` (${delta.absolute >= 0 ? '+' : '−'}${Math.abs(delta.percent).toFixed(1)}%)`}
          </p>
        )}
      </div>

      {/* Range pills. No 1D: the series is one point per day. */}
      <div className="mt-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { setRange(r); setHover(null) }}
            aria-pressed={r === range}
            className={`rounded px-2 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              r === range ? 'bg-primary text-on-primary' : 'text-muted hover:bg-primary-soft'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {geometry ? (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-36 w-full"
              role="img"
              aria-label={`${t('chart_title')} — ${formatEUR(inRange[inRange.length - 1].totalValue)}`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = (e.clientX - rect.left) / rect.width
                const i = Math.round(ratio * (geometry.coords.length - 1))
                setHover(Math.max(0, Math.min(geometry.coords.length - 1, i)))
              }}
            >
              <path d={geometry.areaPath} className="fill-primary-soft" />
              <path
                d={geometry.path}
                fill="none"
                strokeWidth={2}
                className="stroke-primary"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hovered && (
                <>
                  {/* Recessive crosshair; the readout sits in text below, not on the mark. */}
                  <line x1={hovered.x} y1={0} x2={hovered.x} y2={H} strokeWidth={1} className="stroke-border" />
                  <circle cx={hovered.x} cy={hovered.y} r={4} className="fill-primary" />
                </>
              )}
            </svg>
            <p className="mt-1 text-xs text-muted">
              {hovered
                ? `${fmtDay(hovered.point.day)} · ${formatEUR(hovered.point.totalValue)}`
                : `${fmtDay(inRange[0].day)} → ${fmtDay(inRange[inRange.length - 1].day)}`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {points.length === 0
              ? t('chart_noData')
              : inRange.length === 0
                ? t('chart_rangeEmpty')
                : `${t('chart_collecting')} ${firstDay}. ${t('chart_needTwoDays')}`}
          </p>
        )}
      </div>
    </section>
  )
}
