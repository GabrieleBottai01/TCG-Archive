export type CardSearchResult = {
  externalId: string; name: string; setName: string
  cardNumber: string; imageUrl: string | null; lowPrice: number | null
}

// Minimal shape of a pokemontcg.io card (only the fields we read).
type ApiCard = {
  id: string
  name: string
  number?: string
  set?: { name?: string }
  images?: { small?: string }
  cardmarket?: { prices?: { lowPrice?: number } }
}

export async function searchPokemonCards(q: string, apiKey?: string): Promise<CardSearchResult[]> {
  const term = q.trim()
  if (!term) return []
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(term)}*"&pageSize=20&orderBy=-set.releaseDate`
  const res = await fetch(url, { headers: apiKey ? { 'X-Api-Key': apiKey } : {} })
  if (!res.ok) return []
  const json = await res.json()
  const data: ApiCard[] = json?.data ?? []
  return data.map((c) => ({
    externalId: c.id,
    name: c.name,
    setName: c.set?.name ?? '',
    cardNumber: c.number ?? '',
    imageUrl: c.images?.small ?? null,
    lowPrice: typeof c.cardmarket?.prices?.lowPrice === 'number' ? c.cardmarket.prices.lowPrice : null,
  }))
}
