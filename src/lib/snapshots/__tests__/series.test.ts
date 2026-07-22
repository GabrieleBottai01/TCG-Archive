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
