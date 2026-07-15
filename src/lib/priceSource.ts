// Where a market value came from, and therefore how much it can be trusted.
//
// The three sources are not interchangeable claims:
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

export type PriceSourceKind = 'cardmarket' | 'estimate' | 'manual' | 'none'

export type PriceSourceInput = {
  itemType: string
  externalId: string | null
  marketValue: number
  marketValueSource: string | null
  language?: string | null
}

export type PriceSource = {
  kind: PriceSourceKind
  /** True when the figure is a US estimate for a product that is not English. */
  langMismatch: boolean
}

export function isTcgcsvId(externalId: string | null): boolean {
  return !!externalId && externalId.startsWith('tcgcsv:')
}

export function priceSourceOf(i: PriceSourceInput): PriceSource {
  const auto = i.marketValueSource === 'AUTO'
  const hasId = !!i.externalId && i.externalId !== ''

  if (auto && i.itemType === 'RAW' && hasId && !isTcgcsvId(i.externalId)) {
    return { kind: 'cardmarket', langMismatch: false }
  }
  if (auto && i.itemType === 'SEALED' && isTcgcsvId(i.externalId)) {
    // tcgcsv only carries English products, so any other language is the English price.
    return { kind: 'estimate', langMismatch: (i.language ?? 'EN') !== 'EN' }
  }
  if (i.marketValue > 0) return { kind: 'manual', langMismatch: false }
  return { kind: 'none', langMismatch: false }
}

/** i18n key for the short chip label of each source. */
export const PRICE_SOURCE_KEY: Record<PriceSourceKind, string> = {
  cardmarket: 'src_cardmarket',
  estimate: 'src_estimate',
  manual: 'src_manual',
  none: 'src_none',
}
