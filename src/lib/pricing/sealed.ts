// Sealed product search + pricing.
// Free sources: tcgcsv.com republishes TCGplayer prices (USD) — including SEALED
// products — and TCGdex provides localized (IT/EN) set names so the search works
// in Italian too. Prices are TCGplayer market estimates converted to EUR.

import { getUsdToEurRate } from '@/lib/fx'
import { translateSealedQuery, normalizeQuery, queryTokens } from './sealedGlossary'

const TCGCSV = 'https://tcgcsv.com/tcgplayer/3'
const UA: Record<string, string> = { 'User-Agent': 'TCGArchive/1.0' }
const TTL_MS = 24 * 60 * 60 * 1000

type TcgGroup = { groupId: number; name: string }
type TcgProduct = { productId: number; name: string; imageUrl?: string; extendedData?: { name?: string }[] }
type TcgPrice = { productId: number; subTypeName?: string; marketPrice?: number | null; midPrice?: number | null }
type DexSet = { id: string; name?: string }

type SetName = { id: string; it: string; en: string }
type StaticData = { groups: TcgGroup[]; sets: SetName[]; ts: number }

let cache: StaticData | null = null

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, headers ? { headers } : undefined)
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
  return (await res.json()) as T
}

async function loadStatic(): Promise<StaticData> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache
  const [groupsJson, itSets, enSets] = await Promise.all([
    getJson<{ results: TcgGroup[] }>(`${TCGCSV}/groups`, UA),
    getJson<DexSet[]>('https://api.tcgdex.net/v2/it/sets'),
    getJson<DexSet[]>('https://api.tcgdex.net/v2/en/sets'),
  ])
  const enById = new Map<string, string>()
  for (const s of enSets) enById.set(s.id, s.name ?? '')
  const sets: SetName[] = itSets.map((s) => ({ id: s.id, it: s.name ?? '', en: enById.get(s.id) ?? '' }))
  cache = { groups: groupsJson.results ?? [], sets, ts: Date.now() }
  return cache
}

export type SealedSearchResult = {
  name: string
  imageUrl: string | null
  priceEur: number | null
  externalId: string // tcgcsv:groupId:productId
  matchLevel: 'exact' | 'fuzzy'
}

const norm = (x: string) => x.toLowerCase().replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim()
const toEur = (usd: number | null | undefined, rate: number) =>
  typeof usd === 'number' ? Math.round(usd * rate * 100) / 100 : null

export async function searchSealedProducts(q: string): Promise<SealedSearchResult[]> {
  const raw = q.trim()
  if (raw.length < 2) return []

  const { groups, sets } = await loadStatic()
  const rate = await getUsdToEurRate()

  // Level 1+2: translate the query IT->EN, then resolve Italian set names to English.
  const translated = translateSealedQuery(raw)
  const plain = normalizeQuery(raw)
  const terms = new Set([translated, plain])
  for (const s of sets) {
    if ((s.it && normalizeQuery(s.it).includes(plain)) || (s.en && normalizeQuery(s.en).includes(plain))) {
      if (s.en) terms.add(normalizeQuery(s.en))
    }
  }

  // tcgcsv has no product-name index and no bulk product endpoint (verified:
  // /tcgplayer/3/products -> 404), so we can only fetch a handful of the ~217
  // groups per search. Matching therefore happens on group (set) names, not
  // product names: a query resolves to a set, we fetch that set's group(s),
  // then filter products within them (see the exact/fuzzy check below). A
  // bare product/Pokémon name (e.g. "Zacian") only matches when that product
  // line happens to have its own group (e.g. "First Partner Pack", groupId
  // 2776) — there is no way to search across all products without indexing
  // every group on every request. Do not "fix" this by adding a full scan of
  // all groups: with only 4 groups fetched per search (see .slice(0, 4)
  // below), a full scan just returns whatever groups happen to be listed
  // first by tcgcsv (publish-date descending), i.e. the newest sets,
  // regardless of the query.

  // Level 3: substring match of any term against the group name.
  const chosen = new Map<number, TcgGroup>()
  for (const g of groups) {
    const gn = norm(g.name)
    for (const t of terms) if (t && gn.includes(t)) { chosen.set(g.groupId, g); break }
  }

  // Level 4: token overlap on group names when nothing matched.
  const tokens = queryTokens(translated)
  if (chosen.size === 0 && tokens.length > 0) {
    for (const g of groups) {
      const gn = norm(g.name)
      if (tokens.some((t) => gn.includes(t))) chosen.set(g.groupId, g)
    }
  }

  // Products are English; match them against the translated query too.
  const out: SealedSearchResult[] = []
  for (const g of [...chosen.values()].slice(0, 4)) {
    try {
      const [prodJson, priceJson] = await Promise.all([
        getJson<{ results: TcgProduct[] }>(`${TCGCSV}/${g.groupId}/products`, UA),
        getJson<{ results: TcgPrice[] }>(`${TCGCSV}/${g.groupId}/prices`, UA),
      ])
      const priceBy = new Map<number, TcgPrice>()
      for (const p of priceJson.results ?? []) {
        if (p.subTypeName === 'Normal' && !priceBy.has(p.productId)) priceBy.set(p.productId, p)
      }
      for (const p of prodJson.results ?? []) {
        const isSealed = !(p.extendedData ?? []).some((e) => e.name === 'Number')
        if (!isSealed || /code card/i.test(p.name)) continue
        const pn = normalizeQuery(p.name)
        const exact = [...terms].some((t) => t && pn.includes(t))
        const fuzzy = tokens.some((t) => pn.includes(t))
        if (!exact && !fuzzy) continue
        const pr = priceBy.get(p.productId)
        out.push({
          name: p.name,
          imageUrl: p.imageUrl ?? null,
          priceEur: toEur(pr?.marketPrice ?? pr?.midPrice, rate),
          externalId: `tcgcsv:${g.groupId}:${p.productId}`,
          matchLevel: exact ? 'exact' : 'fuzzy',
        })
      }
    } catch {
      // Skip a group that fails to load.
    }
  }

  // Exact matches first; never pad with unrelated products.
  out.sort((a, b) => Number(a.matchLevel === 'fuzzy') - Number(b.matchLevel === 'fuzzy'))
  return out.slice(0, 30)
}

// Used by the price-refresh provider to re-price a sealed item by its tcgcsv id.
export async function fetchTcgcsvPriceEur(externalId: string): Promise<number | null> {
  const m = /^tcgcsv:(\d+):(\d+)$/.exec(externalId)
  if (!m) return null
  const groupId = m[1]
  const productId = Number(m[2])
  try {
    const rate = await getUsdToEurRate()
    const json = await getJson<{ results: TcgPrice[] }>(`${TCGCSV}/${groupId}/prices`, UA)
    const list = json.results ?? []
    const pr = list.find((p) => p.productId === productId && p.subTypeName === 'Normal') ?? list.find((p) => p.productId === productId)
    return toEur(pr?.marketPrice ?? pr?.midPrice, rate)
  } catch {
    return null
  }
}
