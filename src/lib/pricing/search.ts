import { searchTcgdexCards } from './tcgdex'

export type CardSearchResult = {
  externalId: string; name: string; setName: string
  cardNumber: string; imageUrl: string | null
}

// TCGdex's list endpoint carries no prices — the price is fetched on pick
// via /api/cards/price.
export async function searchPokemonCards(q: string): Promise<CardSearchResult[]> {
  return searchTcgdexCards(q)
}
