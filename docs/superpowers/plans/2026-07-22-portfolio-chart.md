# Portfolio Value Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the collection's value over time on the dashboard — a line chart with range pills and a delta — reading the daily snapshots that sub-project A now records.

**Architecture:** All the maths lives in a pure, unit-tested `src/lib/snapshots/series.ts` (range filtering, delta, SVG geometry). `PortfolioChart.tsx` is a presentation-only client component consuming a `points` prop. The server component `app/page.tsx` already reads Prisma, so it loads the snapshots too — no new API endpoint, no client fetch; range switching filters the already-loaded series.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs — see `AGENTS.md`), Prisma, React client components, Vitest. Hand-rolled inline SVG — no chart library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-portfolio-chart-design.md`.
- **Ranges are `7D · 1M · 3M · 6M · MAX`, default `1M`. There is deliberately NO "1D"** — the series has exactly one point per day, so a 1D range would render a single point and imply a resolution we do not have.
- **Thin history must be stated, not drawn.** Render a line only when the selected range holds **at least 2 points**; below that render an honest empty state naming the date collection started. A line through 1–2 points reads as "the market is flat", which is a visual lie.
- **One series ⇒ no legend** (the heading names it). Line is **2px**, grid/axes recessive, no marker on every point.
- **The line wears the app's primary accent (`--primary`), never a semantic colour** — a line as a whole is not "up" or "down". The **delta text** carries green (`--success`) / red (`--danger`). Text never wears the series colour. (Both accents were validated with the dataviz palette validator: lightness band, chroma floor and ≥3:1 contrast PASS in light *and* dark.)
- A **crosshair + hover tooltip** ships in v1 (an SVG line chart is interactive by default). No zoom, no pan.
- No new API endpoint; no chart library; no cost-basis second line; no `pricesAsOf` rendering yet.
- Use existing theme tokens (`text-fg`, `text-muted`, `border-border`, `bg-card`, `text-primary`, `text-success`, `text-danger`) so light and dark both work — do NOT hard-code hex values.
- Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`. Build gate: `npm run build`. Lint must stay at 0 errors / 0 warnings.
- Do NOT push. Work stays on `feat/portfolio-chart`.

---

### Task 1: Pure series maths

**Files:**
- Create: `src/lib/snapshots/series.ts`
- Create: `src/lib/snapshots/__tests__/series.test.ts`

**Interfaces:**
- Produces:
```typescript
export type SnapshotPoint = { day: string; totalValue: number; totalCost: number }
export type Range = '7D' | '1M' | '3M' | '6M' | 'MAX'
export const RANGES: readonly Range[]
export function filterRange(points: SnapshotPoint[], range: Range, now: Date): SnapshotPoint[]
export type Delta = { absolute: number; percent: number | null }
export function computeDelta(points: SnapshotPoint[]): Delta | null
export type ChartGeometry = { path: string; areaPath: string; coords: { x: number; y: number; point: SnapshotPoint }[]; min: number; max: number }
export function buildChartGeometry(points: SnapshotPoint[], width: number, height: number): ChartGeometry | null
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/snapshots/__tests__/series.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filterRange, computeDelta, buildChartGeometry, type SnapshotPoint } from '@/lib/snapshots/series'

const p = (day: string, totalValue: number): SnapshotPoint => ({ day, totalValue, totalCost: 0 })
const NOW = new Date('2026-07-22T12:00:00Z')

describe('filterRange', () => {
  const series = [p('2026-01-01', 10), p('2026-06-25', 20), p('2026-07-16', 30), p('2026-07-21', 40)]

  it('keeps only points inside the window', () => {
    expect(filterRange(series, '7D', NOW).map((x) => x.day)).toEqual(['2026-07-16', '2026-07-21'])
    expect(filterRange(series, '1M', NOW).map((x) => x.day)).toEqual(['2026-06-25', '2026-07-16', '2026-07-21'])
  })

  it('MAX keeps everything and never invents points', () => {
    expect(filterRange(series, 'MAX', NOW)).toEqual(series)
    expect(filterRange([], 'MAX', NOW)).toEqual([])
  })
})

describe('computeDelta', () => {
  it('is the change from the first to the last point, absolute and percent', () => {
    expect(computeDelta([p('a', 100), p('b', 90), p('c', 125)])).toEqual({ absolute: 25, percent: 25 })
  })

  it('is negative when the value fell', () => {
    expect(computeDelta([p('a', 200), p('b', 150)])).toEqual({ absolute: -50, percent: -25 })
  })

  it('omits the percent when the base is 0 rather than dividing by zero', () => {
    expect(computeDelta([p('a', 0), p('b', 40)])).toEqual({ absolute: 40, percent: null })
  })

  it('is null with fewer than two points — there is no change to report', () => {
    expect(computeDelta([p('a', 10)])).toBeNull()
    expect(computeDelta([])).toBeNull()
  })
})

describe('buildChartGeometry', () => {
  it('spans the full width and inverts value to y (max at top, min at bottom)', () => {
    const g = buildChartGeometry([p('a', 10), p('b', 30), p('c', 20)], 100, 50)!
    expect(g.coords[0].x).toBe(0)
    expect(g.coords[2].x).toBe(100)
    expect(g.coords[1].y).toBe(0)    // the maximum sits at the top
    expect(g.coords[0].y).toBe(50)   // the minimum sits at the bottom
    expect(g.min).toBe(10)
    expect(g.max).toBe(30)
    expect(g.path.startsWith('M0.00,50.00')).toBe(true)
  })

  it('centres a flat series instead of dividing by zero', () => {
    const g = buildChartGeometry([p('a', 42), p('b', 42)], 100, 50)!
    expect(g.coords.every((c) => c.y === 25)).toBe(true)
    expect(g.coords.some((c) => Number.isNaN(c.y))).toBe(false)
  })

  it('returns null below two points — nothing honest to draw', () => {
    expect(buildChartGeometry([p('a', 10)], 100, 50)).toBeNull()
    expect(buildChartGeometry([], 100, 50)).toBeNull()
  })

  it('closes the area path back down to the baseline', () => {
    const g = buildChartGeometry([p('a', 10), p('b', 30)], 100, 50)!
    expect(g.areaPath.endsWith('L0.00,50.00 Z')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/snapshots/__tests__/series.test.ts`
