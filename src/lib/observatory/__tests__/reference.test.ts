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
  })

  it('counts confirmed and quick sales across every observation', () => {
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

// The matcher has a known, unfixable residual false accept: a lone ~2 euro promo
// card advertised with a ~50 euro box's name. It WILL enter the sample. The median
// is the ONLY defence, and it needs no help: its breakdown point is 50%
// contamination. An outlier fence was tried here and measured net negative — it
// won one case by 2 euro and lost [20, 50, 130] by 30%. These tests pin the
// robustness the plain median actually has, so nobody adds a fence back.
describe('computeDailyReference — the median absorbs the promo-card false accept', () => {
  it('holds the true 50 with one 2 euro promo among two boxes', () => {
    const r = computeDailyReference([listing(2), listing(50), listing(52)])
    expect(r.medianEur).toBe(50)
    expect(r.sampleSize).toBe(3)
  })

  it('lands within 2 euro of the true 52 with two promos among three boxes — acceptable noise', () => {
    // The promos drag the median one rank down the honest values: 52 -> 50. That
    // is a 4% error on a minority-contaminated sample. It needs no mechanism.
    const r = computeDailyReference([listing(2), listing(2), listing(50), listing(52), listing(55)])
    expect(r.medianEur).toBe(50)
    expect(r.sampleSize).toBe(5)
  })

  it('leaves an honest but wide spread completely alone', () => {
    const r = computeDailyReference([listing(45), listing(52), listing(60)])
    expect(r.medianEur).toBe(52)
    expect(r.sampleSize).toBe(3)
  })

  it('holds the true 50 against a HIGH outlier, where a fence would have said 35', () => {
    // The case that killed the fence. Trimming 130 leaves [20, 50] -> 35, a 30%
    // error: removing a high value at n=3 drags the median DOWN off the truth.
    const r = computeDailyReference([listing(20), listing(50), listing(130)])
    expect(r.medianEur).toBe(50)
    expect(r.sampleSize).toBe(3)
  })

  it('holds the true 50 against an extreme high outlier — magnitude cannot move a median', () => {
    const r = computeDailyReference([listing(45), listing(50), listing(900)])
    expect(r.medianEur).toBe(50)
    expect(r.sampleSize).toBe(3)
  })

  it('counts the sale of a promo listing, because it no longer knows it is one', () => {
    // Honest consequence of dropping the fence: nothing is classified as foreign,
    // so a promo's sale lends strength to the box. `strength` is the backstop.
    const r = computeDailyReference([listing(2, true, true), listing(50), listing(52)])
    expect(r.confirmedSales).toBe(1)
    expect(r.quickSales).toBe(1)
  })
})

// DOCUMENTED LIMITS — NOT BUGS, AND NOT FIXABLE HERE.
// These two samples produce a wrong number, and both are pinned deliberately so a
// future reader finds the limit stated rather than rediscovering it. Neither is a
// case for an outlier fence: a fence was measured and made the overall result
// worse. Containment lives downstream, in `strength: WEAK` and a UI that honours it.
describe('computeDailyReference — where the number is genuinely wrong', () => {
  it('LIMIT: at n=2 [2, 50] returns 26, because no median can resolve a 50/50 sample', () => {
    // There is no majority to find. Which value is the liar is undecidable, and
    // inventing a reason to drop one would be arbitrary. The defence is WEAK.
    const r = computeDailyReference([listing(2), listing(50)])
    expect(r.medianEur).toBe(26)
    expect(r.sampleSize).toBe(2)
    expect(computeStrength([{ confirmedSales: 9, quickSales: 9 }], r.sampleSize)).toBe('WEAK')
  })

  it('LIMIT: past 50% contamination [2, 2, 2, 50] returns 2, and no median-anchored method survives', () => {
    // The promos ARE the majority; the median reports what the sample says. A
    // fence does not help — it would anchor on the promos and trim the real box.
    const r = computeDailyReference([listing(2), listing(2), listing(2), listing(50)])
    expect(r.medianEur).toBe(2)
    expect(r.sampleSize).toBe(4)
  })

  it('LIMIT: at n=1 the lone value is the reference, whatever it is', () => {
    const r = computeDailyReference([listing(2)])
    expect(r.medianEur).toBe(2)
    expect(r.sampleSize).toBe(1)
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

  it('LIMIT: absorbs a bad DAY but not a bad BIAS — 14 thin days keep their -48% error', () => {
    // 14 consecutive [2, 50] days each compute a median of 26 against a true 50.
    // The window medians 26s into a 26: a persistently-thin product carries its
    // systematic error straight through to the user. The 14-day median only ever
    // rejected a thin day that DISAGREED with its neighbours. Containment for this
    // product depends entirely on the UI honouring WEAK, not on the maths here.
    const persistentlyThin = Array.from({ length: 14 }, () => day(26, 2))
    expect(displayValue(persistentlyThin)).toBe(26)
  })
})
