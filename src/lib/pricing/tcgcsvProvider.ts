import type { PriceProvider, PriceInput, PriceResult } from './types'
import { liveEbayEstimate } from './ebayEstimate'

// Prices sealed items (carrying a tcgcsv reference) from the LIVE eBay EU median.
//
// NO tcgcsv fallback. tcgcsv republishes US TCGplayer prices that run 3-4x over
// the European market for hot sealed sets (a Paldean Fates ETB reads €421 there
// vs a real ~€140 on eBay IT) — and worse, when eBay found nothing we used to
// drop back to that US number, which is exactly where the wildly-wrong values
// came from (a €45 tin priced at €172). So: eBay or nothing. When eBay has no
// data we return null and the value stays MANUAL rather than becoming a lie.
//
// Name matters: it must be the Italian "type + set" term for eBay IT recall.
export class TcgcsvProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return !!i.externalId && i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    // The Italian "type + set" term drives eBay recall. New items carry it in
    // priceQuery (name holds the English catalogue name); pre-migration items
    // have it in name with priceQuery null — hence priceQuery ?? name.
    const query = i.priceQuery ?? i.name
    if (!query || !query.trim()) return null
    const est = await liveEbayEstimate(query, i.language ?? 'IT')
    return est.eur != null ? { value: est.eur, source: 'AUTO' } : null
  }
}
