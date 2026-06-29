import type { PriceProvider, PriceInput, PriceResult } from './types'
import { fetchTcgcsvPriceEur } from './sealed'

// Re-prices sealed items whose externalId is a tcgcsv reference (tcgcsv:group:product).
export class TcgcsvProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return !!i.externalId && i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    const eur = await fetchTcgcsvPriceEur(i.externalId as string)
    return eur != null ? { value: eur, source: 'AUTO' } : null
  }
}
