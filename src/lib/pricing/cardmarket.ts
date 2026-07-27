// Cardmarket sealed pricing from the public daily download files. No API key,
// no login: the price guide + product catalogue are public S3 JSON, updated
// daily. We map an English catalogue name to a Cardmarket idProduct, then read
// its trend price (avg, then low, as fallbacks). Read-only.

import { normalizeQuery, extractProductType } from './sealedGlossary'

export type CmProduct = {
  idProduct: number
  name: string
  idCategory: number
  categoryName: string
  idExpansion: number
}
export type CmPriceGuide = { avg: number | null; low: number | null; trend: number | null }

// The game name is in almost every product name within a single-game catalogue,
// so it does not discriminate between products — exclude it from set-token overlap.
const COMMON_TOKENS = new Set(['pokemon'])

// A confident match needs at least this score. Set-token overlap is weighted ×2,
// a product-type agreement adds 1, extra candidate tokens subtract 1. Tuned
// against the live-check set (Task 6): the plain product beats its siblings by a
// wide margin, and an unowned set scores 0 (no set-token overlap) → null.
const MIN_SCORE = 2

/** First positive of trend, avg, low; else null. An explicit 0 is not a valid price. */
export function cardmarketSealedEur(pg: CmPriceGuide | undefined): number | null {
  if (!pg) return null
  for (const v of [pg.trend, pg.avg, pg.low]) {
    if (v != null && v > 0) return v
  }
  return null
}

/**
 * Pure: map an English catalogue name (e.g. "Paldean Fates Elite Trainer Box")
 * to a Cardmarket idProduct by scanning the product catalogue. Product type is a
 * hard filter when present (ETB ≠ Booster). A candidate must share at least one
 * SET token (name tokens minus the product-type phrase, minus the game name), so
 * a match on "elite trainer box" alone can never carry across sets. Score =
 * setOverlap×2 + (typeKnown ? 1 : 0) − extraTokens; best ≥ MIN_SCORE wins, else null.
 */
export function resolveCardmarketProductId(englishName: string, catalogue: CmProduct[]): number | null {
  const nameNorm = normalizeQuery(englishName)
  if (!nameNorm) return null
  const { productTypes } = extractProductType(nameNorm)
  const nameTokens = new Set(nameNorm.split(' ').filter(Boolean))
  const setTokens = new Set(
    [...nameTokens].filter((t) => !COMMON_TOKENS.has(t) && !productTypes.some((pt) => pt.split(' ').includes(t))),
  )
  if (setTokens.size === 0) return null // nothing distinctive to anchor on

  let bestId: number | null = null
  let bestScore = -Infinity
  for (const p of catalogue) {
    const pn = normalizeQuery(p.name)
    if (productTypes.length > 0 && !productTypes.some((t) => pn.includes(t))) continue
    const pTokens = pn.split(' ').filter(Boolean)
    const pTokenSet = new Set(pTokens)
    const setOverlap = [...setTokens].filter((t) => pTokenSet.has(t)).length
    if (setOverlap === 0) continue // must share a set token, not just the product type
    const extra = pTokens.filter((t) => !nameTokens.has(t)).length
    const score = setOverlap * 2 + (productTypes.length > 0 ? 1 : 0) - extra
    if (score > bestScore) { bestScore = score; bestId = p.idProduct }
  }
  return bestScore >= MIN_SCORE ? bestId : null
}

const CATALOGUE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json'
const PRICEGUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json'
const TTL_MS = 24 * 60 * 60 * 1000
// S3 serves the file to a browser UA; a bot UA can be blocked. Identify as a browser.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const fresh = (ts: number) => Date.now() - ts < TTL_MS

let catalogueCache: { data: CmProduct[]; ts: number } | null = null
let catalogueInflight: Promise<CmProduct[]> | null = null
let guideCache: { data: Map<number, CmPriceGuide>; ts: number } | null = null
let guideInflight: Promise<Map<number, CmPriceGuide>> | null = null

export function cardmarketEnabled(): boolean {
  return true
}

export function __resetCardmarketCache(): void {
  catalogueCache = null
  catalogueInflight = null
  guideCache = null
  guideInflight = null
}

async function s3Json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`cardmarket ${url}: ${res.status}`)
  return (await res.json()) as T
}

export async function getNonsinglesCatalogue(): Promise<CmProduct[]> {
  if (catalogueCache && fresh(catalogueCache.ts)) return catalogueCache.data
  if (catalogueInflight) return catalogueInflight
  catalogueInflight = (async () => {
    const json = await s3Json<{ products: CmProduct[] }>(CATALOGUE_URL)
    const data = json.products ?? []
    catalogueCache = { data, ts: Date.now() }
    return data
  })()
  try {
    return await catalogueInflight
  } finally {
    catalogueInflight = null
  }
}

export async function getPriceGuide(): Promise<Map<number, CmPriceGuide>> {
  if (guideCache && fresh(guideCache.ts)) return guideCache.data
  if (guideInflight) return guideInflight
  guideInflight = (async () => {
    const json = await s3Json<{ priceGuides: Array<{ idProduct: number; avg: number | null; low: number | null; trend: number | null }> }>(PRICEGUIDE_URL)
    const map = new Map<number, CmPriceGuide>()
    for (const g of json.priceGuides ?? []) {
      map.set(g.idProduct, { avg: g.avg ?? null, low: g.low ?? null, trend: g.trend ?? null })
    }
    guideCache = { data: map, ts: Date.now() }
    return map
  })()
  try {
    return await guideInflight
  } finally {
    guideInflight = null
  }
}

/**
 * The Cardmarket sealed price for a product, plus the idProduct used (so the
 * caller can persist it). Pass a stored productId to skip the catalogue scan.
 * Returns null price when the name does not confidently resolve.
 */
export async function cardmarketPriceFor(
  name: string,
  productId?: number | null,
): Promise<{ eur: number | null; productId: number | null }> {
  let id = productId ?? null
  if (id == null) {
    const catalogue = await getNonsinglesCatalogue()
    id = resolveCardmarketProductId(name, catalogue)
  }
  if (id == null) return { eur: null, productId: null }
  const guide = await getPriceGuide()
  return { eur: cardmarketSealedEur(guide.get(id)), productId: id }
}
