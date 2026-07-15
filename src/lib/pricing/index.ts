import type { PriceInput, PriceProvider } from './types'
import { TcgdexProvider } from './tcgdexProvider'
import { TcgcsvProvider } from './tcgcsvProvider'
import { ManualProvider } from './manual'

export * from './types'
export { TcgdexProvider } from './tcgdexProvider'
export { TcgcsvProvider } from './tcgcsvProvider'
export { ManualProvider } from './manual'

export function pickProvider(i: PriceInput): PriceProvider {
  // Sealed items carry a tcgcsv reference; Pokémon raw cards use TCGdex.
  const tcgcsv = new TcgcsvProvider()
  if (tcgcsv.supports(i)) return tcgcsv
  const dex = new TcgdexProvider()
  return dex.supports(i) ? dex : new ManualProvider()
}
