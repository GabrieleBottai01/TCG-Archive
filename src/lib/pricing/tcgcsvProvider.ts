import type { PriceProvider, PriceInput, PriceResult } from './types'
import { fetchTcgcsvPriceEur } from './sealed'
import { liveEbayEstimate } from './ebayEstimate'

// Prices sealed items that carry a tcgcsv reference (tcgcsv:group:product).
//
// eBay FIRST, tcgcsv as fallback. tcgcsv republishes US TCGplayer prices that
// run 3-4x over the European market for hot sealed sets (a Paldean Fates ETB
// reads €421 there vs a real ~€140 on eBay IT). So when we have a name to search
// eBay with — the Italian "type + set" item name — we take the live EU median of
// current eBay listings instead. tcgcsv only fills in when eBay finds nothing.
export class TcgcsvProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return !!i.externalId && i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null

    if (i.name && i.name.trim()) {
      const est = await liveEbayEstimate(i.name, i.language ?? 'IT')
      // Any eBay match beats the tcgcsv US number for these products; the caller
      // (and the chip) surface the sample size so a thin estimate is visible.
      if (est.eur != null && est.sampleSize >= 1) return { value: est.eur, source: 'AUTO' }
    }

    const eur = await fetchTcgcsvPriceEur(i.externalId as string)
    return eur != null ? { value: eur, source: 'AUTO' } : null
  }
}
