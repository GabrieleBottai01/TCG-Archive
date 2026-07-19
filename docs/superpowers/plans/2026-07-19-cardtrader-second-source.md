# Cardtrader Second Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cardtrader the primary sealed price source (lowest EUR marketplace listing), with the eBay estimate as fallback, mapped automatically from the item's English catalogue name to a stored Cardtrader `blueprint_id`.

**Architecture:** A new isolated `cardtrader.ts` client (cached expansions/blueprints, pure `lowestSealedEur`, pure `resolveBlueprintId`). A `sealedPrice` orchestrator tries Cardtrader first (via a stored/resolved blueprint id) then falls back to `liveEbayEstimate`, reporting which source produced the value. Two additive nullable columns (`cardtraderBlueprintId`, `autoPriceSource`) persist the mapping and the value's origin. The observatory STRONG reference still wins via `effectiveValue`.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs — see `AGENTS.md`), Prisma (`prisma-client` generator → `src/generated/prisma`), Zod, Vitest, React. Cardtrader REST API v2.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-cardtrader-second-source-design.md`.
- **Value precedence:** observatory STRONG `euReference` > Cardtrader (min EUR listing) > eBay estimate (median) > MANUAL. Do NOT change the STRONG gate in `effectiveValue`.
- Cardtrader value = **minimum** `price.cents/100` over products passing: `price.currency === 'EUR'` AND `bundle_size === 1` AND `graded === false` AND `on_vacation === false`. The item's language is applied via the marketplace API `language` param, not client-side.
- **Token is a secret:** `CARDTRADER_JWT` lives only in env (local `.env` + Netlify), never committed, never printed. Scripts read it from `process.env.CARDTRADER_JWT` — never inline the literal. The controller and subagents must never echo the token value.
- **Absent token → graceful:** no `CARDTRADER_JWT` (or `/info` fails) means the Cardtrader source is inactive and pricing falls back to eBay. No crash.
- Cardtrader base URL `https://api.cardtrader.com/api/v2`; auth header `Authorization: Bearer <JWT>`. `GET /marketplace/products` is limited to ~1 req/s — serialize those calls.
- Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`. Full build gate: `npm run build`.
- Per memory `tcg-archive-mock-vs-live`: green unit tests for `src/lib/pricing/` do NOT prove behaviour. Pure functions are built from the REAL sample obtained in Task 1; Task 9 ends with a live check using a real token.
- Do NOT push to `main`. Work stays on `feat/cardtrader-second-source`.
- `docs/reference/cardtrader-sample.json` is gitignored (Cardtrader content, local build reference only) — like the existing `docs/reference/ebay-browse-sample.json`.

---

### Task 1: Obtain a real Cardtrader sample + confirm the token/eligibility gate

**Purpose:** De-risk everything downstream with real response shapes, and empirically confirm a plain account can use the API (the open eligibility question). **Controller-coordinated** — needs Gabriele to generate the token and put it in local `.env`.

**Files:**
- Create: `scripts/cardtrader-sample.mjs` (dev-only fetch script; committed — it contains no secret)
- Create (gitignored): `docs/reference/cardtrader-sample.json`
- Modify: `.gitignore` (add `docs/reference/cardtrader-sample.json` if the `docs/reference/*` line doesn't already cover it — check first)

- [ ] **Step 1: Gabriele generates the token and sets it in env**

Controller instructs Gabriele: in Cardtrader → Settings → API Access → create a token; add `CARDTRADER_JWT=<token>` to the project's local `.env` AND to Netlify env vars. Confirm the "Create token" button exists without a paid plan (the eligibility gate). If it is gated behind a paid seller plan, STOP and escalate — the whole sub-project premise fails.

- [ ] **Step 2: Write the sample-fetch script**

Create `scripts/cardtrader-sample.mjs` — reads the token from env, never printing it:

```js
// Dev-only. Fetches a real Cardtrader sample to build/validate the client against.
// Reads CARDTRADER_JWT from the environment; never inline or print the token.
import { writeFileSync } from 'node:fs'

const JWT = process.env.CARDTRADER_JWT
if (!JWT) { console.error('Set CARDTRADER_JWT in your environment first.'); process.exit(1) }
const BASE = 'https://api.cardtrader.com/api/v2'
const H = { Authorization: `Bearer ${JWT}` }
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

const info = await get('/info')          // auth test
const games = await get('/games')
const pokemon = games.array?.find?.((g) => /pok[eé]mon/i.test(g.name)) ?? games.find?.((g) => /pok[eé]mon/i.test(g.name))
const gameId = pokemon?.id
const expansions = (await get('/expansions')).filter?.((e) => e.game_id === gameId) ?? []
// Pick an expansion likely to hold sealed (Paldean Fates if present, else the first).
const exp = expansions.find((e) => /paldean fates/i.test(e.name)) ?? expansions[0]
const blueprints = exp ? await get(`/blueprints/export?expansion_id=${exp.id}`) : []
// A sealed-looking blueprint (name mentions a sealed product type), else the first.
const sealed = blueprints.find((b) => /(elite trainer box|booster box|booster bundle|collection)/i.test(b.name)) ?? blueprints[0]
const marketplace = sealed ? await get(`/marketplace/products?blueprint_id=${sealed.id}`) : {}

writeFileSync('docs/reference/cardtrader-sample.json', JSON.stringify(
  { info, gameId, expansionsSample: expansions.slice(0, 20), chosenExpansion: exp, blueprintsSample: blueprints.slice(0, 40), chosenBlueprint: sealed, marketplace }, null, 2))
console.log('Wrote docs/reference/cardtrader-sample.json — expansions:', expansions.length, 'blueprints:', blueprints.length)
```

- [ ] **Step 3: Run it (controller, with the token in env)**

Run: `node scripts/cardtrader-sample.mjs`
Expected: prints `Wrote docs/reference/cardtrader-sample.json …` with non-zero expansions/blueprints counts, and the marketplace object is non-empty for the chosen blueprint. If `GET /info` 401s, the token is wrong; if `/expansions` or `/marketplace` 403s, access is gated → escalate.

- [ ] **Step 4: Confirm gitignore + inspect real field shapes**

Ensure `docs/reference/cardtrader-sample.json` is gitignored (`git check-ignore docs/reference/cardtrader-sample.json` prints the path). Read the sample and record, in the Task-1 report, the ACTUAL field names/values seen (game object shape, expansion `{id,code,name}`, blueprint `{id,name,category_id,...}`, marketplace `{ "<id>": [{ price:{cents,currency}, bundle_size, graded, on_vacation, properties_hash, ... }] }`). Downstream tasks build against these real fields.

- [ ] **Step 5: Commit the script (not the sample)**

```bash
git add scripts/cardtrader-sample.mjs .gitignore
git commit -m "chore(pricing): dev script to fetch a Cardtrader API sample"
```

---

### Task 2: Data model + type extensions

**Files:**
- Modify: `prisma/schema.prisma` (Item model, after `priceQuery`)
- Modify: `src/lib/itemSchema.ts` (after `priceQuery`)
- Modify: `src/components/CollectionView.tsx` (PlainItem, after `priceQuery`)
- Modify: `src/lib/pricing/types.ts` (`PriceInput`, `PriceResult`)

**Interfaces:**
- Produces: `Item.cardtraderBlueprintId: Int?`, `Item.autoPriceSource: String?`; Zod + PlainItem fields; `PriceInput.cardtraderBlueprintId?: number | null`; `PriceResult` gains `origin?: 'cardtrader' | 'ebay'` and `cardtraderBlueprintId?: number | null`.

- [ ] **Step 1: Prisma columns**

In `model Item`, after the `priceQuery` line:

```prisma
  cardtraderBlueprintId Int?          // resolved Cardtrader blueprint id for direct price lookups
  autoPriceSource       String?       // 'cardtrader' | 'ebay' — which source produced marketValue
```

- [ ] **Step 2: Regenerate client (db push is best-effort locally)**

Run: `npx prisma generate` (required — succeeds without a DB). `npx prisma db push` will fail locally (no reachable Postgres, P1013) — expected; prod migrates at deploy. Do not change the datasource.

- [ ] **Step 3: Zod fields** — in `src/lib/itemSchema.ts`, after `priceQuery`:

```typescript
  cardtraderBlueprintId: z.number().int().optional().nullable(),
  autoPriceSource: z.string().optional().nullable(),
```

- [ ] **Step 4: PlainItem fields** — in `src/components/CollectionView.tsx`, after `priceQuery`:

```typescript
  cardtraderBlueprintId: number | null
  autoPriceSource: string | null
```

- [ ] **Step 5: PriceInput + PriceResult** — in `src/lib/pricing/types.ts`:

Add to `PriceInput` after `priceQuery`:

```typescript
  // A resolved Cardtrader blueprint id, when known, lets the sealed provider skip
  // name resolution and price by direct marketplace lookup.
  cardtraderBlueprintId?: number | null
```

Replace `PriceResult` with:

```typescript
export type PriceResult = {
  value: number
  source: 'AUTO' | 'MANUAL'
  /** Which sealed source produced `value` — drives the chip + persisted autoPriceSource. */
  origin?: 'cardtrader' | 'ebay'
  /** The blueprint id resolved during this call, so the caller can persist it. */
  cardtraderBlueprintId?: number | null
}
```

- [ ] **Step 6: Type-check** — `npx tsc --noEmit` → no errors (fields are optional/nullable).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/itemSchema.ts src/components/CollectionView.tsx src/lib/pricing/types.ts
git commit -m "feat(pricing): add cardtraderBlueprintId + autoPriceSource, extend PriceResult"
```