Expected: FAIL — module `@/lib/snapshots/series` not found.

- [ ] **Step 3: Implement**

Create `src/lib/snapshots/series.ts`:

```typescript
// Turning the daily portfolio snapshots into something drawable. Pure: no DB, no
// clock of its own (the caller passes `now`), no React — so every rule here is
// unit-testable and the component stays presentation-only.

export type SnapshotPoint = { day: string; totalValue: number; totalCost: number }

// No '1D': the series holds exactly one point per day, so a one-day window would
// render a single point and imply a resolution we do not have.
export type Range = '7D' | '1M' | '3M' | '6M' | 'MAX'
export const RANGES: readonly Range[] = ['7D', '1M', '3M', '6M', 'MAX']

const DAYS: Record<Exclude<Range, 'MAX'>, number> = { '7D': 7, '1M': 30, '3M': 90, '6M': 180 }
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function filterRange(points: SnapshotPoint[], range: Range, now: Date): SnapshotPoint[] {
  if (range === 'MAX') return points
  const cutoff = now.getTime() - DAYS[range] * MS_PER_DAY
  return points.filter((p) => new Date(p.day).getTime() >= cutoff)
}

export type Delta = { absolute: number; percent: number | null }

/** Change across the range. Null below two points: there is no change to report. */
export function computeDelta(points: SnapshotPoint[]): Delta | null {
  if (points.length < 2) return null
  const first = points[0].totalValue
  const last = points[points.length - 1].totalValue
  const absolute = last - first
  // A percentage off a zero base is not "infinite growth", it is undefined — say so.
  return { absolute, percent: first === 0 ? null : (absolute / first) * 100 }
}

export type ChartGeometry = {
  path: string
  areaPath: string
  coords: { x: number; y: number; point: SnapshotPoint }[]
  min: number
  max: number
}

/**
 * Maps the series onto an SVG box: index spreads across the width, value inverts
 * onto the height (max at the top). Null below two points — a line through one
 * point would read as a flat market, which is a claim about data we do not have.
 */
export function buildChartGeometry(points: SnapshotPoint[], width: number, height: number): ChartGeometry | null {
  if (points.length < 2) return null
  const values = points.map((p) => p.totalValue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const coords = points.map((point, i) => ({
    x: (i / (points.length - 1)) * width,
    // A flat series has no span to scale by: centre it rather than divide by zero.
    y: span === 0 ? height / 2 : height - ((point.totalValue - min) / span) * height,
    point,
  }))

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
  const areaPath = `${path} L${width.toFixed(2)},${height.toFixed(2)} L0.00,${height.toFixed(2)} Z`
  return { path, areaPath, coords, min, max }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/snapshots/__tests__/series.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/snapshots/series.ts src/lib/snapshots/__tests__/series.test.ts
git commit -m "feat(chart): pure series maths — range filter, delta, SVG geometry"
```

---

### Task 2: The `PortfolioChart` component

**Files:**
- Create: `src/components/PortfolioChart.tsx`
- Modify: `src/lib/i18n.ts` (add the chart labels to BOTH the `it` and `en` maps)

