import { describe, it, expect } from 'vitest'
import { itemDifference, collectionTotals, filterItems, sortItems, groupTotals, topByValue, topByDifference, averageValuePerPiece } from '@/lib/value'

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

describe('filterItems advanced', () => {
  const X = [
    { quantity: 1, purchasePrice: 2, marketValue: 5, setName: 'Base', language: 'IT' },   // diff +3
    { quantity: 1, purchasePrice: 10, marketValue: 4, setName: 'Jungle', language: 'EN' }, // diff -6
    { quantity: 2, purchasePrice: 1, marketValue: 1, setName: 'Base Set 2', language: null },// diff 0
  ]
  it('filters by value range (inclusive, per unit)', () => {
    expect(filterItems(X, { minValue: 4, maxValue: 5 })).toHaveLength(2)
    expect(filterItems(X, { minValue: 5 })).toHaveLength(1)
  })
  it('filters by P/L gain/loss', () => {
    expect(filterItems(X, { pl: 'gain' })).toHaveLength(1)
    expect(filterItems(X, { pl: 'loss' })).toHaveLength(1)
  })
  it('filters by set substring (case-insensitive) and language', () => {
    expect(filterItems(X, { setName: 'base' })).toHaveLength(2)
    expect(filterItems(X, { language: 'it' })).toHaveLength(1)
  })
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
  it('sorts by game', () => {
    expect(sortItems(S, { key: 'game', dir: 'asc' }).map((i) => i.game)).toEqual(['MAGIC', 'POKEMON', 'POKEMON'])
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

const G = [
  { quantity: 1, purchasePrice: 1, marketValue: 10, itemType: 'RAW' },   // diff +9, value 10
  { quantity: 2, purchasePrice: 5, marketValue: 3, itemType: 'RAW' },    // diff -4, value 6
  { quantity: 1, purchasePrice: 0, marketValue: 20, itemType: 'SEALED' },// diff +20, value 20
]

describe('stats', () => {
  it('groupTotals groups and totals by key', () => {
    const g = groupTotals(G, (i) => i.itemType ?? '')
    const raw = g.find((x) => x.key === 'RAW')!
    expect(raw.totals.totalValue).toBe(16) // 10 + 3*2
    expect(g.find((x) => x.key === 'SEALED')!.totals.totalValue).toBe(20)
  })
  it('topByValue ranks by line value desc', () => {
    expect(topByValue(G, 2).map((i) => i.marketValue)).toEqual([20, 10])
  })
  it('topByDifference desc=gains, asc=losses', () => {
    expect(topByDifference(G, 1, 'desc')[0].marketValue).toBe(20) // +20 gain
    expect(topByDifference(G, 1, 'asc')[0].marketValue).toBe(3)   // -4 loss
  })
  it('averageValuePerPiece divides total value by pieces', () => {
    expect(averageValuePerPiece(G)).toBe(36 / 4) // value 36 over 4 pieces
    expect(averageValuePerPiece([])).toBe(0)
  })
})
