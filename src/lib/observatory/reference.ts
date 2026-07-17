// Turns observed eBay listings into a European reference price.
//
// Pure maths: no DB, no network, no eBay. The daily job supplies the rows and
// persists the result; everything here is a function of its arguments.
//
// THE 30-vs-90 DAY SPLIT — the reason this file has three functions instead of
// one. Raw observations are pruned at 30 days, but `strength` asks a 90-day
// question. So `computeDailyReference` reads the live raw sample (<=30d), while
// `computeStrength` and `displayValue` read ONLY the permanent `PriceReference`
// history. A 90-day question can never be asked of the raw rows: they are gone.
//
// The field names returned by `computeDailyReference` are exactly the columns of
// the `PriceReference` model. Keep them aligned.

export type DailyObservation = {
  priceEur: number
  confirmedSale: boolean
  quickSale: boolean
}

export type DailyReference = {
  medianEur: number | null
  /** Every observation of the day. Nothing is discarded — see WHY NO OUTLIER FENCE. */
  sampleSize: number
  confirmedSales: number
  quickSales: number
}

export type Strength = 'STRONG' | 'WEAK' | 'NONE'

/** Rows of permanent history are chronological, oldest first: the newest is last. */
const STRENGTH_WINDOW_DAYS = 90
const DISPLAY_WINDOW_DAYS = 14
const SALES_FOR_STRONG = 3
const SAMPLE_FOR_STRONG = 3

// WHY NO OUTLIER FENCE. THE MEDIAN IS ALREADY THE DEFENCE.
//
// The matcher has a known, unfixable residual false accept: `Destined Rivals
// Elite Trainer Box ENG Promo Card` may be a lone ~2 euro promo card rather than
// a ~50 euro box advertising the promo inside it, and no title-only rule can tell
// them apart. Such listings WILL enter the sample.
//
// A multiplicative fence (median/2.5 .. median*2.5, n>=3) used to sit here to trim
// them. It was removed: the median's breakdown point is 50% contamination, so it
// already survives the promo case unaided, and the fence was measured net negative
// against the true value:
//
//   [2, 50, 52]      true 50 | median 50 ✓ | fenced 51      — fence no better
//   [2, 2, 50, 52, 55] true 52 | median 50   | fenced 52 ✓   — fence wins by 2 euro
//   [20, 50, 130]    true 50 | median 50 ✓ | fenced 35 ✗    — fence off by 30%
//   [45, 50, 900]    true 50 | median 50 ✓ | fenced 47.5     — fence no better
//
// The fence bought one 2-euro improvement (noise) and cost a 30% error: trimming a
// HIGH value at n=3 drags the median DOWN off the true price. It was also inert
// where it was supposed to help cheap products (a 2 euro promo against a 5 euro
// booster pack is inside K=2.5), and its `trimmedCount` warning signal inverted —
// at [2, 2, 2, 50] the fence anchors on the promos, trims the real box, and
// reports a healthy sample. Do not reintroduce it.
//
// WHERE THE NUMBER IS GENUINELY WRONG (pinned by name in the tests, not hidden):
//   n=2  — [2, 50] yields 26. No median can resolve a 50/50 sample; there is no
//          majority to find. The defence is `strength: WEAK`, nothing else.
//   >50% — [2, 2, 2, 50] yields 2. Past half contamination no median-anchored
//          method survives, and no fence would have saved it either.

/** Median of a non-empty list. Caller guarantees non-empty. */
function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Prices are money: keep them at cents and out of float-noise territory. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Today's reference: the plain median of the live raw observations (<=30 days).
 * Nothing is discarded — see WHY NO OUTLIER FENCE above.
 */
export function computeDailyReference(obs: DailyObservation[]): DailyReference {
  if (obs.length === 0) {
    return { medianEur: null, sampleSize: 0, confirmedSales: 0, quickSales: 0 }
  }

  const sorted = obs.map((o) => o.priceEur).sort((a, b) => a - b)

  return {
    medianEur: toCents(medianOf(sorted)),
    sampleSize: obs.length,
    confirmedSales: obs.filter((o) => o.confirmedSale).length,
    quickSales: obs.filter((o) => o.quickSale).length,
  }
}

/**
 * Today's strength. Reads the PERMANENT history (never the raw observations,
 * which are pruned at 30 days and cannot answer a 90-day question).
 *
 * @param history chronological, oldest first; only the last 90 rows are read.
 * @param todaySample today's `sampleSize` — the count of today's observations.
 */
export function computeStrength(
  history: { confirmedSales: number; quickSales: number }[],
  todaySample: number,
): Strength {
  // No valid observation today: we have nothing to say, regardless of history.
  if (todaySample <= 0) return 'NONE'

  const window = history.slice(-STRENGTH_WINDOW_DAYS)
  const sales = window.reduce((sum, day) => sum + day.confirmedSales + day.quickSales, 0)

  return sales >= SALES_FOR_STRONG && todaySample >= SAMPLE_FOR_STRONG ? 'STRONG' : 'WEAK'
}

/**
 * The number the user sees. Not today's median — a day with 2 listings would
 * make it oscillate — but the median of the daily medians over the last 14 days
 * that actually had a sample. Damps noise and survives empty days.
 *
 * WHAT THIS DOES NOT DO: it absorbs a bad DAY, not a bad BIAS. The window is a
 * median over days, so it only rejects a thin day that disagrees with its
 * neighbours. A product that is *persistently* thin repeats its error instead:
 * 14 consecutive [2, 50] days each yield 26 euro, and the 14-day median of those
 * is 26 euro against a true 50 — a -48% systematic error, the same order as the
 * US-based estimate this whole feature exists to replace.
 *
 * So containment for a persistently-thin product rests ENTIRELY on the UI
 * honouring `strength: WEAK`. The maths here does not and cannot provide it.
 *
 * @param history chronological, oldest first; only the last 14 rows are read.
 */
export function displayValue(history: { medianEur: number | null; sampleSize: number }[]): number | null {
  const days = history
    .slice(-DISPLAY_WINDOW_DAYS)
    .filter((d): d is { medianEur: number; sampleSize: number } => d.sampleSize > 0 && d.medianEur !== null)

  if (days.length === 0) return null

  const sorted = days.map((d) => d.medianEur).sort((a, b) => a - b)
  return toCents(medianOf(sorted))
}
