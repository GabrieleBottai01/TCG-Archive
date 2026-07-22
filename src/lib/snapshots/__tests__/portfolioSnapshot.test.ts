import { describe, it, expect } from 'vitest'
import { buildSnapshot, startOfUtcDay, type SnapshotItem } from '@/lib/snapshots/portfolioSnapshot'
import { collectionTotals } from '@/lib/value'

const item = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  id: 'i1', quantity: 1, purchasePrice: 10, marketValue: 25,
  itemType: 'SEALED', externalId: 'tcgcsv:1:2',
  marketValueSource: 'AUTO', marketValueUpdatedAt: new Date('2026-07-20T00:00:00Z'),
  ...over,
})

describe('buildSnapshot', () => {
  it('totals agree with collectionTotals for the same items', () => {
    const items = [item(), item({ id: 'i2', quantity: 3, purchasePrice: 5, marketValue: 8 })]
    const built = buildSnapshot(items)
    const expected = collectionTotals(items)
    expect(built.totalValue).toBe(expected.totalValue)
    expect(built.totalCost).toBe(expected.totalCost)
    expect(built.itemCount).toBe(expected.itemCount)
    expect(built.pieceCount).toBe(expected.pieceCount)
  })

  it('emits one per-item row carrying the PER-UNIT value and the quantity', () => {
    const built = buildSnapshot([item({ id: 'a', quantity: 4, marketValue: 30 })])
    expect(built.items).toEqual([{ itemId: 'a', valueEur: 30, quantity: 4 }])
  })

  it('honours a STRONG EU reference exactly as the dashboard does', () => {
    // effectiveValue substitutes a STRONG reference for the stored marketValue.
    const strong = item({
      id: 's', marketValue: 100,
      euReference: { strength: 'STRONG', displayValue: 140, sampleSize: 9, sales: 3 },
    })
    const built = buildSnapshot([strong])
    expect(built.items[0].valueEur).toBe(140)
    expect(built.totalValue).toBe(140)
  })

  it('pricesAsOf is the OLDEST marketValueUpdatedAt among AUTO-priced items', () => {
    const built = buildSnapshot([
      item({ id: 'old', marketValueUpdatedAt: new Date('2026-07-01T00:00:00Z') }),
      item({ id: 'new', marketValueUpdatedAt: new Date('2026-07-21T00:00:00Z') }),
    ])
    expect(built.pricesAsOf).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('ignores MANUAL items when computing pricesAsOf, and is null when none are AUTO', () => {
    const manualOld = item({ id: 'm', marketValueSource: 'MANUAL', marketValueUpdatedAt: new Date('2020-01-01T00:00:00Z') })
    const auto = item({ id: 'a', marketValueUpdatedAt: new Date('2026-07-21T00:00:00Z') })
    expect(buildSnapshot([manualOld, auto]).pricesAsOf).toEqual(new Date('2026-07-21T00:00:00Z'))
    expect(buildSnapshot([manualOld]).pricesAsOf).toBeNull()
  })

  it('returns zeroed totals and no rows for an empty collection', () => {
    expect(buildSnapshot([])).toEqual({
      totalValue: 0, totalCost: 0, itemCount: 0, pieceCount: 0, pricesAsOf: null, items: [],
    })
  })
})

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC so one calendar day yields one row', () => {
    expect(startOfUtcDay(new Date('2026-07-22T23:59:59.999Z'))).toEqual(new Date('2026-07-22T00:00:00.000Z'))
    expect(startOfUtcDay(new Date('2026-07-22T00:00:00.000Z'))).toEqual(new Date('2026-07-22T00:00:00.000Z'))
  })
})
