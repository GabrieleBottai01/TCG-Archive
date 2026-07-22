import { describe, it, expect } from 'vitest'
import { itemDifferencePercent, type ValueItem } from '@/lib/value'

const item = (over: Partial<ValueItem> = {}): ValueItem => ({
  quantity: 1, purchasePrice: 100, marketValue: 138, ...over,
})

describe('itemDifferencePercent', () => {
  it('is the gain over what the item cost', () => {
    expect(itemDifferencePercent(item())).toBeCloseTo(38, 5)
  })

  it('is negative when the item lost value', () => {
    expect(itemDifferencePercent(item({ marketValue: 75 }))).toBeCloseTo(-25, 5)
  })

  it('measures against the TOTAL cost, so quantity cancels out', () => {
    // 4 × (138 − 100) = +152 on 4 × 100 = 400 → still +38%
    expect(itemDifferencePercent(item({ quantity: 4 }))).toBeCloseTo(38, 5)
  })

  it('is null when the item cost nothing — a percentage off zero is undefined, not infinite', () => {
    expect(itemDifferencePercent(item({ purchasePrice: 0 }))).toBeNull()
    expect(itemDifferencePercent(item({ purchasePrice: 0, marketValue: 0 }))).toBeNull()
  })

  it('is 0 when the value did not move', () => {
    expect(itemDifferencePercent(item({ marketValue: 100 }))).toBe(0)
  })
})
