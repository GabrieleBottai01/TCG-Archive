import { describe, it, expect } from 'vitest'
import {
  filterRange, computeDelta, buildChartGeometry, chartState, nearestCoordIndex, type SnapshotPoint,
} from '@/lib/snapshots/series'

const p = (day: string, totalValue: number): SnapshotPoint => ({ day, totalValue })
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
    expect(computeDelta([p('2026-07-01', 100), p('2026-07-02', 90), p('2026-07-03', 125)]))
      .toEqual({ absolute: 25, percent: 25 })
  })

  it('is negative when the value fell', () => {
    expect(computeDelta([p('2026-07-01', 200), p('2026-07-02', 150)])).toEqual({ absolute: -50, percent: -25 })
  })

  it('omits the percent when the base is 0 rather than dividing by zero', () => {
    expect(computeDelta([p('2026-07-01', 0), p('2026-07-02', 40)])).toEqual({ absolute: 40, percent: null })
  })

  it('is null with fewer than two points — there is no change to report', () => {
    expect(computeDelta([p('2026-07-01', 10)])).toBeNull()
    expect(computeDelta([])).toBeNull()
  })
})

describe('chartState', () => {
  const a = p('2026-07-01', 10)
  const b = p('2026-07-02', 20)

  it('is noData when there is no history at all', () => {
    expect(chartState([], [])).toEqual({ kind: 'noData' })
  })

  it('draws once two points fall inside the range', () => {
    expect(chartState([a, b], [a, b])).toEqual({ kind: 'chart' })
  })

  it('is rangeEmpty when history exists but nothing lands in the window', () => {
    expect(chartState([a, b], [])).toEqual({ kind: 'rangeEmpty' })
  })

  it('blames the range, not the history, when one point lands in a narrow window', () => {
    expect(chartState([a, b], [b])).toEqual({ kind: 'onePointInRange' })
  })

  it('is collecting only when the history itself has a single day', () => {
    expect(chartState([a], [a])).toEqual({ kind: 'collecting', since: '2026-07-01' })
  })
})

describe('buildChartGeometry', () => {
  it('spans the full width and inverts value to y (max at top, min at bottom)', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 30), p('2026-07-03', 20)], 100, 50)!
    expect(g.coords[0].x).toBe(0)
    expect(g.coords[2].x).toBe(100)
    expect(g.coords[1].y).toBe(0)    // the maximum sits at the top
    expect(g.coords[0].y).toBe(50)   // the minimum sits at the bottom
    expect(g.min).toBe(10)
    expect(g.max).toBe(30)
    expect(g.path.startsWith('M0.00,50.00')).toBe(true)
  })

  it('maps evenly spaced days linearly across the width', () => {
    const g = buildChartGeometry(
      [p('2026-07-01', 10), p('2026-07-02', 20), p('2026-07-03', 30), p('2026-07-04', 40)],
      90, 50,
    )!
    expect(g.coords.map((c) => c.x)).toEqual([0, 30, 60, 90])
  })

  it('scales x by time, so a gap pushes the later point proportionally right', () => {
    // 1 day, then a 9-day hole: the middle point belongs at a tenth of the width.
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 20), p('2026-07-11', 30)], 100, 50)!
    expect(g.coords[1].x).toBeCloseTo(10, 6)
    expect(g.coords[2].x).toBe(100)
  })

  it('breaks the path across a gap wider than two days instead of drawing through it', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 20), p('2026-07-11', 30)], 100, 50)!
    expect(g.path.match(/M/g)!.length).toBe(2)
    // The fill closes each run separately, so it does not span the hole either.
    expect(g.areaPath.match(/Z/g)!.length).toBe(2)
  })

  it('keeps contiguous days — and a single missed night — as one unbroken path', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 20), p('2026-07-04', 30)], 100, 50)!
    expect(g.path.match(/M/g)!.length).toBe(1)
    expect(g.areaPath.match(/Z/g)!.length).toBe(1)
  })

  it('centres a flat series instead of dividing by zero', () => {
    const g = buildChartGeometry([p('2026-07-01', 42), p('2026-07-02', 42)], 100, 50)!
    expect(g.coords.every((c) => c.y === 25)).toBe(true)
    expect(g.coords.some((c) => Number.isNaN(c.y))).toBe(false)
  })

  it('falls back to even spacing when every point shares a day', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-01', 30)], 100, 50)!
    expect(g.coords.map((c) => c.x)).toEqual([0, 100])
    expect(g.coords.some((c) => Number.isNaN(c.x))).toBe(false)
  })

  it('returns null below two points — nothing honest to draw', () => {
    expect(buildChartGeometry([p('2026-07-01', 10)], 100, 50)).toBeNull()
    expect(buildChartGeometry([], 100, 50)).toBeNull()
  })

  it('closes the area path back down to the baseline', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 30)], 100, 50)!
    expect(g.areaPath.endsWith('L0.00,50.00 Z')).toBe(true)
  })

  it('reports a lone point isolated between two gaps as a solo point', () => {
    // Three runs: a contiguous pair, a single day stranded by >2-day gaps on
    // both sides, and another contiguous pair.
    const g = buildChartGeometry(
      [
        p('2026-07-01', 10), p('2026-07-02', 20),
        p('2026-07-20', 15),
        p('2026-08-05', 30), p('2026-08-06', 40),
      ],
      100, 50,
    )!
    expect(g.soloPoints).toHaveLength(1)
    expect(g.soloPoints[0]).toEqual({ x: g.coords[2].x, y: g.coords[2].y })
  })

  it('reports no solo points when the series is fully contiguous', () => {
    const g = buildChartGeometry([p('2026-07-01', 10), p('2026-07-02', 20), p('2026-07-04', 30)], 100, 50)!
    expect(g.soloPoints).toEqual([])
  })
})

describe('nearestCoordIndex', () => {
  it('returns 0 for an empty array', () => {
    expect(nearestCoordIndex([], 42)).toBe(0)
  })

  it('picks the exact match at either endpoint', () => {
    const coords = [{ x: 0 }, { x: 1 }, { x: 100 }]
    expect(nearestCoordIndex(coords, 0)).toBe(0)
    expect(nearestCoordIndex(coords, 100)).toBe(2)
  })

  it('picks the nearest x on a gapped series, not an index-proportional guess', () => {
    // Coords sit at x = 0, 1, 100 (a 1-day run, then a wide gap). The OLD
    // index-proportional maths — round(ratio * (n - 1)) over a width-100 box —
    // would map targetX 60 (ratio 0.6) to round(0.6 * 2) = 1, i.e. the point at
    // x=1, even though x=100 is the actually-nearest coord (distance 40 vs 59).
    // Nearest-x must not make that mistake.
    const coords = [{ x: 0 }, { x: 1 }, { x: 100 }]
    expect(nearestCoordIndex(coords, 40)).toBe(1) // nearest is x=1 (distance 39 vs 40)
    expect(nearestCoordIndex(coords, 60)).toBe(2) // nearest is x=100 (distance 40 vs 59)
  })

  it('resolves an exact tie to the earlier index', () => {
    const coords = [{ x: 0 }, { x: 10 }]
    expect(nearestCoordIndex(coords, 5)).toBe(0)
  })
})
