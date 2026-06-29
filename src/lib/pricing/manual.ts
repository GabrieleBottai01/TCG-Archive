import type { PriceProvider, PriceInput, PriceResult } from './types'
export class ManualProvider implements PriceProvider {
  supports(): boolean { return false }
  async fetchPrice(_i: PriceInput): Promise<PriceResult | null> { return null }
}
