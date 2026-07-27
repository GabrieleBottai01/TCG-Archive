// Where a market value came from, and therefore how much it can be trusted.
//
// The sources are not interchangeable claims:
//  - euReference: an EU price the observatory learned from eBay (median of daily
//                medians). Informational only — it is displayed as a hedged,
//                muted secondary line but NEVER substituted for the stored value
//                (see effectiveValue). It produced confidently-wrong lows that
//                flipped STRONG and dragged the collection value down.
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

export type PriceSourceKind = 'euReference' | 'cardmarket' | 'cardtrader' | 'estimate' | 'manual' | 'none'

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
  autoPriceSource?: string | null
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

/**
 * The value the collection actually counts. The observatory reference is
 * informational only — it must NEVER move the balance. It produced
 * confidently-wrong lows that flipped STRONG and dragged the value down (a
 * €10,70 STRONG ref for a €97 product); see the F-core spec. The stored
 * marketValue (Cardtrader / eBay estimate / manual) is the value.
 */
export function effectiveValue(i: {
  itemType: string
  externalId?: string | null
  marketValue: number
  euReference?: EuReference | null
}): number {
  return i.marketValue
}

export function priceSourceOf(i: PriceSourceInput): PriceSource {
  const auto = i.marketValueSource === 'AUTO'
  const hasId = !!i.externalId && i.externalId !== ''

  if (auto && i.itemType === 'RAW' && hasId && !isTcgcsvId(i.externalId)) {
    return { kind: 'cardmarket', langMismatch: false }
  }
  if (auto && i.itemType === 'SEALED' && isTcgcsvId(i.externalId)) {
    // The sealed AUTO price is now the live eBay EU median (tcgcsv only fills in
    // when eBay finds nothing), so there is no "priced off the English product"
    // caveat any more — it is a European estimate.
    //
    // Cardtrader is the primary EU marketplace price; the eBay median is the fallback.
    if (i.autoPriceSource === 'cardtrader') return { kind: 'cardtrader', langMismatch: false }
    return { kind: 'estimate', langMismatch: false }
  }
  if (i.marketValue > 0) return { kind: 'manual', langMismatch: false }
  return { kind: 'none', langMismatch: false }
}

/** i18n key for the short chip label of each source. */
export const PRICE_SOURCE_KEY: Record<PriceSourceKind, string> = {
  euReference: 'src_euReference',
  cardmarket: 'src_cardmarket',
  cardtrader: 'src_cardtrader',
  estimate: 'src_estimate',
  manual: 'src_manual',
  none: 'src_none',
}
