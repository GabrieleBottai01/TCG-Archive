import { describe, it, expect } from 'vitest'
import { computeDailyReference, computeStrength, displayValue } from '@/lib/observatory/reference'

const listing = (priceEur: number, confirmedSale = false, quickSale = false) => ({
  priceEur,
  confirmedSale,
  quickSale,
})

describe('computeDailyReference — the median', () => {
  it('takes the middle value of an odd sample', () => {
    const r = computeDailyReference([listing(40), listing(50), listing(60)])
    expect(r.medianEur).toBe(50)
    expect(r.sampleSize).toBe(3)
  })

  it('averages the two middle values of an even sample', () => {
    const r = computeDailyReference([listing(40), listing(50), listing(52), listing(60)])
    expect(r.medianEur).toBe(51)
    expect(r.sampleSize).toBe(4)
  })

  it('is order-independent', () => {
    const a = computeDailyReference([listing(60), listing(40), listing(50)])
    const b = computeDailyReference([listing(40), listing(50), listing(60)])
    expect(a.medianEur).toBe(b.medianEur)
  })

  it('returns null with no observations at all', () => {
    const r = computeDailyReference([])
    expect(r.medianEur).toBeNull()
    expect(r.sampleSize).toBe(0)
    expect(r.trimmedCount).toBe(0)
  })

  it('counts confirmed and quick sales of the retained sample', () => {
    const r = computeDailyReference([
      listing(50, true, false),
      listing(52, false, true),
      listing(48, true, true),
    ])
    expect(r.confirmedSales).toBe(2)
    expect(r.quickSales).toBe(2)
  })

  it('rounds to cents rather than emitting float noise', () => {
    const r = computeDailyReference([listing(10.01), listing(10.02)])
    expect(r.medianEur).toBe(10.02)
  })
})

// The matcher has a known, unfixable residual false accept: a lone promo card
// advertised with a box's name. It WILL enter the sample. Trimming is not a
// nicety here — it is the second line of defence, and these tests pin it.
describe('computeDailyReference — trimming the promo-card false accept', () => {
  it('drops a 2 euro promo among 50 euro boxes at n=3', () => {
    const r = computeDailyReference([listing(2), listing(50), listing(52)])
    expect(r.medianEur).toBe(51)
    expect(r.sampleSize).toBe(2)
    expect(r.trimmedCount).toBe(1)
  })

  it('drops a 2 euro promo among 50 euro boxes at n=5', () => {
    const r = computeDailyReference([listing(2), listing(45), listing(50), listing(52), listing(60)])
    expect(r.medianEur).toBe(51)
    expect(r.sampleSize).toBe(4)
    expect(r.trimmedCount).toBe(1)
  })

  it('does not let a trimmed listing lend its sale to the product', () => {
    // The promo card sold. That is a fact about a promo card, not about the box.
    const r = computeDailyReference([listing(2, true, true), listing(50), listing(52)])
    expect(r.confirmedSales).toBe(0)
    expect(r.quickSales).toBe(0)
  })

  it('leaves an honest but wide spread completely alone', () => {
    const r = computeDailyReference([listing(45), listing(52), listing(60)])
    expect(r.medianEur).toBe(52)
    expect(r.sampleSize).toBe(3)
    expect(r.trimmedCount).toBe(0)
  })

  it('does not trim a merely optimistic listing within the fence', () => {
    const r = computeDailyReference([listing(45), listing(50), listing(100)])
    expect(r.trimmedCount).toBe(0)
    expect(r.medianEur).toBe(50)
  })

  it('trims an absurdly overpriced listing symmetrically', () => {
    const r = computeDailyReference([listing(45), listing(50), listing(900)])
    expect(r.trimmedCount).toBe(1)
    expect(r.medianEur).toBe(47.5)
  })

  it('cannot and does not trim at n=1 — nothing to compare against', () => {
    const r = computeDailyReference([listing(2)])
    expect(r.medianEur).toBe(2)
    expect(r.sampleSize).toBe(1)
    expect(r.trimmedCount).toBe(0)
  })

  it('cannot and does not trim at n=2 — which of the two is the liar is undecidable', () => {
    const r = computeDailyReference([listing(2), listing(50)])
    expect(r.medianEur).toBe(26)
    expect(r.sampleSize).toBe(2)
    expect(r.trimmedCount).toBe(0)
  })

  it('reports heavy trimming, which means the matcher is wrong about the product', () => {
    // Majority promo cards: the sample is telling us the title rule is broken.
    const r = computeDailyReference([listing(2), listing(3), listing(50)])
    expect(r.trimmedCount).toBe(1)
    expect(r.sampleSize).toBe(2)
  })

  it('survives a sample of identical prices without trimming everything', () => {
    // A MAD-based filter would implode here (MAD=0). This must not.
    const r = computeDailyReference([listing(50), listing(50), listing(52)])
    expect(r.trimmedCount).toBe(0)
    expect(r.medianEur).toBe(50)
  })

  it('never trims below an empty sample', () => {
    const r = computeDailyReference([listing(0), listing(0)])
    expect(r.sampleSize).toBe(2)
    expect(r.medianEur).toBe(0)
  })
})