---

### Task 3: Cardtrader client — fetch/cache + pure `lowestSealedEur`

**Files:**
- Create: `src/lib/pricing/cardtrader.ts`
- Create: `src/lib/pricing/__tests__/cardtrader.test.ts`

**Interfaces:**
- Produces: types `CtExpansion { id: number; game_id: number; code: string; name: string }`,
  `CtBlueprint { id: number; name: string; expansion_id: number; category_id?: number }`,
  `CtProduct { price: { cents: number; currency: string }; quantity: number; bundle_size: number; graded: boolean; on_vacation: boolean; properties_hash?: Record<string, unknown> }`.
- Produces: `lowestSealedEur(products: CtProduct[]): { eur: number | null; sampleSize: number }` (pure).
- Produces (live, cached 24h): `getPokemonGameId()`, `getExpansions()`, `getBlueprints(expansionId: number)`, `getMarketplace(blueprintId: number, opts?: { language?: string }): Promise<CtProduct[]>`, and `__resetCardtraderCache()`. `cardtraderEnabled(): boolean` returns `!!process.env.CARDTRADER_JWT`.

- [ ] **Step 1: Write the failing test for `lowestSealedEur`**

Create `src/lib/pricing/__tests__/cardtrader.test.ts` (fixtures mirror the real sample's product shape from Task 1):

```typescript
import { describe, it, expect } from 'vitest'
import { lowestSealedEur, type CtProduct } from '@/lib/pricing/cardtrader'

const p = (over: Partial<CtProduct> = {}): CtProduct => ({
  price: { cents: 14000, currency: 'EUR' },
  quantity: 1, bundle_size: 1, graded: false, on_vacation: false,
  ...over,
})

describe('lowestSealedEur', () => {
  it('is the minimum EUR price of the qualifying products', () => {
    expect(lowestSealedEur([
      p({ price: { cents: 15000, currency: 'EUR' } }),
      p({ price: { cents: 13500, currency: 'EUR' } }),
      p({ price: { cents: 14200, currency: 'EUR' } }),
    ])).toEqual({ eur: 135, sampleSize: 3 })
  })

  it('drops non-EUR, multi-item bundles, graded slabs and vacation sellers', () => {
    expect(lowestSealedEur([
      p({ price: { cents: 9000, currency: 'USD' } }),   // not EUR
      p({ price: { cents: 8000, currency: 'EUR' }, bundle_size: 6 }), // a 6-pack, not one unit
      p({ price: { cents: 7000, currency: 'EUR' }, graded: true }),   // graded
      p({ price: { cents: 6000, currency: 'EUR' }, on_vacation: true }), // unbuyable
      p({ price: { cents: 13000, currency: 'EUR' } }), // the only qualifying one
    ])).toEqual({ eur: 130, sampleSize: 1 })
  })

  it('returns null when nothing qualifies', () => {
    expect(lowestSealedEur([p({ price: { cents: 9000, currency: 'USD' } })])).toEqual({ eur: null, sampleSize: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: FAIL — module `@/lib/pricing/cardtrader` / `lowestSealedEur` not defined.

- [ ] **Step 3: Implement `cardtrader.ts`**

Create `src/lib/pricing/cardtrader.ts`:

```typescript
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
  bundle_size: number
  graded: boolean
  on_vacation: boolean
  properties_hash?: Record<string, unknown>
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
 * sealed unit a buyer could actually purchase. Language is filtered upstream via
 * the marketplace `language` param, so this stays language-agnostic.
 */
export function lowestSealedEur(products: CtProduct[]): { eur: number | null; sampleSize: number } {
  const eur = products
    .filter((p) => p.price?.currency === 'EUR' && p.bundle_size === 1 && !p.graded && !p.on_vacation)
    .map((p) => p.price.cents / 100)
  if (eur.length === 0) return { eur: null, sampleSize: 0 }
  return { eur: Math.min(...eur), sampleSize: eur.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Validate the fetch/cache shape against the real sample**

Read `docs/reference/cardtrader-sample.json` (from Task 1). Confirm the `CtProduct`/`CtExpansion`/`CtBlueprint` field names used above match the real response. If a real field differs (e.g. the marketplace value array is keyed differently, or `price` nests elsewhere), fix the types + `getMarketplace`/`lowestSealedEur` accessors and re-run the test. Note any correction in the report.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/pricing/cardtrader.ts src/lib/pricing/__tests__/cardtrader.test.ts
git commit -m "feat(pricing): Cardtrader client — cached fetch + pure lowestSealedEur"
```

---

### Task 4: Blueprint resolution — pure `resolveBlueprint`

**Files:**
- Modify: `src/lib/pricing/cardtrader.ts` (add pure resolver + live wrapper)
- Modify: `src/lib/pricing/__tests__/cardtrader.test.ts` (add resolver tests)

**Interfaces:**
- Consumes: `normalizeQuery`, `extractProductType` from `@/lib/pricing/sealedGlossary`; `CtExpansion`, `CtBlueprint` (Task 3).
- Produces (pure): `resolveBlueprint(englishName: string, expansions: CtExpansion[], blueprintsByExpansion: (id: number) => CtBlueprint[]): number | null`.
- Produces (live): `resolveBlueprintId(englishName: string): Promise<number | null>` — wires the pure resolver to `getExpansions()`/`getBlueprints()`.

- [ ] **Step 1: Write the failing resolver tests**

Append to `src/lib/pricing/__tests__/cardtrader.test.ts`:

```typescript
import { resolveBlueprint, type CtExpansion, type CtBlueprint } from '@/lib/pricing/cardtrader'

const EXPS: CtExpansion[] = [
  { id: 10, game_id: 1, code: 'PAF', name: 'Paldean Fates' },
  { id: 11, game_id: 1, code: 'PAR', name: 'Paradox Rift' },
]
const BLUEPRINTS: Record<number, CtBlueprint[]> = {
  10: [
    { id: 100, name: 'Paldean Fates Elite Trainer Box', expansion_id: 10 },
    { id: 101, name: 'Paldean Fates Booster Bundle', expansion_id: 10 },
    { id: 102, name: 'Paldean Fates Booster Box', expansion_id: 10 },
  ],
  11: [{ id: 110, name: 'Paradox Rift Elite Trainer Box', expansion_id: 11 }],
}
const lookup = (id: number) => BLUEPRINTS[id] ?? []

describe('resolveBlueprint', () => {
  it('maps an English catalogue name to the right expansion + product-type blueprint', () => {
    expect(resolveBlueprint('Paldean Fates Elite Trainer Box', EXPS, lookup)).toBe(100)
  })
  it('distinguishes product types within the same expansion', () => {
    expect(resolveBlueprint('Paldean Fates Booster Box', EXPS, lookup)).toBe(102)
  })
  it('returns null when no expansion name is contained in the product name', () => {
    expect(resolveBlueprint('Surging Sparks Elite Trainer Box', EXPS, lookup)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: FAIL — `resolveBlueprint` not exported.

- [ ] **Step 3: Implement the resolver**

Add to `src/lib/pricing/cardtrader.ts` (import the glossary helpers at the top):

```typescript
import { normalizeQuery, extractProductType } from './sealedGlossary'
```

```typescript
/**
 * Pure: map an English catalogue name (e.g. "Paldean Fates Elite Trainer Box")
 * to a Cardtrader blueprint id. The English name carries both the set and the
 * product type, and Cardtrader blueprint names are English and structured the
 * same way, so: (1) pick the expansion whose name is contained in the product
 * name, longest wins; (2) within it, pick the blueprint matching the product
 * type with the most token overlap. No confident match => null.
 */
export function resolveBlueprint(
  englishName: string,
  expansions: CtExpansion[],
  blueprintsByExpansion: (id: number) => CtBlueprint[],
): number | null {
  const nameNorm = normalizeQuery(englishName)
  if (!nameNorm) return null

  // (1) expansion: longest expansion name contained in the product name.
  let exp: CtExpansion | null = null
  let expLen = 0
  for (const e of expansions) {
    const en = normalizeQuery(e.name)
    if (en && nameNorm.includes(en) && en.length > expLen) { exp = e; expLen = en.length }
  }
  if (!exp) return null

  // (2) blueprint: the requested product type is a hard filter when present.
  const { productTypes } = extractProductType(nameNorm)
  const nameTokens = new Set(nameNorm.split(' ').filter(Boolean))
  let bestId: number | null = null
  let bestScore = 0
  for (const b of blueprintsByExpansion(exp.id)) {
    const bn = normalizeQuery(b.name)
    if (productTypes.length > 0 && !productTypes.some((t) => bn.includes(t))) continue
    const overlap = bn.split(' ').filter((tok) => tok && nameTokens.has(tok)).length
    if (overlap > bestScore) { bestScore = overlap; bestId = b.id }
  }
  return bestScore > 0 ? bestId : null
}

/** Live wrapper: resolve against the cached expansions/blueprints. */
export async function resolveBlueprintId(englishName: string): Promise<number | null> {
  const expansions = await getExpansions()
  const nameNorm = normalizeQuery(englishName)
  // Only fetch blueprints for the matched expansion (avoid loading every expansion's blueprints).
  let exp: CtExpansion | null = null
  let expLen = 0
  for (const e of expansions) {
    const en = normalizeQuery(e.name)
    if (en && nameNorm.includes(en) && en.length > expLen) { exp = e; expLen = en.length }
  }
  if (!exp) return null
  const blueprints = await getBlueprints(exp.id)
  return resolveBlueprint(englishName, [exp], () => blueprints)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Sanity-check the resolver against the real sample**

Read `docs/reference/cardtrader-sample.json`. Confirm the real expansion names and sealed blueprint names for the chosen expansion actually resolve (e.g. the chosen blueprint's `name` resolves to its `id`). If Cardtrader expansion names differ from catalogue set names in a way that breaks matching, note it in the report as a risk for the Task-9 live check (do not over-fit the matcher to one sample). 

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/pricing/cardtrader.ts src/lib/pricing/__tests__/cardtrader.test.ts
git commit -m "feat(pricing): Cardtrader blueprint resolution from English catalogue name"
```

---

### Task 5: Sealed pricing orchestration — Cardtrader-first, eBay fallback

**Files:**
- Create: `src/lib/pricing/sealedPrice.ts`
- Modify: `src/lib/pricing/tcgcsvProvider.ts`
- Create: `src/lib/pricing/__tests__/sealedPrice.test.ts`

**Interfaces:**
- Consumes: `cardtraderEnabled`, `getMarketplace`, `lowestSealedEur`, `resolveBlueprintId` (Tasks 3-4); `liveEbayEstimate` (existing); `PriceInput`, `PriceResult` (Task 2).
- Produces: `sealedPrice(i: PriceInput): Promise<PriceResult | null>` — Cardtrader-first, eBay fallback, reporting `origin` + `cardtraderBlueprintId`. `TcgcsvProvider.fetchPrice` delegates to it.
- Language mapping: `IT→it`, `EN→en`, `JA→jp` for the marketplace `language` param.

- [ ] **Step 1: Write the failing orchestration tests**

Create `src/lib/pricing/__tests__/sealedPrice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  cardtraderEnabled: vi.fn(() => true),
  resolveBlueprintId: vi.fn(async () => 100 as number | null),
  getMarketplace: vi.fn(async () => [] as unknown[]),
  lowestSealedEur: vi.fn(() => ({ eur: null as number | null, sampleSize: 0 })),
  liveEbayEstimate: vi.fn(async () => ({ eur: null as number | null, sampleSize: 0 })),
}))
vi.mock('@/lib/pricing/cardtrader', () => ({
  cardtraderEnabled: h.cardtraderEnabled,
  resolveBlueprintId: h.resolveBlueprintId,
  getMarketplace: h.getMarketplace,
  lowestSealedEur: h.lowestSealedEur,
}))
vi.mock('@/lib/pricing/ebayEstimate', () => ({ liveEbayEstimate: h.liveEbayEstimate }))

import { sealedPrice } from '@/lib/pricing/sealedPrice'

const base = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'Paldean Fates Elite Trainer Box', priceQuery: 'ETB destino di paldea', language: 'IT' }

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockClear())
  h.cardtraderEnabled.mockReturnValue(true)
  h.resolveBlueprintId.mockResolvedValue(100)
})

describe('sealedPrice', () => {
  it('prefers Cardtrader when it has a price', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 135, sampleSize: 4 })
    const r = await sealedPrice(base)
    expect(r).toEqual({ value: 135, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: 100 })
    expect(h.liveEbayEstimate).not.toHaveBeenCalled()
  })

  it('uses a stored blueprint id without re-resolving', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 140, sampleSize: 2 })
    await sealedPrice({ ...base, cardtraderBlueprintId: 555 })
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).toHaveBeenCalledWith(555, { language: 'it' })
  })

  it('falls back to eBay when Cardtrader has no price, reporting origin ebay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(h.liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: 100 })
  })

  it('skips Cardtrader entirely when the token is absent', async () => {
    h.cardtraderEnabled.mockReturnValue(false)
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).not.toHaveBeenCalled()
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: null })
  })

  it('returns null when neither source has data', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.liveEbayEstimate.mockResolvedValue({ eur: null, sampleSize: 0 })
    expect(await sealedPrice(base)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pricing/__tests__/sealedPrice.test.ts`
Expected: FAIL — `@/lib/pricing/sealedPrice` not found.

- [ ] **Step 3: Implement `sealedPrice.ts`**

Create `src/lib/pricing/sealedPrice.ts`:

```typescript
import type { PriceInput, PriceResult } from './types'
import { cardtraderEnabled, resolveBlueprintId, getMarketplace, lowestSealedEur } from './cardtrader'
import { liveEbayEstimate } from './ebayEstimate'

const CT_LANG: Record<string, string> = { IT: 'it', EN: 'en', JA: 'jp' }

// Sealed pricing, Cardtrader-first. Cardtrader gives the lowest EUR marketplace
// listing (native EUR, product-level); eBay's asking-median is the fallback. The
// observatory STRONG reference still overrides both, but that happens later in
// effectiveValue, not here.
export async function sealedPrice(i: PriceInput): Promise<PriceResult | null> {
  const language = i.language ?? 'IT'
  let blueprintId: number | null = i.cardtraderBlueprintId ?? null

  if (cardtraderEnabled() && i.name) {
    if (blueprintId == null) blueprintId = await resolveBlueprintId(i.name)
    if (blueprintId != null) {
      const products = await getMarketplace(blueprintId, { language: CT_LANG[language] ?? 'it' })
      const { eur } = lowestSealedEur(products)
      if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: blueprintId }
    }
  }

  // Fallback: the live eBay EU median, searched with the Italian term (priceQuery).
  const query = i.priceQuery ?? i.name
  if (query && query.trim()) {
    const est = await liveEbayEstimate(query, language)
    if (est.eur != null) return { value: est.eur, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: blueprintId }
  }
  return null
}
```

Note: a Cardtrader call that throws must not kill the eBay fallback — wrap the Cardtrader block in try/catch so a Cardtrader outage degrades to eBay. Add:

```typescript
// (wrap the `if (cardtraderEnabled() ...)` block body in try/catch)
  try {
    if (cardtraderEnabled() && i.name) {
      if (blueprintId == null) blueprintId = await resolveBlueprintId(i.name)
      if (blueprintId != null) {
        const products = await getMarketplace(blueprintId, { language: CT_LANG[language] ?? 'it' })
        const { eur } = lowestSealedEur(products)
        if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: blueprintId }
      }
    }
  } catch {
    // Cardtrader unreachable / rate-limited — fall through to eBay.
  }
```

(Use the try/catch version as the final code.)

- [ ] **Step 4: Delegate the provider to `sealedPrice`**

Replace the body of `fetchPrice` in `src/lib/pricing/tcgcsvProvider.ts` with:

```typescript
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    return sealedPrice(i)
  }
```

Add the import at the top: `import { sealedPrice } from './sealedPrice'`. Remove the now-unused `liveEbayEstimate` import from this file if it is no longer referenced. Update the file's header comment to say pricing is Cardtrader-first with an eBay fallback.

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run src/lib/pricing/__tests__/sealedPrice.test.ts src/lib/pricing/__tests__/tcgcsvProvider.test.ts`
Expected: PASS. Note: the existing `tcgcsvProvider.test.ts` (Task 2A) mocks `@/lib/pricing/ebayEstimate` and expects eBay to be called — with Cardtrader now first, those tests need `cardtraderEnabled` to be false or Cardtrader to return nothing. Update `tcgcsvProvider.test.ts` to `vi.mock('@/lib/pricing/cardtrader', () => ({ cardtraderEnabled: () => false, resolveBlueprintId: vi.fn(), getMarketplace: vi.fn(), lowestSealedEur: vi.fn() }))` so it still exercises the eBay path deterministically. Re-run until green.

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pricing/sealedPrice.ts src/lib/pricing/tcgcsvProvider.ts src/lib/pricing/__tests__/sealedPrice.test.ts src/lib/pricing/__tests__/tcgcsvProvider.test.ts
git commit -m "feat(pricing): sealed price is Cardtrader-first with eBay fallback"
```

---

### Task 6: Estimate endpoint — Cardtrader-first + eBay comparison

**Files:**
- Modify: `src/app/api/sealed/estimate/route.ts`

**Interfaces:**
- Consumes: `sealedPrice` (Task 5), `liveEbayEstimate` (existing).
- Produces: JSON `{ eur: number | null, sampleSize: number, source: 'cardtrader' | 'ebay' | null, cardtraderBlueprintId: number | null, ebay: { eur: number | null, sampleSize: number } }`.

- [ ] **Step 1: Rewrite the route**

The estimate now takes the item's English `name`, the Italian `priceQuery`, and `language`, returns the Cardtrader-first primary AND the eBay median for the modal's comparison line:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/session'
import { sealedPrice } from '@/lib/pricing/sealedPrice'
import { liveEbayEstimate } from '@/lib/pricing/ebayEstimate'

// Live sealed estimate for the add/edit modal. Primary value is Cardtrader-first
// (see sealedPrice); the eBay median is always returned too, for the modal's
// comparison line. Auth-gated because it spends external API calls.
export async function GET(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') ?? ''
  const priceQuery = req.nextUrl.searchParams.get('priceQuery') ?? ''
  const lang = req.nextUrl.searchParams.get('lang') ?? 'IT'
  const blueprintParam = req.nextUrl.searchParams.get('blueprintId')
  const cardtraderBlueprintId = blueprintParam ? Number(blueprintParam) : null

  if (!name.trim() && !priceQuery.trim()) {
    return NextResponse.json({ eur: null, sampleSize: 0, source: null, cardtraderBlueprintId: null, ebay: { eur: null, sampleSize: 0 } })
  }

  try {
    const [primary, ebay] = await Promise.all([
      sealedPrice({ game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:x', name, priceQuery, language: lang, cardtraderBlueprintId }),
      liveEbayEstimate(priceQuery || name, lang),
    ])
    return NextResponse.json({
      eur: primary?.value ?? null,
      sampleSize: ebay.sampleSize, // (see note) modal shows offers/annunci per source below
      source: primary?.origin ?? null,
      cardtraderBlueprintId: primary?.cardtraderBlueprintId ?? cardtraderBlueprintId,
      ebay: { eur: ebay.eur, sampleSize: ebay.sampleSize },
    })
  } catch {
    return NextResponse.json({ eur: null, sampleSize: 0, source: null, cardtraderBlueprintId, ebay: { eur: null, sampleSize: 0 } }, { status: 502 })
  }
}
```

Note on `sampleSize`: the Cardtrader sample count is not returned by `sealedPrice` today (it returns only value/origin/id). To label "· N offerte" precisely, the modal can show the eBay `ebay.sampleSize` for the eBay line and, for Cardtrader, omit the count OR Task 5 can be extended to carry it. To keep Task 5 stable, **the modal shows the Cardtrader chip WITHOUT a live count in the list, and the modal's Cardtrader line shows no count** (count is an eBay-only affordance for now). Set top-level `sampleSize` to `ebay.sampleSize` only as a backward-compat field; the modal reads `ebay.sampleSize` explicitly. (If a Cardtrader count is wanted later, extend `PriceResult` with `sampleSize` — out of scope here.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sealed/estimate/route.ts
git commit -m "feat(pricing): estimate endpoint returns Cardtrader-first primary + eBay comparison"
```

---

### Task 7: Refresh route — persist origin/blueprint + throttle Cardtrader

**Files:**
- Modify: `src/app/api/prices/refresh/route.ts`

**Interfaces:**
- Consumes: `PriceResult.origin`, `PriceResult.cardtraderBlueprintId` (Task 2/5).

- [ ] **Step 1: Pass the new input + persist the new fields**

In `reprice`, build the input with `cardtraderBlueprintId` and, on a successful result, persist `autoPriceSource` + `cardtraderBlueprintId`:

```typescript
      const input = {
        game: it.game,
        itemType: it.itemType,
        externalId: it.externalId,
        name: it.name,
        priceQuery: it.priceQuery,
        cardtraderBlueprintId: it.cardtraderBlueprintId,
        language: it.language,
      }
      const r = await pickProvider(input).fetchPrice(input)
      if (r) {
        await prisma.item.update({
          where: { id: it.id },
          data: {
            marketValue: r.value,
            marketValueUpdatedAt: new Date(),
            autoPriceSource: r.origin ?? null,
            // Persist a newly-resolved blueprint id so next refresh is a direct lookup.
            ...(r.cardtraderBlueprintId != null ? { cardtraderBlueprintId: r.cardtraderBlueprintId } : {}),
          },
        })
        updated++
      } else {
        failed++
      }
```

- [ ] **Step 2: Throttle Cardtrader marketplace to ~1 req/s**

The worker pool runs `CONCURRENCY = 5` items in parallel; each SEALED item can make a Cardtrader `getMarketplace` call (limit ~1/s). Rather than lower overall throughput (which would slow the TCGdex card repricings too), **keep `CONCURRENCY = 5` unchanged** and serialize only the Cardtrader-eligible repricings with a shared ~1.1s spacing gate, so at most one Cardtrader call fires per ~1.1s while cards keep flowing:

```typescript
// Cardtrader's marketplace endpoint allows ~1 req/s. Space out sealed repricings
// (the only ones that hit Cardtrader) so a bulk refresh does not trip the limit.
let ctNextAt = 0
async function ctSpace() {
  const now = Date.now()
  const wait = Math.max(0, ctNextAt - now)
  ctNextAt = Math.max(now, ctNextAt) + 1100
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}
```

Call `await ctSpace()` at the top of `reprice`, before `fetchPrice`, only when `it.itemType === 'SEALED' && it.externalId?.startsWith('tcgcsv:')`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prices/refresh/route.ts
git commit -m "feat(pricing): refresh persists autoPriceSource + blueprint id, throttles Cardtrader"
```

---

### Task 8: Price-source chip — `cardtrader` kind + i18n

**Files:**
- Modify: `src/lib/priceSource.ts`
- Modify: `src/components/PriceSourceChip.tsx`
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/__tests__/priceSource.test.ts` (create if absent)

**Interfaces:**
- Consumes: `PriceSourceInput` gains `autoPriceSource?: string | null`.
- Produces: `priceSourceOf` returns `{ kind: 'cardtrader' }` for a sealed AUTO item whose `autoPriceSource === 'cardtrader'`.

- [ ] **Step 1: Write the failing test**

Create/append `src/lib/__tests__/priceSource.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { priceSourceOf } from '@/lib/priceSource'

const sealed = { itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 135, marketValueSource: 'AUTO', language: 'IT' as string | null }

describe('priceSourceOf — Cardtrader', () => {
  it('is cardtrader when autoPriceSource says so', () => {
    expect(priceSourceOf({ ...sealed, autoPriceSource: 'cardtrader' }).kind).toBe('cardtrader')
  })
  it('is the eBay estimate otherwise', () => {
    expect(priceSourceOf({ ...sealed, autoPriceSource: 'ebay' }).kind).toBe('estimate')
    expect(priceSourceOf({ ...sealed, autoPriceSource: null }).kind).toBe('estimate')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/priceSource.test.ts`
Expected: FAIL — `kind` is `'estimate'`, not `'cardtrader'` (and TS error: `autoPriceSource` not on the input type).

- [ ] **Step 3: Implement**

In `src/lib/priceSource.ts`:

- Add `'cardtrader'` to `PriceSourceKind`: `export type PriceSourceKind = 'euReference' | 'cardmarket' | 'cardtrader' | 'estimate' | 'manual' | 'none'`.
- Add `autoPriceSource?: string | null` to `PriceSourceInput`.
- In `priceSourceOf`, in the sealed branch, split by origin:

```typescript
  if (auto && i.itemType === 'SEALED' && isTcgcsvId(i.externalId)) {
    // Cardtrader is the primary EU marketplace price; the eBay median is the fallback.
    if (i.autoPriceSource === 'cardtrader') return { kind: 'cardtrader', langMismatch: false }
    return { kind: 'estimate', langMismatch: false }
  }
```

- Add to `PRICE_SOURCE_KEY`: `cardtrader: 'src_cardtrader',`.

In `src/components/PriceSourceChip.tsx`, add a solid-success style (Cardtrader is a real EU marketplace price, like cardmarket): in `STYLE`, add `cardtrader: 'border-solid border-success text-success',`.

In `src/lib/i18n.ts`, add to BOTH the `it` and `en` maps (next to `src_estimate`):
- it: `src_cardtrader: 'Cardtrader EU',`
- en: `src_cardtrader: 'Cardtrader EU',`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/priceSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/priceSource.ts src/components/PriceSourceChip.tsx src/lib/i18n.ts src/lib/__tests__/priceSource.test.ts
git commit -m "feat(ui): Cardtrader price-source chip kind + i18n"
```

---

### Task 9: Modal wiring + live verification

**Files:**
- Modify: `src/components/ItemFormModal.tsx`
- Modify: `src/lib/i18n.ts` (modal Cardtrader label + comparison keys)

**Interfaces:**
- Consumes: the estimate endpoint's new shape (Task 6); `PlainItem.cardtraderBlueprintId` / `autoPriceSource` (Task 2); the `cardtrader` chip kind (Task 8).

- [ ] **Step 1: FormState + seedForm + PriceSourceInput**

Add to `FormState`: `cardtraderBlueprintId: number | null` and `autoPriceSource: string`. Seed both in `seedForm` (edit branch: `item.cardtraderBlueprintId ?? null` / `item.autoPriceSource ?? ''`; new branch: `null` / `''`). Add `autoPriceSource: form.autoPriceSource || null` to the `priceSourceOf({...})` call near line 448 so the modal chip reflects the source.

- [ ] **Step 2: Store the new fields on pick + call the new endpoint shape**

In `handlePickSealed`, change the estimate fetch to send `name`, `priceQuery` and `blueprintId`, and consume the new shape:

```typescript
      const res = await fetch(
        `/api/sealed/estimate?name=${encodeURIComponent(r.name)}&priceQuery=${encodeURIComponent(query || '')}&lang=${encodeURIComponent(lang)}`,
        { signal: controller.signal },
      )
      let eur: number | null = null
      let source: string | null = null
      let blueprintId: number | null = null
      let ebay: { eur: number | null; sampleSize: number } = { eur: null, sampleSize: 0 }
      if (res.ok) {
        const data = (await res.json()) as { eur: number | null; source: string | null; cardtraderBlueprintId: number | null; ebay: { eur: number | null; sampleSize: number } }
        eur = data.eur; source = data.source; blueprintId = data.cardtraderBlueprintId; ebay = data.ebay
      }
      if (priceReqIdRef.current !== reqId) return
      if (eur != null) {
        setForm((prev) => ({ ...prev, marketValue: eur as number, marketValueSource: 'AUTO', autoPriceSource: source ?? '', cardtraderBlueprintId: blueprintId }))
        setAutoPrice(eur)
        setPriceDate(new Date().toISOString())
        setEbaySample(source === 'ebay' && ebay.sampleSize > 0 ? ebay.sampleSize : null)
      }
      setEbayCompare(ebay) // new state for the modal comparison line
```

Add near the other `useState`s: `const [ebayCompare, setEbayCompare] = useState<{ eur: number | null; sampleSize: number }>({ eur: null, sampleSize: 0 })`. Reset it to `{ eur: null, sampleSize: 0 }` in the same places `setEbaySample(null)` is reset. In `handlePickSealed`'s initial `setForm`, set `autoPriceSource: ''` and `cardtraderBlueprintId: null` (cleared until the estimate returns).

- [ ] **Step 3: Persist the new fields in the submit payload**

In the `payload` object in `handleSubmit`, add (only meaningful for sealed auto items, else null):

```typescript
      autoPriceSource: autoEligible && form.itemType === 'SEALED' ? (form.autoPriceSource || null) : null,
      cardtraderBlueprintId: autoEligible && form.itemType === 'SEALED' ? form.cardtraderBlueprintId : null,
```

- [ ] **Step 4: Cardtrader label + eBay comparison line in the price label**

In the `priceLabel` block, add a Cardtrader case and an eBay comparison line. Add `const showCardtrader = source.kind === 'cardtrader'` next to the other `show*` consts, then render:

```tsx
      {!priceLoading && showCardtrader && (
        <p className="text-xs text-success">
          {t('f_priceCardtrader')}
          {formattedPriceDate ? ` ${formattedPriceDate}` : ''}
        </p>
      )}
      {/* eBay comparison — shown in the modal only, never per collection row. */}
      {!priceLoading && ebayCompare.eur != null && source.kind === 'cardtrader' && (
        <p className="text-xs text-muted">
          {t('f_ebayCompare')}: {formatEUR(ebayCompare.eur)} · {ebayCompare.sampleSize} {t('f_estimateListings')}
        </p>
      )}
```

Import `formatEUR` if not already imported. Add i18n keys to BOTH maps:
- it: `f_priceCardtrader: 'Cardtrader EU · offerta più bassa',` and `f_ebayCompare: 'Confronto eBay',`
- en: `f_priceCardtrader: 'Cardtrader EU · lowest listing',` and `f_ebayCompare: 'eBay comparison',`

- [ ] **Step 5: Type-check + full suite + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests pass; production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItemFormModal.tsx src/lib/i18n.ts
git commit -m "feat(ui): modal stores Cardtrader source + blueprint id, shows eBay comparison"
```

- [ ] **Step 7: Live verification (REQUIRED — needs a real CARDTRADER_JWT in env)**

With `CARDTRADER_JWT` set locally (or on the deploy), logged in:

1. **Cardtrader primary.** Add/preview a sealed product Cardtrader stocks (e.g. "Paldean Fates Elite Trainer Box"): confirm the chip reads **"Cardtrader EU"**, the value is the lowest EUR listing, and the **eBay comparison line** shows the eBay median beneath. Do NOT save unless intended (avoids creating a real row — or delete after via the app if Gabriele agrees).
2. **eBay fallback.** Pick a product Cardtrader can't map (or with no EUR listings): confirm the value falls back to the eBay median with the "Stima eBay EU" chip and `autoPriceSource='ebay'`.
3. **Absent token.** With `CARDTRADER_JWT` unset, confirm every sealed item prices via eBay with no error.
4. Record the observed values in the report.

- [ ] **Step 8: Commit any fix from live verification** (only if step 7 surfaced a bug)

```bash
git add -A
git commit -m "fix(pricing): <what the live check surfaced>"
```

---

## Notes for the implementer

- **Do NOT push to `main`.** Pushing triggers a Netlify build that consumes credits (memory `tcg-archive-deploy-costs-credits`). Gabriele decides when to merge/deploy; the prod migration runs in that deploy's `prisma db push` (both new columns are nullable — safe).
- **Never print or commit the token.** Scripts read `process.env.CARDTRADER_JWT`.
- The pure functions were built from the Task-1 sample; if a real field differs from the documented shape, the fix belongs in Task 3/4, and the live check in Task 9 is the backstop the mock-vs-live memory demands.
- If `npx tsc --noEmit` shows pre-existing unrelated errors, scope your check to the files you touched.
