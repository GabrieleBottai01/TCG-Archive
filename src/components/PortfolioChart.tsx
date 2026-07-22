'use client'

import { useState, useMemo } from 'react'
import { useT, useLang } from '@/lib/i18n'
import { formatEUR } from '@/lib/format'
import {
  RANGES, filterRange, computeDelta, buildChartGeometry, chartState,
  type SnapshotPoint, type Range,
} from '@/lib/snapshots/series'

// The collection's value over time. One series, so there is no legend — the
// heading names it. The line wears the primary accent rather than green/red: a
// line as a whole is not "up" or "down"; the delta beside it carries that.
//
// Below two points in the chosen range we say so instead of drawing: a line
// through a single point reads as a flat market, which is a claim about data we
// do not have.
//
// The SVG is drawn with preserveAspectRatio="none" so the 600x140 viewBox fills
// the element exactly: no letterbox gutters, and the pointer's x-ratio over the
// element box IS the x-ratio over the drawing. The cost is a non-uniform scale,
// so strokes are vector-effect'd and anything that must not be squashed (the
// hover dot, the axis labels) is HTML positioned over the SVG instead.

const W = 600
const H = 140

// Below this the change is a rounding artefact, not a movement: show it neutral
// rather than dressing a €0.00 in green.
const NEUTRAL_EPSILON = 0.005

export function PortfolioChart({ points }: { points: SnapshotPoint[] }) {
  const t = useT()
  const lang = useLang()
  const [range, setRange] = useState<Range>('1M')
  const [hover, setHover] = useState<number | null>(null)

  const inRange = useMemo(() => filterRange(points, range, new Date()), [points, range])
  const geometry = useMemo(() => buildChartGeometry(inRange, W, H), [inRange])
  const delta = useMemo(() => computeDelta(inRange), [inRange])
  const state = useMemo(() => chartState(points, inRange), [points, inRange])

  const locale = lang === 'en' ? 'en-GB' : 'it-IT'
  // The rows are UTC day values: format them in UTC, or a negative-offset viewer
  // reads yesterday's label (and the server render disagrees with the client's).
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' })

  const hovered = hover !== null && geometry ? geometry.coords[hover] : null

  const deltaTone =
    delta === null ? '' :
      delta.absolute > NEUTRAL_EPSILON ? 'text-success' :
        delta.absolute < -NEUTRAL_EPSILON ? 'text-danger' : 'text-muted'
  const deltaSign =
    delta === null ? '' :
      delta.absolute > NEUTRAL_EPSILON ? '+' :
        delta.absolute < -NEUTRAL_EPSILON ? '−' : ''

  const firstLabel = inRange.length > 0 ? fmtDay(inRange[0].day) : null
  const lastLabel = inRange.length > 0 ? fmtDay(inRange[inRange.length - 1].day) : null
  const ariaLabel = geometry
    ? [
      t('chart_title'),
      range,
      `${firstLabel} → ${lastLabel}`,
      formatEUR(inRange[inRange.length - 1].totalValue),
      delta
        ? `${deltaSign}${formatEUR(Math.abs(delta.absolute))}${delta.percent !== null ? ` (${deltaSign}${Math.abs(delta.percent).toFixed(1)}%)` : ''}`
        : null,
    ].filter(Boolean).join(' — ')
    : t('chart_title')

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{t('chart_title')}</h2>
        {delta && (
          <p className={`text-sm font-medium ${deltaTone}`}>
            {deltaSign}{formatEUR(Math.abs(delta.absolute))}
            {delta.percent !== null && ` (${deltaSign}${Math.abs(delta.percent).toFixed(1)}%)`}
            {' '}<span className="text-muted font-normal">· {range}</span>
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
        {state.kind === 'chart' && geometry ? (
          <>
            <div className="relative h-36 w-full">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                role="img"
                aria-label={ariaLabel}
                onPointerLeave={() => setHover(null)}
                onPointerMove={(e) => {
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
                  vectorEffect="non-scaling-stroke"
                  className="stroke-primary"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {hovered && (
                  /* Recessive crosshair; the readout sits in text below, not on the mark. */
                  <line
                    x1={hovered.x} y1={0} x2={hovered.x} y2={H}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    className="stroke-muted"
                  />
                )}
              </svg>

              {/* The value axis, stated rather than implied: the baseline is the
                  range's own minimum, not zero, so a small wiggle can fill the
                  box. HTML, not SVG text — the non-uniform scale would squash it. */}
              <span className="pointer-events-none absolute right-1 top-0 text-[10px] leading-none text-muted tabular-nums">
                {formatEUR(geometry.max)}
              </span>
              <span className="pointer-events-none absolute bottom-0 right-1 text-[10px] leading-none text-muted tabular-nums">
                {formatEUR(geometry.min)}
              </span>

              {/* The hover dot lives in HTML for the same reason: a <circle> under
                  a non-uniform scale would draw as an ellipse. */}
              {hovered && (
                <span
                  className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {hovered
                ? `${fmtDay(hovered.point.day)} · ${formatEUR(hovered.point.totalValue)}`
                : `${firstLabel} → ${lastLabel}`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {state.kind === 'noData' && t('chart_noData')}
            {state.kind === 'rangeEmpty' && t('chart_rangeEmpty')}
            {state.kind === 'onePointInRange' && t('chart_rangeOnePoint')}
            {state.kind === 'collecting' && `${t('chart_collecting')} ${fmtDay(state.since)}. ${t('chart_needTwoDays')}`}
          </p>
        )}
      </div>
    </section>
  )
}
