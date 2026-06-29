export type PriceInput = { game: string; itemType: string; externalId?: string | null }
export type PriceResult = { value: number; source: 'AUTO' | 'MANUAL' }
export interface PriceProvider {
  supports(i: PriceInput): boolean
  fetchPrice(i: PriceInput): Promise<PriceResult | null>
}
