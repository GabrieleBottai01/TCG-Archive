import { searchTcgdexCards } from './tcgdex'

export type CardSearchResult = {
  externalId: string; name: string; setName: string
  cardNumber: string; imageUrl: string | null; lowPrice: number | null
}

// TCGdex's list endpoint carries no prices, so `lowPrice` is always null here.
// The price is fetched on pick via /api/cards/price (see the form).
export async function searchPokemonCards(q: string): Promise<CardSearchResult[]> {
  const cards = await searchTcgdexCards(q)
  return cards.map((c) => ({ ...c, lowPrice: null }))
}
