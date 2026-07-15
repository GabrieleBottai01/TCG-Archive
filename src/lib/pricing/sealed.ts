// Sealed product search + pricing.
// Free sources: tcgcsv.com republishes TCGplayer prices (USD) — including SEALED
// products — and TCGdex provides localized (IT/EN) set names so the search works
// in Italian too. Prices are TCGplayer market estimates converted to EUR.

import { getUsdToEurRate } from '@/lib/fx'
import { translateSealedQuery, normalizeQuery, queryTokens, extractProductType } from './sealedGlossary'

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

// Test-only: loadStatic() caches groups/sets for TTL_MS, which would leak
// fixtures across tests that use different group/set data in the same file.
export function __resetSealedStaticCache(): void {
  cache = null
}

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

  // Sealed names are compositional: "[Set name] + [Product type]". Split the
  // translated (English) query into the product-type phrase(s) it contains
  // (the glossary's closed vocabulary — see sealedGlossary.extractProductType)
  // and the remaining "set hint" text, and resolve groups from the set hint,
  // not the whole query. A product type (e.g. "trainer box") is never itself
  // a set name, so it must never be matched against group names.
  const translated = translateSealedQuery(raw)
  const { productTypes, setHint } = extractProductType(translated)

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

  const setHintTokens = [...new Set(queryTokens(setHint))]

  // 4a: resolve the set hint against TCGdex's IT/EN set names. Checking the
  // Italian name is what lets an Italian set-hint token (e.g. "rivali")
  // reach the English set name tcgcsv actually uses ("Destined Rivals"),
  // since TCGplayer/tcgcsv is English-only. Direction matters: a set-hint
  // token must appear IN the (longer) set name, not the other way round.
  //
  // A token like "rivali" can appear in more than one set's name (e.g. both
  // "Rising Rivals" and "Destined Rivals"), so a bare "does any token match"
  // check is ambiguous and picks up unrelated sets. Instead, score every set
  // by how many DISTINCT set-hint tokens it matches and keep only the
  // set(s) with the highest score — the most specific match wins, and
  // partial/weaker matches (score below the max) are discarded entirely.
  const setScores = new Map<string, number>() // set id -> score
  for (const s of sets) {
    const it = s.it ? normalizeQuery(s.it) : ''
    const en = s.en ? normalizeQuery(s.en) : ''
    let score = 0
    for (const t of setHintTokens) {
      if ((it !== '' && it.includes(t)) || (en !== '' && en.includes(t))) score++
    }
    if (score > 0) setScores.set(s.id, score)
  }
  const bestSetScore = setScores.size > 0 ? Math.max(...setScores.values()) : 0
  const resolvedSetNames = new Set<string>()
  for (const s of sets) {
    if (s.en && setScores.get(s.id) === bestSetScore && bestSetScore > 0) resolvedSetNames.add(normalizeQuery(s.en))
  }

  // 4b: match the resolved English set name(s) against tcgcsv group names as
  // a WHOLE PHRASE, not token by token — tokenizing "Destined Rivals" into
  // ["destined","rivals"] let an unrelated group containing only "rivals"
  // (or, worse, a token contaminated by a spurious 4a match) leak in. Only
  // when TCGdex resolved no set name at all do we fall back to matching the
  // raw set-hint tokens (never product-type words — those were already
  // stripped into `productTypes` above). Candidates are ranked by match
  // quality (phrase match beats token match; longer/more specific matches
  // beat shorter ones) so the later `.slice(0, 4)` keeps the best matches,
  // not merely whichever groups tcgcsv happened to list first.
  const candidates = new Map<number, { group: TcgGroup; quality: number }>()
  const addCandidate = (g: TcgGroup, quality: number) => {
    const existing = candidates.get(g.groupId)
    if (!existing || quality > existing.quality) candidates.set(g.groupId, { group: g, quality })
  }

  if (resolvedSetNames.size > 0) {
    for (const g of groups) {
      const gn = norm(g.name)
      for (const name of resolvedSetNames) {
        if (name && gn.includes(name)) addCandidate(g, 1000 + name.length)
      }
    }
  } else if (setHintTokens.length > 0) {
    for (const g of groups) {
      const gn = norm(g.name)
      for (const t of setHintTokens) {
        if (gn.includes(t)) addCandidate(g, t.length)
      }
    }
  }

  const chosen = new Map<number, TcgGroup>()
  for (const c of [...candidates.values()].sort((a, b) => b.quality - a.quality)) {
    chosen.set(c.group.groupId, c.group)
  }

  // 4c: the set hint was empty or matched nothing — fall back to matching
  // the whole translated query against group names. This is what correctly
  // finds "First Partner Pack", which has its own tcgcsv group (there is no
  // separate "set" for it — the product line IS the group).
  const translatedNorm = normalizeQuery(translated)
  if (chosen.size === 0 && translatedNorm) {
    for (const g of groups) {
      if (norm(g.name).includes(translatedNorm)) chosen.set(g.groupId, g)
    }
  }

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

        // A product type, when present, is a hard filter — a group can hold
        // several product types (ETB, booster bundle, ...) and only the
        // requested one is a match. With no product type in the query,
        // return the whole group's sealed products, ranked exact/fuzzy by
        // whether the product name contains the whole translated query.
        let matchLevel: 'exact' | 'fuzzy'
        if (productTypes.length > 0) {
          if (!productTypes.some((t) => pn.includes(t))) continue
          matchLevel = 'exact'
        } else {
          matchLevel = translatedNorm !== '' && pn.includes(translatedNorm) ? 'exact' : 'fuzzy'
        }

        const pr = priceBy.get(p.productId)
        out.push({
          name: p.name,
          imageUrl: p.imageUrl ?? null,
          priceEur: toEur(pr?.marketPrice ?? pr?.midPrice, rate),
          externalId: `tcgcsv:${g.groupId}:${p.productId}`,
          matchLevel,
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
