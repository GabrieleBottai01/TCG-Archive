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
