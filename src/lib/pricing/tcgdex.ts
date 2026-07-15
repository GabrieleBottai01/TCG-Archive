// TCGdex card data: native Italian names + Cardmarket prices in EUR.
// Replaces pokemontcg.io, which is English-only and has no cardmarket data at all
// for 744 modern cards (Mega Evolution era, Prismatic Evolutions).
//
// Verified API shape (2026-07-15):
//  - LIST  /v2/it/cards?name=<q>  -> [{id, localId, name, image}]  — no set, no price
//  - DETAIL /v2/it/cards/<id>     -> {..., set:{id,name}, pricing:{cardmarket:{low,...}}}
//  - `?name=` is a case-insensitive SUBSTRING match; `*` is literal (name=Primi* -> [])
//  - `image` needs a size suffix to be a real file: `${image}/high.webp`

const BASE = 'https://api.tcgdex.net/v2/it'
const SETS_TTL_MS = 24 * 60 * 60 * 1000

export type TcgdexCardResult = {
  externalId: string
  name: string
  setName: string
  cardNumber: string
  imageUrl: string | null
}

type DexListCard = { id: string; localId?: string; name?: string; image?: string }
type DexSet = { id: string; name?: string }
type DexCardDetail = { pricing?: { cardmarket?: { low?: number | null } } }

let setsCache: { map: Map<string, string>; ts: number } | null = null

/** Test-only: clear the module-scope set cache. */
export function __resetTcgdexCache(): void {
  setsCache = null
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** id -> Italian set name, loaded once (the card list endpoint omits the set). */
async function getSetMap(): Promise<Map<string, string>> {
  if (setsCache && Date.now() - setsCache.ts < SETS_TTL_MS) return setsCache.map
  const sets = await getJson<DexSet[]>(`${BASE}/sets`)
  const map = new Map<string, string>()
  for (const s of sets ?? []) if (s.id) map.set(s.id, s.name ?? '')
  setsCache = { map, ts: Date.now() }
  return map
}

/** `sv10-165` -> `sv10`. Card ids are `<setId>-<localId>`. */
function setIdOf(cardId: string): string {
  const i = cardId.lastIndexOf('-')
  return i === -1 ? cardId : cardId.slice(0, i)
}

export async function searchTcgdexCards(q: string): Promise<TcgdexCardResult[]> {
  const term = q.trim()
  if (!term) return []
  // Substring match — do NOT append `*`, it is matched literally.
  const cards = await getJson<DexListCard[]>(`${BASE}/cards?name=${encodeURIComponent(term)}`)
  if (!cards) return []
  const setMap = await getSetMap()
  return cards.slice(0, 20).map((c) => ({
    externalId: c.id,
    name: c.name ?? '',
    setName: setMap.get(setIdOf(c.id)) ?? '',
    cardNumber: c.localId ?? '',
    imageUrl: c.image ? `${c.image}/high.webp` : null,
  }))
}

export async function fetchTcgdexPriceEur(externalId: string): Promise<number | null> {
  const card = await getJson<DexCardDetail>(`${BASE}/cards/${encodeURIComponent(externalId)}`)
  const low = card?.pricing?.cardmarket?.low
  return typeof low === 'number' && Number.isFinite(low) ? low : null
}
