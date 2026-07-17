import { describe, it, expect } from 'vitest'
import { summariseReference, type RefHistoryRow } from '@/lib/observatory/euReference'

const day = (medianEur: number | null, sampleSize: number, quickSales = 0): RefHistoryRow => ({
  medianEur,
  sampleSize,
  confirmedSales: 0,
  quickSales,
})

describe('summariseReference', () => {
  it('reports NONE with no data at all', () => {
    expect(summariseReference([])).toEqual({ strength: 'NONE', displayValue: null, sampleSize: 0, sales: 0 })
  })

  it('is WEAK when there are listings but not enough sales', () => {
    const r = summariseReference([day(95, 4)])
    expect(r.strength).toBe('WEAK')
    expect(r.displayValue).toBe(95)
    expect(r.sampleSize).toBe(4)
    expect(r.sales).toBe(0)
  })

  it('is STRONG once the 90-day sales sum and today’s sample both clear 3', () => {
    const history = [day(90, 4, 3), day(96, 3)] // 3 sales banked, today sample 3
    const r = summariseReference(history)
    expect(r.strength).toBe('STRONG')
    expect(r.sales).toBe(3)
    expect(r.sampleSize).toBe(3) // today's sample is the latest row
    expect(r.displayValue).toBe(93) // median of daily medians [90, 96]
  })

  it('takes the display value from the last 14 days, not just today', () => {
    // Today is thin (2 listings at 26) but the fortnight sits at 50 — the display
    // value must not lurch to today's number.
    const history = [day(50, 5), day(50, 5), day(26, 2)]
    expect(summariseReference(history).displayValue).toBe(50)
  })
})
