// Where a market value came from, and therefore how much it can be trusted.
//
// The sources are not interchangeable claims:
//  - euReference: an EU price the observatory learned from eBay (median of daily
//                medians). The most trustworthy for sealed — but ONLY when its
//                strength is STRONG. A WEAK reference is shown but never allowed to
//                move the money (see effectiveValue).
//  - cardmarket: a real European market price (Cardmarket, via TCGdex). Trustworthy.
//  - estimate:   a US TCGplayer price (tcgcsv) converted from USD. Indicative only —
//                measured at roughly 2.5-3x off Cardmarket EU for sealed products.
//                For a non-English item it is the ENGLISH product's price, because
//                the tcgcsv catalogue has no Italian or Japanese sealed products.
//  - manual:     a number the collector typed.
//  - none:       no automatic price is available and none was entered.
//
// Derived rather than stored: `marketValueSource` says AUTO/MANUAL, and the
// `externalId` prefix says which provider AUTO means.

export type PriceSourceKind = 'euReference' | 'cardmarket' | 'estimate' | 'manual' | 'none'

export type Strength = 'STRONG' | 'WEAK' | 'NONE'

/** The observatory's EU reference for one (product, language), summarised for display. */
export type EuReference = {
  strength: Strength
  /** The number the user sees — median of the last 14 daily medians. Null if none. */
  displayValue: number | null
  /** Today's observation count. */
  sampleSize: number
  /** Sales (confirmed + quick) over the 90-day window — what earns STRONG. */
  sales: number
}

export type PriceSourceInput = {
  itemType: string
  externalId: string | null
  marketValue: number
  marketValueSource: string | null
  language?: string | null
  euReference?: EuReference | null
}

export type PriceSource = {
  kind: PriceSourceKind
  /** True when the figure is a US estimate for a product that is not English. */
  langMismatch: boolean
  /** Only present when kind is 'euReference'; drives the chip's colour and copy. */
  strength?: 'STRONG' | 'WEAK'
}

export function isTcgcsvId(externalId: string | null): boolean {
  return !!externalId && externalId.startsWith('tcgcsv:')
}

/** A sealed tcgcsv item with a usable, non-NONE EU reference. */
function hasShowableEuReference(i: {
  itemType: string
  externalId: string | null
  euReference?: EuReference | null
}): i is typeof i & { euReference: EuReference & { strength: 'STRONG' | 'WEAK' } } {
  const eu = i.euReference
  return (
    i.itemType === 'SEALED' &&
    isTcgcsvId(i.externalId) &&
    !!eu &&
    eu.displayValue !== null &&
    eu.strength !== 'NONE'
  )
}

/**
 * The value the collection actually counts. A STRONG EU reference replaces the US
 * estimate; anything less (WEAK/NONE/absent) leaves the stored value untouched.
 *
 * This STRONG-only gate is the containment for the observatory's known failure
 * mode — a persistently thin sample produces a confidently wrong EU number. Never
 * relax it to WEAK: a weak number moving the balance is the exact outcome the
 * whole strength system exists to prevent.
 */
export function effectiveValue(i: {
  itemType: string
  externalId?: string | null
  marketValue: number
  euReference?: EuReference | null
}): number {
  const eu = i.euReference
  if (
    i.itemType === 'SEALED' &&
    isTcgcsvId(i.externalId ?? null) &&
    eu?.strength === 'STRONG' &&
    eu.displayValue !== null
  ) {
    return eu.displayValue
  }
  return i.marketValue
}

export function priceSourceOf(i: PriceSourceInput): PriceSource {
  const auto = i.marketValueSource === 'AUTO'
  const hasId = !!i.externalId && i.externalId !== ''

  // A usable EU reference is the top source for a sealed product — it is a real
  // European price, not a converted US one. WEAK still shows here (amber, hedged);
  // only the value substitution in effectiveValue is gated to STRONG.
  if (hasShowableEuReference(i)) {
    return { kind: 'euReference', langMismatch: false, strength: i.euReference.strength }
  }

  if (auto && i.itemType === 'RAW' && hasId && !isTcgcsvId(i.externalId)) {
    return { kind: 'cardmarket', langMismatch: false }
  }
  if (auto && i.itemType === 'SEALED' && isTcgcsvId(i.externalId)) {
    // The sealed AUTO price is now the live eBay EU median (tcgcsv only fills in
    // when eBay finds nothing), so there is no "priced off the English product"
    // caveat any more — it is a European estimate.
    return { kind: 'estimate', langMismatch: false }
  }
  if (i.marketValue > 0) return { kind: 'manual', langMismatch: false }
  return { kind: 'none', langMismatch: false }
}

/** i18n key for the short chip label of each source. */
export const PRICE_SOURCE_KEY: Record<PriceSourceKind, string> = {
  euReference: 'src_euReference',
  cardmarket: 'src_cardmarket',
  estimate: 'src_estimate',
  manual: 'src_manual',
  none: 'src_none',
}
