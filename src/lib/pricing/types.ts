export type PriceInput = {
  game: string
  itemType: string
  externalId?: string | null
  // Name + language let a sealed provider search eBay for a live EU median; the
  // name must be the Italian "type + set" string (e.g. "ETB destino di paldea")
  // for the title matcher to work, which is exactly what the item name holds.
  name?: string | null
  // The Italian eBay term when the display name is the English catalogue name.
  // Every eBay-search site uses `priceQuery ?? name`; null falls back to name.
  priceQuery?: string | null
  language?: string | null
}
export type PriceResult = { value: number; source: 'AUTO' | 'MANUAL' }
export interface PriceProvider {
  supports(i: PriceInput): boolean
  fetchPrice(i: PriceInput): Promise<PriceResult | null>
}
