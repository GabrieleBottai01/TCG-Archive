// Turning the daily portfolio snapshots into something drawable. Pure: no DB, no
// clock of its own (the caller passes `now`), no React — so every rule here is
// unit-testable and the component stays presentation-only.

export type SnapshotPoint = { day: string; totalValue: number }

// No '1D': the series holds exactly one point per day, so a one-day window would
// render a single point and imply a resolution we do not have.
export type Range = '7D' | '1M' | '3M' | '6M' | 'MAX'
export const RANGES: readonly Range[] = ['7D', '1M', '3M', '6M', 'MAX']

const DAYS: Record<Exclude<Range, 'MAX'>, number> = { '7D': 7, '1M': 30, '3M': 90, '6M': 180 }
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * How far apart two consecutive snapshots may sit before the line is cut.
 * The writer is a nightly scheduled function: one skipped night still leaves the
 * neighbours 2 days apart, which we tolerate. Anything wider is an outage, and
 * drawing through it would assert a trend across time nobody measured.
 */
export const GAP_BREAK_DAYS = 2

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

/**
 * Which of the chart's mutually exclusive states the data puts us in. Pure and
 * exported because this branch selection IS the feature's honesty rule: the copy
 * must describe the actual shortfall (no history at all / nothing in this window
 * / a single day in this window) rather than blaming the whole history for a gap
 * that only the chosen range has.
 */
export type ChartState =
  | { kind: 'chart' }
  | { kind: 'noData' }
  | { kind: 'rangeEmpty' }
  | { kind: 'onePointInRange' }
  | { kind: 'collecting'; since: string }

export function chartState(points: SnapshotPoint[], inRange: SnapshotPoint[]): ChartState {
  if (points.length === 0) return { kind: 'noData' }
  if (inRange.length >= 2) return { kind: 'chart' }
  if (inRange.length === 0) return { kind: 'rangeEmpty' }
  // Exactly one point in range: a longer history means the range is too narrow,
  // not that we are still collecting.
  if (points.length >= 2) return { kind: 'onePointInRange' }
  return { kind: 'collecting', since: points[0].day }
}

export type ChartGeometry = {
  path: string
  areaPath: string
  coords: { x: number; y: number; point: SnapshotPoint }[]
  min: number
  max: number
}

/**
 * Maps the series onto an SVG box: x is scaled by TIMESTAMP (so a missed week
 * occupies a week's width, not one step's), value inverts onto the height (max at
 * the top). Runs separated by more than `GAP_BREAK_DAYS` start a new subpath, so
 * unmeasured stretches read as absent instead of as a straight trend. Null below
 * two points — a line through one point would read as a flat market, which is a
 * claim about data we do not have.
 */
export function buildChartGeometry(points: SnapshotPoint[], width: number, height: number): ChartGeometry | null {
  if (points.length < 2) return null
  const values = points.map((p) => p.totalValue)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const times = points.map((p) => new Date(p.day).getTime())
  const t0 = times[0]
  const t1 = times[times.length - 1]
  const timeSpan = t1 - t0

  const coords = points.map((point, i) => ({
    // One row per day makes a zero time span impossible, but an even fallback
    // beats dividing by zero if the invariant ever breaks.
    x: timeSpan === 0 ? (i / (points.length - 1)) * width : ((times[i] - t0) / timeSpan) * width,
    // A flat series has no span to scale by: centre it rather than divide by zero.
    y: span === 0 ? height / 2 : height - ((point.totalValue - min) / span) * height,
    point,
  }))

  // Split into contiguous runs; a run break is a real hole in the data.
  const runs: (typeof coords)[] = []
  coords.forEach((c, i) => {
    const broken = i > 0 && times[i] - times[i - 1] > GAP_BREAK_DAYS * MS_PER_DAY
    if (i === 0 || broken) runs.push([])
    runs[runs.length - 1].push(c)
  })

  const path = runs
    .map((run) => run.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '))
    .join(' ')

  // One closed shape per run: the fill must not span a gap either.
  const areaPath = runs
    .map((run) => {
      const line = run.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
      const last = run[run.length - 1]
      return `${line} L${last.x.toFixed(2)},${height.toFixed(2)} L${run[0].x.toFixed(2)},${height.toFixed(2)} Z`
    })
    .join(' ')

  return { path, areaPath, coords, min, max }
}
