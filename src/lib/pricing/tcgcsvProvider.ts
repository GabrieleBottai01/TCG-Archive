import type { PriceProvider, PriceInput, PriceResult } from './types'
import { sealedPrice } from './sealedPrice'

// Prices sealed items (carrying a tcgcsv reference) via `sealedPrice`:
// Cardtrader-first (native EUR, product-level marketplace listings), with a
// LIVE eBay EU median fallback when Cardtrader has no data or is unreachable.
//
// NO tcgcsv fallback. tcgcsv republishes US TCGplayer prices that run 3-4x over
// the European market for hot sealed sets (a Paldean Fates ETB reads €421 there
// vs a real ~€140 on eBay IT) — and worse, when neither source found anything we
// used to drop back to that US number, which is exactly where the wildly-wrong
// values came from (a €45 tin priced at €172). So: Cardtrader, eBay, or nothing.
// When neither has data we return null and the value stays MANUAL rather than
// becoming a lie.
export class TcgcsvProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return !!i.externalId && i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    return sealedPrice(i)
  }
}
