import type { PriceInput, PriceProvider } from './types'
import { PokemonTcgIoProvider } from './pokemonTcgIo'
import { TcgcsvProvider } from './tcgcsvProvider'
import { ManualProvider } from './manual'

export * from './types'
export { PokemonTcgIoProvider } from './pokemonTcgIo'
export { TcgcsvProvider } from './tcgcsvProvider'
export { ManualProvider } from './manual'

export function pickProvider(i: PriceInput): PriceProvider {
  // Sealed items carry a tcgcsv reference; Pokémon raw cards use pokemontcg.io.
  const tcgcsv = new TcgcsvProvider()
  if (tcgcsv.supports(i)) return tcgcsv
  const pkmn = new PokemonTcgIoProvider(process.env.POKEMONTCGIO_API_KEY)
  return pkmn.supports(i) ? pkmn : new ManualProvider()
}
