# F-cardmarket — Automatic Cardmarket Source for Sealed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price the sealed products Cardtrader can't map from Cardmarket's public daily price-guide files, inserting a `cardmarket` source between Cardtrader and the eBay fallback.

**Architecture:** A new `cardmarket.ts` client fetches two public S3 JSON files (product catalogue + price guide, no key/login), resolves an English catalogue name to a Cardmarket `idProduct`, and returns its `trend` price (fallback `avg`→`low`). `sealedPrice` becomes Cardtrader → Cardmarket → eBay. The resolved `idProduct` is persisted on the Item, mirroring `cardtraderBlueprintId`.

**Tech Stack:** TypeScript, Next.js (App Router), Prisma (`db push` workflow, client generated to `src/generated/prisma`), Vitest, Neon Postgres.

## Global Constraints

- Repo: work only on `GabrieleBottai01/TCG-Archive`. Never push without asking Gabriele.
- No paid APIs, no API keys, no scraping of `www.cardmarket.com` HTML. Only the public S3 file URLs (they return 200 with a browser User-Agent; the HTML pages 403 bots — never touch them).
- Pokémon = Cardmarket game id **6**.
- Price field priority = **`trend` → `avg` → `low`** (first non-null). `low` alone is outlier-prone (real data: idProduct 271440 `low:19000` vs `avg:2103`); never use it as the primary.
- Chain order = **Cardtrader → Cardmarket → eBay**. Cardmarket only fills the gap after Cardtrader yields nothing; it must never re-anchor a product Cardtrader already prices.
- A Cardmarket fetch failure must never throw out of `sealedPrice` — fall through to eBay (same contract as Cardtrader).
- Catalogue names are English (Phase 2A); map the English Cardmarket product. Italian/JP-language sealed are out of scope.
- Before merge: run the **full** vitest suite (`npm test`), not a focused subset (F-core scar). Verify against **live** S3 data with the Task 6 script — never trust mocked pricing tests alone.

**File URLs (constants):**
- Catalogue: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json`
- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`

---

### Task 1: Data foundation — types, Prisma column, itemSchema

**Files:**
- Modify: `src/lib/pricing/types.ts`
- Modify: `prisma/schema.prisma:105` (after `cardtraderBlueprintId`)
- Modify: `src/lib/itemSchema.ts:12` (after `cardtraderBlueprintId`)

**Interfaces:**
- Produces: `PriceInput.cardmarketProductId?: number | null`, `PriceResult.cardmarketProductId?: number | null`, `PriceResult.origin` union includes `'cardmarket'`. Prisma `Item.cardmarketProductId: Int?`. Zod field `cardmarketProductId`.

- [ ] **Step 1: Extend the pricing types**

In `src/lib/pricing/types.ts`, add to `PriceInput` (after `cardtraderBlueprintId`):
```ts
  // A resolved Cardmarket idProduct, when known, lets the sealed provider skip
  // name resolution and price by direct price-guide lookup.
  cardmarketProductId?: number | null
```
In `PriceResult`, change the origin union and add the id:
```ts
  origin?: 'cardtrader' | 'cardmarket' | 'ebay'
  /** The blueprint id resolved during this call, so the caller can persist it. */
  cardtraderBlueprintId?: number | null
  /** The Cardmarket idProduct resolved during this call, so the caller can persist it. */
  cardmarketProductId?: number | null
```

- [ ] **Step 2: Add the Prisma column**

In `prisma/schema.prisma`, immediately after the `cardtraderBlueprintId` line in `model Item`:
```prisma
  cardmarketProductId   Int?          // resolved Cardmarket idProduct for direct price-guide lookups
```

- [ ] **Step 3: Regenerate the Prisma client (do NOT push to the DB)**

Run: `npx prisma generate`
Expected: regenerates `src/generated/prisma` with the new field (offline — reads the schema file, does not touch any database). **Do NOT run `db:push`** here: `DATABASE_URL` points at the shared/production Neon DB. The column is applied to prod automatically at deploy — `netlify.toml`'s build command is `npx prisma db push && npx next build`, so `db push` runs (additive, nullable, non-destructive) *before* `next build`, meaning the regenerated client that selects the column never serves traffic against a column-less DB. Do not push manually before merge. Tests mock Prisma, so they don't need the real column locally.

- [ ] **Step 4: Add the zod field**

