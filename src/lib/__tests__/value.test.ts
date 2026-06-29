import { describe, it, expect } from 'vitest'
import { itemDifference, collectionTotals, filterItems } from '@/lib/value'

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
  it('filters by free-text search on name/set, case-insensitive', () => {
    expect(filterItems([A, B], { search: 'chari' })).toEqual([A])
    expect(filterItems([A, B], { search: 'alpha' })).toEqual([B])
  })
  it('returns all when no filters', () => { expect(filterItems([A, B], {})).toHaveLength(2) })
})
