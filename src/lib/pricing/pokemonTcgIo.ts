import type { PriceProvider, PriceInput, PriceResult } from './types'

export class PokemonTcgIoProvider implements PriceProvider {
  constructor(private apiKey?: string) {}
  supports(i: PriceInput): boolean {
    return i.game === 'POKEMON' && i.itemType === 'RAW' && !!i.externalId
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${i.externalId}`, {
      headers: this.apiKey ? { 'X-Api-Key': this.apiKey } : {},
    })
    if (!res.ok) return null
    const json = await res.json()
    const low = json?.data?.cardmarket?.prices?.lowPrice
    if (typeof low !== 'number' || low <= 0) return null
    return { value: low, source: 'AUTO' }
  }
}