**Interfaces:**
- Consumes: `filterRange`, `computeDelta`, `buildChartGeometry`, `RANGES`, types `SnapshotPoint`/`Range` from `@/lib/snapshots/series`; `formatEUR` from `@/lib/format`; `useT`, `useLang` from `@/lib/i18n`.
- Produces: `export function PortfolioChart({ points }: { points: SnapshotPoint[] })`.

- [ ] **Step 1: Add the i18n keys**

In `src/lib/i18n.ts`, add to the **`it`** map (near the other `dash_` keys):

```typescript
  chart_title: 'Andamento del valore',
  chart_collecting: 'Sto raccogliendo i dati dal',
  chart_needTwoDays: 'Il grafico comparirà appena ci sono almeno due giorni di storico.',
  chart_noData: 'Nessuno storico ancora: comparirà dopo il primo aggiornamento dei prezzi.',
  chart_rangeEmpty: 'Nessun dato in questo intervallo.',
```

and the matching **`en`** entries:

```typescript
  chart_title: 'Value over time',
  chart_collecting: 'Collecting data since',
  chart_needTwoDays: 'The chart appears as soon as there are at least two days of history.',
  chart_noData: 'No history yet: it will appear after the first price refresh.',
  chart_rangeEmpty: 'No data in this range.',
```

- [ ] **Step 2: Create the component**

Create `src/components/PortfolioChart.tsx`:

```tsx
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
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no type errors; 0 errors and 0 warnings. If `text-on-primary`, `focus-visible:ring-ring` or `fill-primary-soft` are not real utilities in this project, substitute the equivalent token classes actually used elsewhere in `src/components` (check `Dashboard.tsx` / `PriceSourceChip.tsx`) and note the substitution in your report — do NOT hard-code hex colours.

- [ ] **Step 4: Commit**

```bash
git add src/components/PortfolioChart.tsx src/lib/i18n.ts
git commit -m "feat(chart): PortfolioChart — range pills, delta, hover crosshair, honest empty state"
```

---

### Task 3: Load the snapshots and render the chart

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `PortfolioChart` (Task 2), `type SnapshotPoint` (Task 1).
- Produces: `Dashboard` accepts a new `snapshots: SnapshotPoint[]` prop and renders the chart directly under the balance hero.

- [ ] **Step 1: Load the snapshots server-side**

In `src/app/page.tsx`, after the existing `items` query, add the snapshot query and pass it down. The whole component becomes:

```tsx
export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({ where: { userId: session.user.id } })
  // The dashboard balance and top-value list must reflect a STRONG EU reference too.
  const refs = await euReferencesFor(prisma, items)
  const withRefs = items.map((i) => ({ ...i, euReference: refs.get(`${i.externalId}|${i.language}`) ?? null }))
  // The value-over-time chart reads the daily snapshots. A year is ~365 rows, so
  // the whole series ships with the page and the range pills filter client-side.
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId: session.user.id },
    orderBy: { day: 'asc' },
    select: { day: true, totalValue: true, totalCost: true },
  })
  return (
    <Dashboard
      items={JSON.parse(JSON.stringify(withRefs))}
      snapshots={JSON.parse(JSON.stringify(snapshots))}
    />
  )
}
```

- [ ] **Step 2: Accept the prop and render the chart**

In `src/components/Dashboard.tsx`:

- Add the imports:

```tsx
import { PortfolioChart } from '@/components/PortfolioChart'
import type { SnapshotPoint } from '@/lib/snapshots/series'
```

- Extend the props interface and the signature (currently `interface DashboardProps { items: PlainItem[] }` and `export function Dashboard({ items }: DashboardProps)`) to:

```tsx
interface DashboardProps {
  items: PlainItem[]
  snapshots?: SnapshotPoint[]
}

export function Dashboard({ items, snapshots = [] }: DashboardProps) {
```

The prop is optional with a `[]` default so the component cannot crash if a caller omits it.

- Render `<PortfolioChart points={snapshots} />` immediately AFTER the balance hero block (the section whose heading uses `t('dash_balanceTitle')`) and BEFORE the next section, at the same width as the balance block above it.

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx eslint . && npm run build`
Expected: no type errors; all tests pass; 0 lint errors/warnings; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/Dashboard.tsx
git commit -m "feat(chart): dashboard loads daily snapshots and renders the value chart"
```

---

## Notes for the implementer

- **Do NOT push.** The controller decides when to merge/deploy.
- This change is **read-only** with respect to snapshots — it must not write, backfill, or mutate any `PortfolioSnapshot`/`ItemValueSnapshot` row.
- Right after deploy the collection will have very little history, so the honest empty state is the *expected* first appearance, not a bug.
- Do not hard-code colours; use the theme token classes so light and dark both work.
