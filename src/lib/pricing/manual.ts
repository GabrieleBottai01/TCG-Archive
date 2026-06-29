import type { PriceProvider, PriceResult } from './types'
export class ManualProvider implements PriceProvider {
  supports(): boolean { return false }
  async fetchPrice(): Promise<PriceResult | null> { return null }
}
