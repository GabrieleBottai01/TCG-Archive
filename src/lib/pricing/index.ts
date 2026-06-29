import type { PriceInput, PriceProvider } from './types'
import { PokemonTcgIoProvider } from './pokemonTcgIo'
import { ManualProvider } from './manual'

export * from './types'
export { PokemonTcgIoProvider } from './pokemonTcgIo'
export { ManualProvider } from './manual'

export function pickProvider(i: PriceInput): PriceProvider {
  const pkmn = new PokemonTcgIoProvider(process.env.POKEMONTCGIO_API_KEY)
  return pkmn.supports(i) ? pkmn : new ManualProvider()
}
