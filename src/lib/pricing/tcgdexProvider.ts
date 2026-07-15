import type { PriceProvider, PriceInput, PriceResult } from './types'
import { fetchTcgdexPriceEur } from './tcgdex'

// Prices Pokémon singles from TCGdex (Cardmarket, EUR). Graded slabs are excluded:
// a slab's value diverges from the raw card price, so it stays MANUAL.
export class TcgdexProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return i.game === 'POKEMON' && i.itemType === 'RAW' && !!i.externalId && !i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    const eur = await fetchTcgdexPriceEur(i.externalId as string)
    return eur != null ? { value: eur, source: 'AUTO' } : null
  }
}
