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

// Sealed products have no free price/photo API; pokemontcg.io exposes the official
// SET logo, which we use as the automatic image for sealed Pokémon products.
export type SetSearchResult = {
  setId: string
  name: string
  series: string
  imageUrl: string | null
}

type ApiSet = {
  id: string
  name: string
  series?: string
  images?: { logo?: string; symbol?: string }
}

export async function searchPokemonSets(q: string, apiKey?: string): Promise<SetSearchResult[]> {
  const term = q.trim()
  if (!term) return []
  const url = `https://api.pokemontcg.io/v2/sets?q=name:"${encodeURIComponent(term)}*"&pageSize=20&orderBy=-releaseDate`
  const res = await fetch(url, { headers: apiKey ? { 'X-Api-Key': apiKey } : {} })
  if (!res.ok) return []
  const json = await res.json()
  const data: ApiSet[] = json?.data ?? []
  return data.map((s) => ({
    setId: s.id,
    name: s.name,
    series: s.series ?? '',
    imageUrl: s.images?.logo ?? s.images?.symbol ?? null,
  }))
}