In `src/lib/itemSchema.ts`, after the `cardtraderBlueprintId` line:
```ts
  cardmarketProductId: z.number().int().optional().nullable(),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no references to the new field are wrong yet; later tasks consume it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pricing/types.ts prisma/schema.prisma src/lib/itemSchema.ts src/generated/prisma
git commit -m "feat(pricing): cardmarketProductId field + type on Item/PriceInput/PriceResult"
```

---

### Task 2: Cardmarket pure core — price selection + name resolver

**Files:**
- Create: `src/lib/pricing/cardmarket.ts`
- Test: `src/lib/pricing/__tests__/cardmarket.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery`, `extractProductType` from `./sealedGlossary`.
- Produces (pure, exported):
  - `type CmProduct = { idProduct: number; name: string; idCategory: number; categoryName: string; idExpansion: number }`
  - `type CmPriceGuide = { avg: number | null; low: number | null; trend: number | null }`
  - `cardmarketSealedEur(pg: CmPriceGuide | undefined): number | null` → `trend ?? avg ?? low ?? null`.
  - `resolveCardmarketProductId(englishName: string, catalogue: CmProduct[]): number | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pricing/__tests__/cardmarket.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cardmarketSealedEur, resolveCardmarketProductId, type CmProduct } from '@/lib/pricing/cardmarket'

// Real fixtures trimmed from products_nonsingles_6.json (2026-07-27).
const CAT: CmProduct[] = [
  { idProduct: 653700, name: 'Pokémon GO Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 653701, name: 'Pokémon GO Pokémon Center Elite Trainer Box Plus', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 690879, name: 'Pokémon GO 10 Elite Trainer Box Case', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 745548, name: 'Paldean Fates Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5546 },
  { idProduct: 745549, name: 'Paldean Fates Pokémon Center Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5546 },
  { idProduct: 745544, name: 'Paldean Fates Booster', idCategory: 52, categoryName: 'Pokémon Booster', idExpansion: 5546 },
]

describe('cardmarketSealedEur', () => {
  it('prefers trend, then avg, then low', () => {
    expect(cardmarketSealedEur({ trend: 103, avg: 114, low: 97 })).toBe(103)
    expect(cardmarketSealedEur({ trend: null, avg: 114, low: 97 })).toBe(114)
    expect(cardmarketSealedEur({ trend: null, avg: null, low: 97 })).toBe(97)
    expect(cardmarketSealedEur({ trend: null, avg: null, low: null })).toBeNull()
    expect(cardmarketSealedEur(undefined)).toBeNull()
  })
})

describe('resolveCardmarketProductId', () => {
  it('maps the plain ETB, not the Plus/Case siblings', () => {
    expect(resolveCardmarketProductId('Pokémon GO Elite Trainer Box', CAT)).toBe(653700)
  })
  it('picks the plain ETB over the Pokémon Center ETB in another set', () => {
    expect(resolveCardmarketProductId('Paldean Fates Elite Trainer Box', CAT)).toBe(745548)
  })
  it('honours the product type: a Booster query never returns an ETB', () => {
    expect(resolveCardmarketProductId('Paldean Fates Booster', CAT)).toBe(745544)
  })
  it('returns null when no set token overlaps (no confident match)', () => {
    expect(resolveCardmarketProductId('Surging Sparks Elite Trainer Box', CAT)).toBeNull()
  })
  it('returns null for an empty catalogue', () => {
    expect(resolveCardmarketProductId('Pokémon GO Elite Trainer Box', [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- cardmarket`
Expected: FAIL — cannot resolve module `@/lib/pricing/cardmarket`.

- [ ] **Step 3: Implement the pure core**

