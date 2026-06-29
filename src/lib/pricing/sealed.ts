// Sealed product search + pricing.
// Free sources: tcgcsv.com republishes TCGplayer prices (USD) — including SEALED
// products — and TCGdex provides localized (IT/EN) set names so the search works
// in Italian too. Prices are TCGplayer market estimates converted to EUR.

const USD_TO_EUR = 0.92
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
}

const norm = (x: string) => x.toLowerCase().replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim()
const toEur = (usd: number | null | undefined) =>
  typeof usd === 'number' ? Math.round(usd * USD_TO_EUR * 100) / 100 : null

export async function searchSealedProducts(q: string): Promise<SealedSearchResult[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const ql = term.toLowerCase()
  const { groups, sets } = await loadStatic()

  // English set names matching the query in either Italian or English.
  const engNames = new Set<string>()
  for (const s of sets) {
    if ((s.it && s.it.toLowerCase().includes(ql)) || (s.en && s.en.toLowerCase().includes(ql))) {
      if (s.en) engNames.add(s.en.toLowerCase())
    }
  }

  // Candidate tcgcsv groups: direct name match, or via the resolved English set name.
  const chosen = new Map<number, TcgGroup>()
  for (const g of groups) {
    const gn = norm(g.name)
    if (gn.includes(ql)) chosen.set(g.groupId, g)
    else for (const en of engNames) if (en && gn.includes(en)) { chosen.set(g.groupId, g); break }
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
        const pr = priceBy.get(p.productId)
        out.push({
          name: p.name,
          imageUrl: p.imageUrl ?? null,
          priceEur: toEur(pr?.marketPrice ?? pr?.midPrice),
          externalId: `tcgcsv:${g.groupId}:${p.productId}`,
        })
      }
    } catch {
      // Skip a group that fails to load.
    }
  }

  // Surface name-matching products first.
  out.sort((a, b) => Number(b.name.toLowerCase().includes(ql)) - Number(a.name.toLowerCase().includes(ql)))
  return out.slice(0, 30)
}

// Used by the price-refresh provider to re-price a sealed item by its tcgcsv id.
export async function fetchTcgcsvPriceEur(externalId: string): Promise<number | null> {
  const m = /^tcgcsv:(\d+):(\d+)$/.exec(externalId)
  if (!m) return null
  const groupId = m[1]
  const productId = Number(m[2])
  try {
    const json = await getJson<{ results: TcgPrice[] }>(`${TCGCSV}/${groupId}/prices`, UA)
    const list = json.results ?? []
    const pr = list.find((p) => p.productId === productId && p.subTypeName === 'Normal') ?? list.find((p) => p.productId === productId)
    return toEur(pr?.marketPrice ?? pr?.midPrice)
  } catch {
    return null
  }
}
