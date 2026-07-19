// Cardtrader marketplace client. Prices sealed products from the LOWEST current
// EUR listing for a blueprint — the conventional "market price" on this EU
// marketplace, native EUR and product-level (no title matching). Read-only.
//
// The JWT lives only in env (CARDTRADER_JWT). Absent token => cardtraderEnabled()
// is false and callers fall back to eBay; nothing here throws for a missing token.

const BASE = 'https://api.cardtrader.com/api/v2'
const TTL_MS = 24 * 60 * 60 * 1000

export type CtExpansion = { id: number; game_id: number; code: string; name: string }
export type CtBlueprint = { id: number; name: string; expansion_id: number; category_id?: number }
export type CtProduct = {
  price: { cents: number; currency: string }
  quantity: number
  // null for a normal single listing; > 1 is a multi-copy lot. Confirmed against
  // the Task-1 real marketplace sample (docs/reference/cardtrader-sample.json):
  // every one of the 12 real single-unit listings omits this key entirely
  // (not present === undefined, not present-as-null) — so it is typed optional
  // here and the filter below treats "missing" the same as "null" (both pass).
  bundle_size?: number | null
  graded: boolean
  on_vacation: boolean
  properties_hash?: { pokemon_language?: string; [k: string]: unknown }
}

export function cardtraderEnabled(): boolean {
  return !!process.env.CARDTRADER_JWT
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CARDTRADER_JWT ?? ''}` }
}

async function ctGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`cardtrader ${path}: ${res.status}`)
  return (await res.json()) as T
}

// --- caches (static-ish data; 24h like the tcgcsv groups/sets cache) ---
let gameIdCache: { id: number | null; ts: number } | null = null
let expansionsCache: { data: CtExpansion[]; ts: number } | null = null
const blueprintsCache = new Map<number, { data: CtBlueprint[]; ts: number }>()

export function __resetCardtraderCache(): void {
  gameIdCache = null
  expansionsCache = null
  blueprintsCache.clear()
}

const fresh = (ts: number) => Date.now() - ts < TTL_MS

export async function getPokemonGameId(): Promise<number | null> {
  if (gameIdCache && fresh(gameIdCache.ts)) return gameIdCache.id
  const games = await ctGet<{ id: number; name: string }[]>('/games')
  const id = games.find((g) => /pok[eé]mon/i.test(g.name))?.id ?? null
  gameIdCache = { id, ts: Date.now() }
  return id
}

export async function getExpansions(): Promise<CtExpansion[]> {
  if (expansionsCache && fresh(expansionsCache.ts)) return expansionsCache.data
  const all = await ctGet<CtExpansion[]>('/expansions')
  const gameId = await getPokemonGameId()
  const data = gameId != null ? all.filter((e) => e.game_id === gameId) : all
  expansionsCache = { data, ts: Date.now() }
  return data
}

export async function getBlueprints(expansionId: number): Promise<CtBlueprint[]> {
  const hit = blueprintsCache.get(expansionId)
  if (hit && fresh(hit.ts)) return hit.data
  const data = await ctGet<CtBlueprint[]>(`/blueprints/export?expansion_id=${expansionId}`)
  blueprintsCache.set(expansionId, { data, ts: Date.now() })
  return data
}

// The marketplace response is { "<blueprintId>": CtProduct[] }; return that array.
export async function getMarketplace(blueprintId: number, opts?: { language?: string }): Promise<CtProduct[]> {
  const lang = opts?.language ? `&language=${encodeURIComponent(opts.language)}` : ''
  const json = await ctGet<Record<string, CtProduct[]>>(`/marketplace/products?blueprint_id=${blueprintId}${lang}`)
  return json[String(blueprintId)] ?? []
}

/**
 * Pure: the minimum EUR price (in whole euros) among products that are a single
 * sealed unit a buyer could actually purchase, optionally restricted to one
 * pokemon_language (prices differ by market). Field shapes confirmed against the
 * Task-1 sample: bundle_size is null (or, in every real listing observed, absent
 * entirely) for normal single listings (NOT 1), and properties_hash.sealed is
 * false even for real sealed products (so it is not a filter). Language is
 * passed to the marketplace API too; this client-side check is the backstop.
 */
export function lowestSealedEur(
  products: CtProduct[],
  language?: string,
): { eur: number | null; sampleSize: number } {
  const eur = products
    .filter(
      (p) =>
        p.price?.currency === 'EUR' &&
        !p.graded &&
        !p.on_vacation &&
        (p.bundle_size == null || p.bundle_size <= 1) &&
        (!language || p.properties_hash?.pokemon_language === language),
    )
    .map((p) => p.price.cents / 100)
  if (eur.length === 0) return { eur: null, sampleSize: 0 }
  return { eur: Math.min(...eur), sampleSize: eur.length }
}