describe('computeStrength — asks a 90-day question of the permanent history', () => {
  it('is NONE when today saw nothing, whatever the history says', () => {
    const history = [{ confirmedSales: 5, quickSales: 5 }]
    expect(computeStrength(history, 0)).toBe('NONE')
  })

  it('is WEAK when there are listings but no sales', () => {
    const history = [{ confirmedSales: 0, quickSales: 0 }]
    expect(computeStrength(history, 5)).toBe('WEAK')
  })

  it('is STRONG at exactly 3 sales with a sample of exactly 3', () => {
    const history = [
      { confirmedSales: 1, quickSales: 0 },
      { confirmedSales: 1, quickSales: 1 },
    ]
    expect(computeStrength(history, 3)).toBe('STRONG')
  })

  it('is WEAK at 3 sales but a sample of 2 — the day is too thin to trust', () => {
    const history = [{ confirmedSales: 3, quickSales: 0 }]
    expect(computeStrength(history, 2)).toBe('WEAK')
  })

  it('is WEAK at 2 sales even with a fat sample today', () => {
    const history = [{ confirmedSales: 1, quickSales: 1 }]
    expect(computeStrength(history, 20)).toBe('WEAK')
  })

  it('counts quick sales toward the total, not only confirmed ones', () => {
    const history = [{ confirmedSales: 0, quickSales: 3 }]
    expect(computeStrength(history, 3)).toBe('STRONG')
  })

  it('ignores rows outside the 90-row window', () => {
    // Ancient sales, then 90 barren days: those sales must no longer count.
    const history = [
      { confirmedSales: 5, quickSales: 5 },
      ...Array.from({ length: 90 }, () => ({ confirmedSales: 0, quickSales: 0 })),
    ]
    expect(computeStrength(history, 3)).toBe('WEAK')
  })

  it('keeps sales sitting exactly on the 90-row boundary', () => {
    const history = [
      { confirmedSales: 3, quickSales: 0 },
      ...Array.from({ length: 89 }, () => ({ confirmedSales: 0, quickSales: 0 })),
    ]
    expect(computeStrength(history, 3)).toBe('STRONG')
  })

  it('is WEAK with an empty history but listings today', () => {
    expect(computeStrength([], 4)).toBe('WEAK')
  })

  it('is NONE on an empty history and an empty day', () => {
    expect(computeStrength([], 0)).toBe('NONE')
  })
})

describe('displayValue — the number the user actually sees', () => {
  const day = (medianEur: number | null, sampleSize: number) => ({ medianEur, sampleSize })

  it('returns null when every day is empty', () => {
    expect(displayValue([day(null, 0), day(null, 0)])).toBeNull()
  })

  it('returns null on an empty history', () => {
    expect(displayValue([])).toBeNull()
  })

  it('skips empty days and takes the median of the rest', () => {
    expect(displayValue([day(40, 3), day(null, 0), day(50, 4), day(null, 0), day(60, 3)])).toBe(50)
  })

  it('takes the median of the daily medians, so one noisy day cannot swing it', () => {
    const steady = Array.from({ length: 13 }, () => day(50, 5))
    const noisy = [...steady, day(200, 2)]
    expect(displayValue(noisy)).toBe(50)
  })

  it('looks only at the last 14 days', () => {
    const ancient = Array.from({ length: 30 }, () => day(200, 5))
    const recent = Array.from({ length: 14 }, () => day(50, 5))
    expect(displayValue([...ancient, ...recent])).toBe(50)
  })

  it('ignores a day whose sampleSize is 0 even if it somehow carries a median', () => {
    expect(displayValue([day(999, 0), day(50, 3)])).toBe(50)
  })

  it('averages the two middle days on an even count', () => {
    expect(displayValue([day(40, 3), day(50, 3), day(52, 3), day(60, 3)])).toBe(51)
  })

  it('returns the single day when only one has data', () => {
    expect(displayValue([day(null, 0), day(47.5, 1)])).toBe(47.5)
  })
})