Create `src/lib/pricing/cardmarket.ts`:
```ts
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

/** trend, else avg, else low, else null. */
export function cardmarketSealedEur(pg: CmPriceGuide | undefined): number | null {
  if (!pg) return null
  return pg.trend ?? pg.avg ?? pg.low ?? null
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- cardmarket`
Expected: PASS (all cases). If the "Plus/Case sibling" or "another set" case fails, adjust nothing in the test — the scoring is what must satisfy them; re-read the algorithm. (Live tuning of `MIN_SCORE` happens in Task 6, but these fixtures must already pass at `MIN_SCORE = 2`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/cardmarket.ts src/lib/pricing/__tests__/cardmarket.test.ts
git commit -m "feat(pricing): Cardmarket pure core — trend price + name→idProduct resolver"
```

---

### Task 3: Cardmarket fetch + cache layer

**Files:**
- Modify: `src/lib/pricing/cardmarket.ts`
- Test: `src/lib/pricing/__tests__/cardmarketFetch.test.ts`

**Interfaces:**
- Consumes: `resolveCardmarketProductId`, `cardmarketSealedEur`, `CmProduct`, `CmPriceGuide` (Task 2).
- Produces:
  - `cardmarketEnabled(): boolean` → always `true`.
  - `getNonsinglesCatalogue(): Promise<CmProduct[]>` (24h cache).
  - `getPriceGuide(): Promise<Map<number, CmPriceGuide>>` (24h cache, single-flight).
  - `cardmarketPriceFor(name: string, productId?: number | null): Promise<{ eur: number | null; productId: number | null }>`.
  - `__resetCardmarketCache(): void`.

- [ ] **Step 1: Write the failing test (single-flight + resolution)**

Create `src/lib/pricing/__tests__/cardmarketFetch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPriceGuide, cardmarketPriceFor, __resetCardmarketCache } from '@/lib/pricing/cardmarket'

const CATALOGUE = {
  version: 1,
  products: [{ idProduct: 653700, name: 'Pokémon GO Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 }],
}
const PRICEGUIDE = {
  version: 1,
  priceGuides: [{ idProduct: 653700, avg: 114, low: 97, trend: 103 }],
}

function mockFetch() {
  return vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('price_guide') ? PRICEGUIDE : CATALOGUE),
  })) as unknown as typeof fetch
}

beforeEach(() => { __resetCardmarketCache() })
afterEach(() => { vi.restoreAllMocks() })

describe('getPriceGuide single-flight', () => {
  it('downloads the guide once for concurrent callers', async () => {
    const f = mockFetch()
    vi.stubGlobal('fetch', f)
    await Promise.all([getPriceGuide(), getPriceGuide(), getPriceGuide()])
    const guideCalls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.filter((c) => String(c[0]).includes('price_guide'))
    expect(guideCalls.length).toBe(1)
  })
})

describe('cardmarketPriceFor', () => {
  it('resolves a name to trend and returns the productId', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const r = await cardmarketPriceFor('Pokémon GO Elite Trainer Box')
    expect(r).toEqual({ eur: 103, productId: 653700 })
  })
  it('uses a stored productId without scanning the catalogue', async () => {
    const f = mockFetch()
    vi.stubGlobal('fetch', f)
    const r = await cardmarketPriceFor('irrelevant name', 653700)
    expect(r).toEqual({ eur: 103, productId: 653700 })
    const catCalls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.filter((c) => String(c[0]).includes('nonsingles'))
    expect(catCalls.length).toBe(0)
  })
  it('returns null price and null id when the name does not resolve', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const r = await cardmarketPriceFor('Nonexistent Set Elite Trainer Box')
    expect(r).toEqual({ eur: null, productId: null })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- cardmarketFetch`
Expected: FAIL — `getPriceGuide`/`cardmarketPriceFor`/`__resetCardmarketCache` not exported.

- [ ] **Step 3: Implement the fetch + cache layer**

Append to `src/lib/pricing/cardmarket.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- cardmarketFetch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/cardmarket.ts src/lib/pricing/__tests__/cardmarketFetch.test.ts
git commit -m "feat(pricing): Cardmarket fetch+cache layer with single-flight downloads"
```

---

### Task 4: Wire Cardmarket into the sealedPrice chain

**Files:**
- Modify: `src/lib/pricing/sealedPrice.ts`
- Modify: `src/lib/pricing/__tests__/sealedPrice.test.ts`

**Interfaces:**
- Consumes: `cardmarketEnabled`, `cardmarketPriceFor` (Task 3); existing Cardtrader/eBay functions.
- Produces: `sealedPrice` returns `origin: 'cardmarket'` with `cardmarketProductId` set when Cardmarket wins.

- [ ] **Step 1: Update the sealedPrice test for the new chain**

In `src/lib/pricing/__tests__/sealedPrice.test.ts`, add to the hoisted mock object `h`:
```ts
  cardmarketEnabled: vi.fn(() => true),
  cardmarketPriceFor: vi.fn(async () => ({ eur: null as number | null, productId: null as number | null })),
```
Add a mock block after the cardtrader mock:
```ts
vi.mock('@/lib/pricing/cardmarket', () => ({
  cardmarketEnabled: h.cardmarketEnabled,
  cardmarketPriceFor: h.cardmarketPriceFor,
}))
```
In `beforeEach`, after the cardtrader defaults:
```ts
  h.cardmarketEnabled.mockReturnValue(true)
  h.cardmarketPriceFor.mockResolvedValue({ eur: null, productId: null })
```
Replace the "falls back to eBay when Cardtrader has no price" test and add two new ones:
```ts
  it('uses Cardmarket when Cardtrader has no price, before eBay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: 103, productId: 653700 })
    const r = await sealedPrice(base)
    expect(h.cardmarketPriceFor).toHaveBeenCalledWith('Paldean Fates Elite Trainer Box', null)
    expect(h.liveEbayEstimate).not.toHaveBeenCalled()
    expect(r).toEqual({ value: 103, source: 'AUTO', origin: 'cardmarket', cardtraderBlueprintId: 100, cardmarketProductId: 653700 })
  })

  it('falls back to eBay when neither Cardtrader nor Cardmarket has a price', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: null, productId: null })
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: 100, cardmarketProductId: null })
  })

  it('does not crash if Cardmarket throws — it falls through to eBay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockRejectedValue(new Error('S3 down'))
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(r?.origin).toBe('ebay')
  })

  it('passes a stored cardmarketProductId straight through', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: 97, productId: 653700 })
    await sealedPrice({ ...base, cardmarketProductId: 653700 })
    expect(h.cardmarketPriceFor).toHaveBeenCalledWith('Paldean Fates Elite Trainer Box', 653700)
  })
