// A live European price estimate for a sealed product, taken from the MEDIAN of
// current eBay listings (IT + DE) — reusing the observatory's own client, gates
// and median maths. This is the "reliable source" answer to the tcgcsv problem:
// tcgcsv republishes US TCGplayer prices that run 3-4x over the European market
// for hot sealed sets. eBay listings are the actual European asking prices.
//
// Caveat vs the observatory proper: this is a ONE-SHOT median of ACTIVE asking
// prices (not confirmed sales, no multi-day smoothing). It is a better instant
// estimate than the US number, but the observatory's daily reference — which
// watches disappearances over time — is still the stronger signal once it has
// had a few weeks to build.

import { searchSealed, type EbayListing, type Marketplace } from '@/lib/observatory/ebay'
import { gateListing } from '@/lib/observatory/run'
import { matchListing } from '@/lib/observatory/matchListing'
import { computeDailyReference } from '@/lib/observatory/reference'

const MARKETPLACES: readonly Marketplace[] = ['EBAY_IT', 'EBAY_DE']

export type EbayEstimate = {
  /** Median EUR of the matching sealed listings, or null when none matched. */
  eur: number | null
  /** How many listings survived both gates — the estimate's confidence. */
  sampleSize: number
}

/**
 * Pure: the EU median of the listings that clear BOTH the structured gate
 * (`gateListing`) and the title matcher (`matchListing`) for `(name, lang)`.
 * Separated from the live fetch so it is unit-testable without eBay.
 */
export function estimateFromListings(
  listings: { listing: EbayListing; marketplace: Marketplace }[],
  name: string,
  lang: string,
): EbayEstimate {
  const product = { name, lang }
  const prices: number[] = []
  for (const { listing, marketplace } of listings) {
    if (!gateListing(listing).ok) continue
    if (!matchListing(listing.title, product, marketplace).ok) continue
    prices.push(listing.priceEur)
  }
  const ref = computeDailyReference(prices.map((p) => ({ priceEur: p, confirmedSale: false, quickSale: false })))
  return { eur: ref.medianEur, sampleSize: ref.sampleSize }
}

/**
 * Live: query eBay IT + DE for `name` and return the EU median estimate.
 * Returns `{ eur: null, sampleSize: 0 }` when nothing matches (or eBay is
 * unreachable / uncredentialed) — the caller then falls back to another source.
 */
export async function liveEbayEstimate(name: string, lang: string): Promise<EbayEstimate> {
  const collected: { listing: EbayListing; marketplace: Marketplace }[] = []
  for (const marketplace of MARKETPLACES) {
    const listings = await searchSealed(name, marketplace)
    for (const listing of listings) collected.push({ listing, marketplace })
  }
  return estimateFromListings(collected, name, lang)
}
