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
  /** Count AFTER trimming — the sample the median actually rests on. */
  sampleSize: number
  confirmedSales: number
  quickSales: number
  /** Not persisted. A product trimming half its listings means the matcher is wrong about it. */
  trimmedCount: number
}

export type Strength = 'STRONG' | 'WEAK' | 'NONE'

/** Rows of permanent history are chronological, oldest first: the newest is last. */
const STRENGTH_WINDOW_DAYS = 90
const DISPLAY_WINDOW_DAYS = 14
const SALES_FOR_STRONG = 3
const SAMPLE_FOR_STRONG = 3

// WHY A MULTIPLICATIVE FENCE, AND NOT IQR OR MAD.
//
// The matcher has a known, unfixable residual false accept: `Destined Rivals
// Elite Trainer Box ENG Promo Card` may be a lone ~2 euro promo card rather than
// a ~50 euro box advertising the promo inside it, and no title-only rule can tell
// them apart. Such listings WILL enter the sample, so the median must be robust
// to them by design — that is its job here, not a nicety.
//
// The defining property of this error is that it is *multiplicative*: a promo
// card is ~25x cheaper than its box, while honest listings of the same box vary
// by well under 2x (condition, shipping, seller optimism). So the fence is a
// ratio around the median, not a distance:  median/K <= price <= median*K.
//
// K = 2.5 sits in the wide gap between those two worlds: it keeps a 100 euro ask
// on a 50 euro box (optimism, not a different product) and drops a 2 euro promo.
//
// Rejected alternatives, both of which fail precisely where our samples live:
//   * IQR fence — undefined-to-useless at n=3. For [2, 50, 52] the fence computes
//     to roughly [-11, 88] and the 2 euro promo SURVIVES. Useless exactly here.
//   * MAD fence — implodes to zero whenever half the sample ties, which is common
//     at n=3. For [50, 50, 52] MAD = 0 and the honest 52 gets trimmed.
// The ratio fence has neither failure mode and needs no special-casing.
//
// BEHAVIOUR AT THE SMALL n WHERE MOST SAMPLES LIVE:
//   n=1 — no trimming. There is no majority to define a centre; the lone value is
//         both the median and the only candidate outlier. Nothing can be decided.
//   n=2 — no trimming. Which of [2, 50] is the liar is genuinely undecidable: the
//         midpoint 26 is a poor number, but inventing a reason to drop one of the
//         two would be arbitrary. The layers downstream handle it — sampleSize 2
//         forces WEAK, and `displayValue`'s 14-day median absorbs the day.
//   n>=3 — trimming fires. The raw median now has a real majority behind it (the
//         median tolerates up to 50% contamination), so it is a trustworthy anchor
//         for the fence even when one of the three values is a promo card.
const OUTLIER_FENCE_RATIO = 2.5
const MIN_SAMPLE_TO_TRIM = 3

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
 * Today's reference, computed from the live raw observations (<=30 days).
 * Outliers are trimmed before the median is taken — see OUTLIER_FENCE_RATIO.
 */
export function computeDailyReference(obs: DailyObservation[]): DailyReference {
  if (obs.length === 0) {
    return { medianEur: null, sampleSize: 0, confirmedSales: 0, quickSales: 0, trimmedCount: 0 }
  }

  const kept = trimOutliers(obs)

  // Sales are counted on the RETAINED sample only. A trimmed listing is, by our
  // own reckoning, a different product — its sale is evidence about that product,
  // not about this one, and must not lend it strength.
  const sorted = kept.map((o) => o.priceEur).sort((a, b) => a - b)

  return {
    medianEur: toCents(medianOf(sorted)),
    sampleSize: kept.length,
    confirmedSales: kept.filter((o) => o.confirmedSale).length,
    quickSales: kept.filter((o) => o.quickSale).length,
    trimmedCount: obs.length - kept.length,
  }
}

function trimOutliers(obs: DailyObservation[]): DailyObservation[] {
  if (obs.length < MIN_SAMPLE_TO_TRIM) return obs

  const sorted = obs.map((o) => o.priceEur).sort((a, b) => a - b)
  const anchor = medianOf(sorted)

  // A non-positive anchor gives a degenerate fence that would trim everything.
  // There is nothing sensible to trim around, so don't.
  if (anchor <= 0) return obs

  const low = anchor / OUTLIER_FENCE_RATIO
  const high = anchor * OUTLIER_FENCE_RATIO
  const kept = obs.filter((o) => o.priceEur >= low && o.priceEur <= high)

  // The anchor is itself a member, so `kept` can never be empty. Belt and braces.
  return kept.length > 0 ? kept : obs
}

/**
 * Today's strength. Reads the PERMANENT history (never the raw observations,
 * which are pruned at 30 days and cannot answer a 90-day question).
 *
 * @param history chronological, oldest first; only the last 90 rows are read.
 * @param todaySample today's post-trim `sampleSize`.
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
