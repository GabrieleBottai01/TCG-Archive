import { describe, it, expect } from 'vitest'
import { itemDifference, collectionTotals, filterItems, sortItems } from '@/lib/value'

const A = { quantity: 2, purchasePrice: 5, marketValue: 8, game: 'POKEMON', itemType: 'RAW', condition: 'MINT', setName: 'Base', name: 'Charizard' }
const B = { quantity: 1, purchasePrice: 20, marketValue: 15, game: 'MAGIC', itemType: 'SEALED', condition: null, setName: 'Alpha', name: 'Box' }

describe('itemDifference', () => {
  it('multiplies the per-unit delta by quantity', () => {
    expect(itemDifference(A)).toBe(6)   // (8-5)*2
    expect(itemDifference(B)).toBe(-5)  // (15-20)*1
  })
})

describe('collectionTotals', () => {
  it('sums value, cost, P/L and counts', () => {
    const t = collectionTotals([A, B])
    expect(t.totalValue).toBe(31)  // 8*2 + 15*1
    expect(t.totalCost).toBe(30)   // 5*2 + 20*1
    expect(t.profitLoss).toBe(1)
    expect(t.itemCount).toBe(2)
    expect(t.pieceCount).toBe(3)
  })
  it('returns zeros for empty input', () => {
    expect(collectionTotals([])).toEqual({ totalValue: 0, totalCost: 0, profitLoss: 0, itemCount: 0, pieceCount: 0 })
  })
})

describe('filterItems', () => {
  it('filters by game', () => { expect(filterItems([A, B], { game: 'POKEMON' })).toEqual([A]) })
  it('filters by itemType', () => { expect(filterItems([A, B], { itemType: 'RAW' })).toEqual([A]) })
  it('filters by condition', () => { expect(filterItems([A, B], { condition: 'MINT' })).toEqual([A]) })
  it('filters by setName', () => { expect(filterItems([A, B], { setName: 'Alpha' })).toEqual([B]) })
  it('filters by free-text search on name/set, case-insensitive', () => {
    expect(filterItems([A, B], { search: 'chari' })).toEqual([A])
    expect(filterItems([A, B], { search: 'alpha' })).toEqual([B])
  })
  it('returns all when no filters', () => { expect(filterItems([A, B], {})).toEqual([A, B]) })
})

const S = [
  { quantity: 1, purchasePrice: 0, marketValue: 5, name: 'Bravo', game: 'MAGIC', createdAt: '2026-01-02' },
  { quantity: 3, purchasePrice: 0, marketValue: 1, name: 'alpha', game: 'POKEMON', createdAt: '2026-01-01' },
  { quantity: 2, purchasePrice: 10, marketValue: 2, name: 'Charlie', game: 'POKEMON', createdAt: '2026-01-03' },
]

describe('sortItems', () => {
  it('sorts by marketValue desc/asc', () => {
    expect(sortItems(S, { key: 'marketValue', dir: 'desc' }).map((i) => i.marketValue)).toEqual([5, 2, 1])
    expect(sortItems(S, { key: 'marketValue', dir: 'asc' }).map((i) => i.marketValue)).toEqual([1, 2, 5])
  })
  it('sorts by name case-insensitively', () => {
    expect(sortItems(S, { key: 'name', dir: 'asc' }).map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
  })
  it('sorts by difference (per-line P/L)', () => {
    // diffs: Bravo (5-0)*1=5, alpha (1-0)*3=3, Charlie (2-10)*2=-16
    expect(sortItems(S, { key: 'difference', dir: 'desc' }).map((i) => i.name)).toEqual(['Bravo', 'alpha', 'Charlie'])
  })
  it('sorts by createdAt and does not mutate input', () => {
    const before = S.map((i) => i.name)
    expect(sortItems(S, { key: 'createdAt', dir: 'asc' }).map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(S.map((i) => i.name)).toEqual(before)
  })
})