```
Also update the two remaining tests that assert the exact returned object ("prefers Cardtrader…" and "returns null when neither source has data") to include `cardmarketProductId`: the Cardtrader-wins result now also carries `cardmarketProductId: null`, and the skip-Cardtrader/eBay result carries `cardmarketProductId: null`. (Match the shape the implementation returns in Step 3.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sealedPrice`
Expected: FAIL — Cardmarket is not yet consulted; results lack `cardmarketProductId` / use eBay too early.

- [ ] **Step 3: Implement the chain**

Rewrite `src/lib/pricing/sealedPrice.ts`:
```ts
import type { PriceInput, PriceResult } from './types'
import { cardtraderEnabled, resolveBlueprintId, getMarketplace, lowestSealedEur } from './cardtrader'
import { cardmarketEnabled, cardmarketPriceFor } from './cardmarket'
import { liveEbayEstimate } from './ebayEstimate'

const CT_LANG: Record<string, string> = { IT: 'it', EN: 'en', JA: 'jp' }

// Sealed pricing: Cardtrader → Cardmarket → eBay. Cardtrader gives a robust low
// EUR marketplace price for products it maps; Cardmarket's public price guide
// (trend) covers the products Cardtrader can't map; eBay's asking-median is the
// last resort. The eBay observatory is informational only — never the value.
export async function sealedPrice(i: PriceInput): Promise<PriceResult | null> {
  const language = i.language ?? 'IT'
  let blueprintId: number | null = i.cardtraderBlueprintId ?? null
  let cardmarketProductId: number | null = i.cardmarketProductId ?? null

  // 1) Cardtrader — the primary EU marketplace price.
  try {
    if (cardtraderEnabled() && i.name) {
      if (blueprintId == null) blueprintId = await resolveBlueprintId(i.name)
      if (blueprintId != null) {
        const products = await getMarketplace(blueprintId, { language: CT_LANG[language] ?? 'it' })
        const { eur } = lowestSealedEur(products, CT_LANG[language] ?? 'it')
        if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: blueprintId, cardmarketProductId }
      }
    }
  } catch {
    // Cardtrader unreachable / rate-limited — fall through.
  }

  // 2) Cardmarket — the public daily price guide, for products Cardtrader can't map.
  try {
    if (cardmarketEnabled() && i.name) {
      const { eur, productId } = await cardmarketPriceFor(i.name, cardmarketProductId)
      if (productId != null) cardmarketProductId = productId
      if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardmarket', cardtraderBlueprintId: blueprintId, cardmarketProductId }
    }
  } catch {
    // Cardmarket file unreachable — fall through to eBay.
  }

  // 3) Fallback: the live eBay EU median, searched with the Italian term (priceQuery).
  const query = i.priceQuery ?? i.name
  if (query && query.trim()) {
    const est = await liveEbayEstimate(query, language)
    if (est.eur != null) return { value: est.eur, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: blueprintId, cardmarketProductId }
  }
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- sealedPrice`
Expected: PASS (all cases, including the throw-falls-through case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/sealedPrice.ts src/lib/pricing/__tests__/sealedPrice.test.ts
git commit -m "feat(pricing): sealedPrice chain becomes Cardtrader → Cardmarket → eBay"
```

---

### Task 5: Source attribution, persistence, and modal wiring

**Files:**
- Modify: `src/lib/priceSource.ts:80-88`
- Test: `src/lib/__tests__/priceSource.test.ts`
- Modify: `src/app/api/prices/refresh/route.ts:64-69`
- Modify: `src/app/api/sealed/estimate/route.ts:28-34`
- Modify: `src/components/ItemFormModal.tsx` (handlePickSealed + submit payload)

**Interfaces:**
- Consumes: `PriceResult.origin === 'cardmarket'`, `PriceResult.cardmarketProductId` (Tasks 1, 4).
- Produces: chip `kind: 'cardmarket'` for sealed; `cardmarketProductId` persisted on refresh and on save; estimate route returns `cardmarketProductId`.

- [ ] **Step 1: Write the failing priceSource test**

In `src/lib/__tests__/priceSource.test.ts`, add:
```ts
  it('a sealed AUTO item priced by Cardmarket reads as cardmarket', () => {
    const s = priceSourceOf({ itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 103, marketValueSource: 'AUTO', autoPriceSource: 'cardmarket' })
    expect(s.kind).toBe('cardmarket')
  })
```
(Follow the file's existing `priceSourceOf` import and call style.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- priceSource`
Expected: FAIL — a Cardmarket sealed item currently returns `kind: 'estimate'`.

- [ ] **Step 3: Map the cardmarket origin**

In `src/lib/priceSource.ts`, inside the `auto && itemType === 'SEALED' && isTcgcsvId(...)` branch, before the `cardtrader` check:
```ts
    if (i.autoPriceSource === 'cardmarket') return { kind: 'cardmarket', langMismatch: false }
    if (i.autoPriceSource === 'cardtrader') return { kind: 'cardtrader', langMismatch: false }
    return { kind: 'estimate', langMismatch: false }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- priceSource`
Expected: PASS.

- [ ] **Step 5: Persist cardmarketProductId on refresh**

In `src/app/api/prices/refresh/route.ts`, in the `prisma.item.update` `data`, after the blueprint spread:
```ts
            ...(r.cardmarketProductId != null ? { cardmarketProductId: r.cardmarketProductId } : {}),
```

- [ ] **Step 6: Return cardmarketProductId from the estimate route**

In `src/app/api/sealed/estimate/route.ts`, add to the success JSON body:
```ts
      cardmarketProductId: primary?.cardmarketProductId ?? null,
```
and in the catch/empty responses add `cardmarketProductId: null` so the shape is stable.

- [ ] **Step 7: Carry cardmarketProductId through the modal**

In `src/components/ItemFormModal.tsx`:
- In `handlePickSealed`, extend the `data` type and reads to include `cardmarketProductId: number | null`, initialise `let cardmarketProductId: number | null = null`, read `cardmarketProductId = data.cardmarketProductId`, and in the `setForm` that promotes to AUTO add `cardmarketProductId`.
- In the initial `setForm` of `handlePickSealed` (the MANUAL-at-0 reset) add `cardmarketProductId: null` next to `cardtraderBlueprintId: null`.
- In the submit `payload`, after `cardtraderBlueprintId`, add:
```ts
      cardmarketProductId: autoEligible ? form.cardmarketProductId : null,
```
- Ensure the form state type and initial state include `cardmarketProductId: number | null` (mirror every place `cardtraderBlueprintId` appears in this file).

- [ ] **Step 8: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. tsc surfaces any `cardmarketProductId` field the form state is missing — add it wherever `cardtraderBlueprintId` exists.

- [ ] **Step 9: Commit**

```bash
git add src/lib/priceSource.ts src/lib/__tests__/priceSource.test.ts src/app/api/prices/refresh/route.ts src/app/api/sealed/estimate/route.ts src/components/ItemFormModal.tsx
git commit -m "feat(pricing): Cardmarket chip + persist cardmarketProductId through refresh/estimate/modal"
```

---

### Task 6: Live verification + threshold tuning

**Files:**
- Create: `scripts/cardmarket-live-check.mjs`

**Interfaces:**
- Consumes: the live S3 files and the `resolveCardmarketProductId` algorithm (re-implemented inline in the script OR imported via a tsx runner — inline is fine; keep it in sync with Task 2).

- [ ] **Step 1: Write the live-check script**

Create `scripts/cardmarket-live-check.mjs`. It must: download both S3 files with a browser UA; for a list of product names, resolve the idProduct and print name → idProduct → {trend, avg, low} → chosen `trend??avg??low`. Assert the anchor case explicitly.
```js
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const CAT = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json'
const PG = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json'

const j = async (u) => (await fetch(u, { headers: { 'User-Agent': UA } })).json()
const norm = (q) => q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

// NOTE: keep this resolver identical to resolveCardmarketProductId in
// src/lib/pricing/cardmarket.ts (product-type filter omitted here for brevity is
// NOT acceptable — port the full algorithm before trusting the output).

const NAMES = [
  'Pokémon GO Elite Trainer Box',
  'Paldean Fates Elite Trainer Box',
  // Add Gabriele's other unmapped-by-Cardtrader products here before running.
]

const cat = (await j(CAT)).products
const pg = new Map((await j(PG)).priceGuides.map((g) => [g.idProduct, g]))
for (const name of NAMES) {
  // resolve with the ported algorithm → id
  // const id = resolve(name, cat)
  // const g = id ? pg.get(id) : null
  // console.log(name, '→', id, g && { trend: g.trend, avg: g.avg, low: g.low }, '→', g ? (g.trend ?? g.avg ?? g.low) : null)
}
// Hard assert the anchor:
const go = cat.find((p) => p.idProduct === 653700)
const goPrice = pg.get(653700)
if (!go || (goPrice.trend ?? goPrice.avg ?? goPrice.low) < 90) throw new Error('anchor Pokémon GO ETB price regressed')
console.log('anchor OK: Pokémon GO ETB →', goPrice.trend ?? goPrice.avg ?? goPrice.low)
```
Port the full `resolveCardmarketProductId` algorithm (product-type hard filter, set-token overlap, COMMON_TOKENS, MIN_SCORE) into the script — do not shortcut it.

- [ ] **Step 2: Ask Gabriele for his unmapped product names**

Before running, ask Gabriele which sealed products currently show a wrong/low eBay price so their names go in `NAMES`. If unavailable, run with the two anchors only and note the gap.

- [ ] **Step 3: Run the live check**

Run: `node scripts/cardmarket-live-check.mjs`
Expected: each name resolves to the correct idProduct; the Pokémon GO ETB prints ~€103 and the anchor assert passes. If any name mis-resolves (wrong sibling, or a false match on an unowned set), adjust `MIN_SCORE`/scoring in `cardmarket.ts`, re-run Task 2 unit tests, then re-run this script. Record the final `MIN_SCORE`.

- [ ] **Step 4: Full suite before merge**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS. This is the F-core scar guard — the whole suite, not a subset.

- [ ] **Step 5: Commit**

```bash
git add scripts/cardmarket-live-check.mjs src/lib/pricing/cardmarket.ts
git commit -m "test(pricing): Cardmarket live-check script + tuned resolver threshold"
```

---

## Deploy (separate — ASK FIRST)

Do **not** push without Gabriele's go-ahead (pushing to `main` spends Netlify credits). At deploy:
1. Confirm the `cardmarketProductId` nullable column is present in the **production** Neon DB (`npm run db:push` against prod, exactly as `cardtraderBlueprintId` was added). Additive + nullable = non-destructive.
2. Merge the feature branch to `main`; let Netlify build.
3. Live-verify in prod: the Pokémon GO ETB item repriced from €39,58 (eBay) to ~€103 with a **Cardmarket** chip; collection total moved up by the expected delta; no item regressed.
4. Update memory `tcg-archive-observatory-wrong-lows.md` / `tcg-archive-collectr-arc.md`: F-cardmarket shipped + verified.

## Self-Review Notes

- **Spec coverage:** client (T2/T3), chain order (T4), `trend→avg→low` (T2), schema/types/itemSchema (T1), priceSource chip (T5), refresh/estimate/modal persistence (T5), live-check + full suite (T6), scope guard "only after Cardtrader" (T4 ordering). All covered.
- **Type consistency:** `cardmarketProductId` (number|null), `CmProduct`/`CmPriceGuide`, `cardmarketPriceFor(name, productId?) → {eur, productId}`, origin `'cardmarket'` — consistent across T1–T5.
- **Known follow-up:** `MIN_SCORE` is set to 2 with a proven-passing fixture set; T6 confirms/tunes it against live data and Gabriele's real product list.
