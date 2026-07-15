# Collection Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding to the collection a search → pick → 3 fields → save flow, with automatic prices wherever technically possible and Italian search that works against English catalogues.

**Architecture:** Card data moves from `pokemontcg.io` (English-only, 744 modern cards with no price) to **TCGdex** (`/v2/it`, native Italian names + Cardmarket EUR). Sealed products keep tcgcsv (the only free source) but their already-computed `priceEur`/`externalId` — today silently discarded by the form — get wired up, labelled as US estimates, and converted with a **live** USD→EUR rate instead of a hardcoded `0.92`. Italian sealed search gets a curated IT→EN glossary because no free API carries Italian sealed product names.

**Tech Stack:** Next.js 16 (App Router, TS), React 19, Prisma 7 (client at `src/generated/prisma`), Tailwind v4, Vitest, Zod.

## Global Constraints

- **NEVER `git push` and never deploy.** Work stays local on branch `feat/collection-refactor`. Pushing to `main` triggers a Netlify build and burns the user's credits. Commits are fine.
- Update `docs/progress/2026-07-15-collection-refactor.md` after each task: what changed, what was verified, any error hit and how it was solved.
- UI copy via `useT()` in BOTH `it` and `en` dicts in `src/lib/i18n.ts`.
- No `any`. `npx tsc --noEmit` clean, `npm run lint` error-free, `npm test` green. `npm run build` where a task says so.
- **No Prisma schema changes.** `language` and `marketValueUpdatedAt` already exist; price source is derived from the `externalId` prefix (`tcgcsv:` vs card id).
- Prisma import is always `import { prisma } from '@/lib/db'`.
- Runtime API facts (verified 2026-07-15) — do not "fix" these from memory:
  - TCGdex card **list** returns ONLY `{id, localId, name, image}` — no set, no price.
  - TCGdex `?name=` is a case-insensitive **substring** match. `*` is literal: `name=Primi*` → `[]`.
  - TCGdex images need a suffix: `<image>/high.webp`.
  - FX: use `https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR`. `frankfurter.app` → 301; `exchangerate.host` now needs an API key.

---

### Task 1: Live USD→EUR rate (`src/lib/fx.ts`)

**Files:**
- Create: `src/lib/fx.ts`, `src/lib/__tests__/fx.test.ts`

**Interfaces:**
- Produces: `getUsdToEurRate(): Promise<number>` — live rate, cached 24h in module scope, falls back to `FALLBACK_USD_EUR` on failure. Also exports `FALLBACK_USD_EUR = 0.877` and `__resetFxCache()` (test-only cache reset).

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/fx.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getUsdToEurRate, FALLBACK_USD_EUR, __resetFxCache } from '@/lib/fx'

const okResponse = (rate: number) =>
  ({ ok: true, json: async () => ({ amount: 1, base: 'USD', date: '2026-07-14', rates: { EUR: rate } }) }) as Response

describe('getUsdToEurRate', () => {
  beforeEach(() => __resetFxCache())
  afterEach(() => vi.unstubAllGlobals())

  it('returns the live rate from the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(0.87681)))
    expect(await getUsdToEurRate()).toBe(0.87681)
  })

  it('caches the rate so a second call does not refetch', async () => {
    const spy = vi.fn(async () => okResponse(0.9))
    vi.stubGlobal('fetch', spy)
    await getUsdToEurRate()
    await getUsdToEurRate()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    expect(await getUsdToEurRate()).toBe(FALLBACK_USD_EUR)
  })

  it('falls back when the payload has no EUR rate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ rates: {} }) }) as Response))
    expect(await getUsdToEurRate()).toBe(FALLBACK_USD_EUR)
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- fx`
Expected: FAIL — cannot find module `@/lib/fx`.

- [ ] **Step 3: Implement `src/lib/fx.ts`**

```ts
// Live USD→EUR rate for converting tcgcsv (TCGplayer, USD) sealed prices.
// A hardcoded rate silently drifts: 0.92 was ~5% off the real 0.877 by 2026-07.
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
const TTL_MS = 24 * 60 * 60 * 1000

// Used when the FX API is unreachable. Refresh occasionally; it only bounds the error.
export const FALLBACK_USD_EUR = 0.877

let cache: { rate: number; ts: number } | null = null

/** Test-only: clear the module-scope cache between cases. */
export function __resetFxCache(): void {
  cache = null
}

export async function getUsdToEurRate(): Promise<number> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rate
  try {
    const res = await fetch(FX_URL)
    if (!res.ok) return FALLBACK_USD_EUR
    const json = (await res.json()) as { rates?: { EUR?: number } }
    const rate = json?.rates?.EUR
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return FALLBACK_USD_EUR
    cache = { rate, ts: Date.now() }
    return rate
  } catch {
    return FALLBACK_USD_EUR
  }
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- fx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx.ts src/lib/__tests__/fx.test.ts
git commit -m "feat(fx): live USD/EUR rate with 24h cache and fallback"
```

- [ ] **Step 6: Update the progress log**

Add a row to the "Log modifiche" table in `docs/progress/2026-07-15-collection-refactor.md` recording Task 1 done + `npm test -- fx` green.

---

### Task 2: Sealed product glossary (`src/lib/pricing/sealedGlossary.ts`)

**Files:**
- Create: `src/lib/pricing/sealedGlossary.ts`, `src/lib/pricing/__tests__/sealedGlossary.test.ts`

**Interfaces:**
- Produces:
  - `normalizeQuery(q: string): string` — lowercase, strip accents, punctuation → spaces, collapse whitespace.
  - `translateSealedQuery(q: string): string` — applies the IT→EN glossary to a normalized query, longest phrase first.
  - `queryTokens(q: string): string[]` — normalized tokens ≥3 chars, stopwords removed.

Why a glossary: no free API has Italian sealed product names. Sealed names are compositional (`[Set] + [Product type]`); TCGdex supplies set names in Italian, and product types are a small closed vocabulary.

- [ ] **Step 1: Write the failing test** — `src/lib/pricing/__tests__/sealedGlossary.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { normalizeQuery, translateSealedQuery, queryTokens } from '@/lib/pricing/sealedGlossary'

describe('normalizeQuery', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeQuery("Collezione Allenatore Élite: Rivali!")).toBe('collezione allenatore elite rivali')
  })
  it('collapses whitespace', () => {
    expect(normalizeQuery('  primi   compagni  ')).toBe('primi compagni')
  })
})

describe('translateSealedQuery', () => {
  it('translates the user-reported case', () => {
    expect(translateSealedQuery("Primi compagni d'avventura")).toContain('first partner pack')
  })
  it('translates elite trainer box', () => {
    expect(translateSealedQuery('Collezione Allenatore Élite')).toContain('elite trainer box')
  })
  it('prefers the longest phrase match', () => {
    // "bundle buste" must not be split into "bundle" + "buste"
    expect(translateSealedQuery('Bundle Buste')).toBe('booster bundle')
  })
  it('leaves an already-English query untouched', () => {
    expect(translateSealedQuery('Elite Trainer Box')).toBe('elite trainer box')
  })
  it('keeps unknown words as-is', () => {
    expect(translateSealedQuery('Rivali Predestinati')).toBe('rivali predestinati')
  })
})

describe('queryTokens', () => {
  it('drops stopwords and short tokens', () => {
    expect(queryTokens("Collezione Allenatore Elite di Rivali")).toEqual(['collezione', 'allenatore', 'elite', 'rivali'])
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- sealedGlossary`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/pricing/sealedGlossary.ts`**

```ts
// Italian→English glossary for sealed product searches.
//
// No free API carries Italian sealed product names (tcgcsv is the US TCGplayer
// catalogue), so an Italian query can never match directly. Sealed names are
// compositional — "[Set name] + [Product type]" — and TCGdex already gives us set
// names in Italian, so only the product-type vocabulary needs translating.
// Hand-curated and deliberately not exhaustive: unmatched queries fall through to
// the fuzzy levels in sealed.ts.

const STOPWORDS = new Set(['di', 'da', 'del', 'della', 'delle', 'dei', 'con', 'per', 'the', 'of', 'and', 'il', 'lo', 'la', 'le', 'gli'])

/** Longest phrases first so multi-word entries win over their own substrings. */
const GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ["primi compagni d avventura", 'first partner pack'],
  ['primi compagni', 'first partner pack'],
  ['collezione allenatore elite', 'elite trainer box'],
  ['collezione allenatore', 'elite trainer box'],
  ['confezione allenatore elite', 'elite trainer box'],
  ['bundle buste', 'booster bundle'],
  ['bundle di buste', 'booster bundle'],
  ['box di buste', 'booster box'],
  ['scatola di buste', 'booster box'],
  ['confezione da collezione', 'collection box'],
  ['collezione speciale', 'special collection'],
  ['collezione premium', 'premium collection'],
  ['collezione porta carte', 'card file collection'],
  ['mini album', 'mini portfolio'],
  ['tris di buste', 'booster three pack'],
  ['mazzo lotta', 'battle deck'],
  ['mazzo di lotta', 'battle deck'],
  ['mazzo tematico', 'theme deck'],
  ['mazzo iniziale', 'starter deck'],
  ['bustina', 'booster pack'],
  ['bustine', 'booster pack'],
  ['buste', 'booster'],
  ['busta', 'booster pack'],
  ['scatola', 'box'],
  ['collezione', 'collection'],
  ['mazzo', 'deck'],
]

export function normalizeQuery(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function translateSealedQuery(q: string): string {
  let out = normalizeQuery(q)
  for (const [it, en] of GLOSSARY) {
    if (out.includes(it)) out = out.replace(it, en)
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function queryTokens(q: string): string[] {
  return normalizeQuery(q)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- sealedGlossary`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/sealedGlossary.ts src/lib/pricing/__tests__/sealedGlossary.test.ts
git commit -m "feat(pricing): IT->EN glossary and query normalisation for sealed search"
```

- [ ] **Step 6: Update the progress log** (row for Task 2 + test result).

---

### Task 3: TCGdex card provider (`src/lib/pricing/tcgdex.ts`)

**Files:**
- Create: `src/lib/pricing/tcgdex.ts`, `src/lib/pricing/__tests__/tcgdex.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type TcgdexCardResult = { externalId: string; name: string; setName: string; cardNumber: string; imageUrl: string | null }`
  - `searchTcgdexCards(q: string): Promise<TcgdexCardResult[]>` — Italian search; set name resolved from a cached set map.
  - `fetchTcgdexPriceEur(externalId: string): Promise<number | null>` — `pricing.cardmarket.low`.
  - `__resetTcgdexCache(): void` (test-only).

Verified API facts: the list returns only `{id, localId, name, image}` (no set, no price); price lives on the detail endpoint; images need a `/high.webp` suffix; `?name=` is substring, `*` is literal.

- [ ] **Step 1: Write the failing test** — `src/lib/pricing/__tests__/tcgdex.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTcgdexCards, fetchTcgdexPriceEur, __resetTcgdexCache } from '@/lib/pricing/tcgdex'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

const SETS = [{ id: 'sv10', name: 'Rivali Predestinati' }, { id: 'sm8', name: 'Anime Folgoranti' }]
const CARDS = [
  { id: 'sv10-165', localId: '165', name: 'Avventura di Armonio', image: 'https://assets.tcgdex.net/it/sv/sv10/165' },
]

describe('searchTcgdexCards', () => {
  beforeEach(() => __resetTcgdexCache())
  afterEach(() => vi.unstubAllGlobals())

  it('returns Italian cards with set name and a usable image URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/sets') ? json(SETS) : json(CARDS)))
    const [r] = await searchTcgdexCards('Avventura')
    expect(r.externalId).toBe('sv10-165')
    expect(r.name).toBe('Avventura di Armonio')
    expect(r.setName).toBe('Rivali Predestinati')   // resolved from the id prefix
    expect(r.cardNumber).toBe('165')
    expect(r.imageUrl).toBe('https://assets.tcgdex.net/it/sv/sv10/165/high.webp') // suffix required
  })

  it('returns [] for a blank query without calling the API', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await searchTcgdexCards('  ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns [] when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    expect(await searchTcgdexCards('Avventura')).toEqual([])
  })
})

describe('fetchTcgdexPriceEur', () => {
  beforeEach(() => __resetTcgdexCache())
  afterEach(() => vi.unstubAllGlobals())

  it('reads pricing.cardmarket.low', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'sv10-165', pricing: { cardmarket: { unit: 'EUR', low: 0.02, avg: 0.08 } } })))
    expect(await fetchTcgdexPriceEur('sv10-165')).toBe(0.02)
  })

  it('returns null when the card has no cardmarket pricing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'x-1', pricing: { tcgplayer: { unit: 'USD' } } })))
    expect(await fetchTcgdexPriceEur('x-1')).toBeNull()
  })

  it('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as Response))
    expect(await fetchTcgdexPriceEur('nope-1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- tcgdex`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/pricing/tcgdex.ts`**

```ts
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
```

- [ ] **Step 4: Run → PASS**

Run: `npm test -- tcgdex`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/tcgdex.ts src/lib/pricing/__tests__/tcgdex.test.ts
git commit -m "feat(pricing): TCGdex provider with Italian card search and Cardmarket EUR prices"
```

- [ ] **Step 6: Update the progress log** (Task 3 + test result).

---

### Task 4: Wire TCGdex into the provider registry, drop pokemontcg.io

**Files:**
- Create: `src/lib/pricing/tcgdexProvider.ts`
- Modify: `src/lib/pricing/index.ts`, `src/lib/pricing/types.ts` (only if needed — read it first)
- Delete: `src/lib/pricing/pokemonTcgIo.ts`, `src/lib/pricing/__tests__/pokemonTcgIo.test.ts`
- Modify: `src/lib/pricing/search.ts`
- Test: `src/lib/pricing/__tests__/pickProvider.test.ts`

**Interfaces:**
- Consumes: `fetchTcgdexPriceEur`, `searchTcgdexCards` (Task 3).
- Produces: `TcgdexProvider` implementing the existing `PriceProvider` interface (`supports(i)` / `fetchPrice(i)`); `pickProvider` returns `Tcgcsv | Tcgdex | Manual`. `searchPokemonCards(q)` in `search.ts` now delegates to TCGdex and keeps returning `CardSearchResult[]` so `CardSearch.tsx` keeps compiling.

`CardSearchResult` keeps its shape but `lowPrice` becomes **always `null`** from search (the TCGdex list has no prices — the price is fetched on pick in Task 6). Do not remove the field; Task 6 replaces its use.

- [ ] **Step 1: Read the existing interface**

Run: `cat src/lib/pricing/types.ts src/lib/pricing/index.ts src/lib/pricing/manual.ts`
Note the exact `PriceProvider` / `PriceInput` / `PriceResult` shapes — the new provider must match them exactly.

- [ ] **Step 2: Write the failing test** — `src/lib/pricing/__tests__/pickProvider.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { pickProvider } from '@/lib/pricing'

describe('pickProvider', () => {
  it('routes a sealed tcgcsv id to the tcgcsv provider', () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2' }
    expect(pickProvider(i).supports(i)).toBe(true)
  })
  it('routes a Pokémon card id to the TCGdex provider', () => {
    const i = { game: 'POKEMON', itemType: 'RAW', externalId: 'sv10-165' }
    expect(pickProvider(i).supports(i)).toBe(true)
  })
  it('falls back to manual when there is no externalId', async () => {
    const i = { game: 'POKEMON', itemType: 'RAW', externalId: null }
    expect(await pickProvider(i).fetchPrice(i)).toBeNull()
  })
  it('falls back to manual for a graded slab (its value diverges from the raw card)', async () => {
    const i = { game: 'POKEMON', itemType: 'GRADED', externalId: 'sv10-165' }
    expect(await pickProvider(i).fetchPrice(i)).toBeNull()
  })
})
```

- [ ] **Step 3: Run → FAIL**

Run: `npm test -- pickProvider`
Expected: FAIL — TCGdex provider not wired.

- [ ] **Step 4: Create `src/lib/pricing/tcgdexProvider.ts`**

```ts
import type { PriceProvider, PriceInput, PriceResult } from './types'
import { fetchTcgdexPriceEur } from './tcgdex'

// Prices Pokémon singles from TCGdex (Cardmarket, EUR). Graded slabs are excluded:
// a slab's value diverges from the raw card price, so it stays MANUAL.
export class TcgdexProvider implements PriceProvider {
  supports(i: PriceInput): boolean {
    return i.game === 'POKEMON' && i.itemType === 'RAW' && !!i.externalId && !i.externalId.startsWith('tcgcsv:')
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    const eur = await fetchTcgdexPriceEur(i.externalId as string)
    return eur != null ? { value: eur, source: 'AUTO' } : null
  }
}
```

- [ ] **Step 5: Rewrite `src/lib/pricing/index.ts`**

```ts
import type { PriceInput, PriceProvider } from './types'
import { TcgdexProvider } from './tcgdexProvider'
import { TcgcsvProvider } from './tcgcsvProvider'
import { ManualProvider } from './manual'

export * from './types'
export { TcgdexProvider } from './tcgdexProvider'
export { TcgcsvProvider } from './tcgcsvProvider'
export { ManualProvider } from './manual'

export function pickProvider(i: PriceInput): PriceProvider {
  // Sealed items carry a tcgcsv reference; Pokémon raw cards use TCGdex.
  const tcgcsv = new TcgcsvProvider()
  if (tcgcsv.supports(i)) return tcgcsv
  const dex = new TcgdexProvider()
  return dex.supports(i) ? dex : new ManualProvider()
}
```

- [ ] **Step 6: Rewrite `src/lib/pricing/search.ts` to delegate to TCGdex**

```ts
import { searchTcgdexCards } from './tcgdex'

export type CardSearchResult = {
  externalId: string; name: string; setName: string
  cardNumber: string; imageUrl: string | null; lowPrice: number | null
}

// TCGdex's list endpoint carries no prices, so `lowPrice` is always null here.
// The price is fetched on pick via /api/cards/price (see the form).
export async function searchPokemonCards(q: string): Promise<CardSearchResult[]> {
  const cards = await searchTcgdexCards(q)
  return cards.map((c) => ({ ...c, lowPrice: null }))
}
```

- [ ] **Step 7: Delete pokemontcg.io**

```bash
git rm src/lib/pricing/pokemonTcgIo.ts src/lib/pricing/__tests__/pokemonTcgIo.test.ts
```

- [ ] **Step 8: Fix remaining references**

Run: `grep -rn "pokemonTcgIo\|PokemonTcgIoProvider\|searchPokemonSets\|POKEMONTCGIO_API_KEY" src/`
Update every hit. `searchPokemonSets` (used by `/api/sets/search`) lived in `search.ts` — if the route still imports it, either delete the route if unused (`grep -rn "api/sets/search" src/`) or reimplement it over `GET https://api.tcgdex.net/v2/it/sets` returning `{setId, name, series: '', imageUrl: <logo>}`. Decide based on what the grep shows; do not leave a dangling import.

- [ ] **Step 9: Run → PASS + full check**

```bash
npm test
npx tsc --noEmit
npm run lint
```
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(pricing): route Pokemon cards through TCGdex; remove pokemontcg.io"
```

- [ ] **Step 11: Update the progress log** (Task 4 + what the grep in Step 8 found and how it was resolved).

---

### Task 5: Sealed search — glossary + live FX + graceful fallback

**Files:**
- Modify: `src/lib/pricing/sealed.ts`
- Test: `src/lib/pricing/__tests__/sealed.test.ts`

**Interfaces:**
- Consumes: `getUsdToEurRate` (Task 1); `translateSealedQuery`, `normalizeQuery`, `queryTokens` (Task 2).
- Produces: `searchSealedProducts(q)` keeps its `SealedSearchResult[]` shape (`{name, imageUrl, priceEur, externalId}`) and gains `matchLevel: 'exact' | 'fuzzy'` so the UI can explain why English names appear.

Search cascade (stop at the first level that yields results): ① glossary IT→EN ② IT→EN set names via TCGdex (already in `sealed.ts`) ③ normalized substring ④ token overlap, ranked by tokens matched. If all are empty, return `[]` — the UI shows a hint, never claims the product does not exist, and never pads the list with unrelated products.

- [ ] **Step 1: Read the current file**

Run: `cat src/lib/pricing/sealed.ts`
Note: `USD_TO_EUR = 0.92` at line 6 and `toEur()` are what change; `loadStatic()` already builds the IT/EN set map — keep it.

- [ ] **Step 2: Write the failing test** — `src/lib/pricing/__tests__/sealed.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchSealedProducts } from '@/lib/pricing/sealed'
import { __resetFxCache } from '@/lib/fx'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

// One group whose products are English, as tcgcsv really is.
const GROUPS = { results: [{ groupId: 1, name: 'Sword & Shield' }] }
const PRODUCTS = { results: [
  { productId: 10, name: 'First Partner Pack', imageUrl: 'https://img/1.jpg', extendedData: [] },
  { productId: 11, name: 'Sword & Shield Elite Trainer Box', imageUrl: 'https://img/2.jpg', extendedData: [] },
] }
const PRICES = { results: [
  { productId: 10, subTypeName: 'Normal', marketPrice: 10 },
  { productId: 11, subTypeName: 'Normal', marketPrice: 100 },
] }

function stubApis() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('frankfurter')) return json({ rates: { EUR: 0.5 } })   // easy maths
    if (url.includes('tcgdex')) return json([{ id: 'swsh1', name: 'Spada e Scudo' }])
    if (url.includes('/groups')) return json(GROUPS)
    if (url.includes('/products')) return json(PRODUCTS)
    if (url.includes('/prices')) return json(PRICES)
    return json({})
  }))
}

afterEach(() => { vi.unstubAllGlobals(); __resetFxCache() })

describe('searchSealedProducts', () => {
  it('finds an English product from an Italian query via the glossary', async () => {
    stubApis()
    const out = await searchSealedProducts("Primi compagni d'avventura")
    expect(out.map((r) => r.name)).toContain('First Partner Pack')
  })

  it('converts USD prices with the live rate, not the old hardcoded 0.92', async () => {
    stubApis()
    const out = await searchSealedProducts('First Partner Pack')
    const fp = out.find((r) => r.name === 'First Partner Pack')
    expect(fp?.priceEur).toBe(5) // 10 USD * 0.5, not 10 * 0.92
  })

  it('returns an empty list rather than unrelated products for a nonsense query', async () => {
    stubApis()
    expect(await searchSealedProducts('zzzzqqqq')).toEqual([])
  })
})
```

- [ ] **Step 3: Run → FAIL**

Run: `npm test -- sealed`
Expected: FAIL — the glossary is not applied and the rate is still 0.92.

- [ ] **Step 4: Implement the changes in `src/lib/pricing/sealed.ts`**

Make exactly these edits, keeping the rest of the file intact:

1. Replace the hardcoded rate with the live one — delete `const USD_TO_EUR = 0.92` and add the imports:

```ts
import { getUsdToEurRate } from '@/lib/fx'
import { translateSealedQuery, normalizeQuery, queryTokens } from './sealedGlossary'
```

2. Make `toEur` take the rate (it can no longer read a module constant):

```ts
const toEur = (usd: number | null | undefined, rate: number) =>
  typeof usd === 'number' ? Math.round(usd * rate * 100) / 100 : null
```

3. Extend the result type:

```ts
export type SealedSearchResult = {
  name: string
  imageUrl: string | null
  priceEur: number | null
  externalId: string // tcgcsv:groupId:productId
  matchLevel: 'exact' | 'fuzzy'
}
```

4. Replace the body of `searchSealedProducts` with the cascade (keep `loadStatic`, `getJson`, `norm` as they are):

```ts
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
```

5. Update `fetchTcgcsvPriceEur` to use the live rate:

```ts
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
```

- [ ] **Step 5: Run → PASS**

Run: `npm test -- sealed`
Expected: PASS (3 tests).

- [ ] **Step 6: Full check + commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add -A
git commit -m "feat(pricing): glossary-driven sealed search with live FX and graceful fallback"
```

- [ ] **Step 7: Update the progress log** (Task 5 + results).

---

### Task 6: Card price on pick (`/api/cards/price`)

**Files:**
- Create: `src/app/api/cards/price/route.ts`
- Modify: `src/components/CardSearch.tsx` (read it first)

**Interfaces:**
- Consumes: `fetchTcgdexPriceEur` (Task 3), `requireUserId` (`@/lib/session`).
- Produces: `GET /api/cards/price?id=<externalId>` → `{ priceEur: number | null }`; 401 unauthenticated; 400 without `id`.

The TCGdex list has no prices, so the form fetches the price for the single card the user picked.

- [ ] **Step 1: Implement `src/app/api/cards/price/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { fetchTcgdexPriceEur } from '@/lib/pricing/tcgdex'
import { requireUserId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 })
  const priceEur = await fetchTcgdexPriceEur(id)
  return NextResponse.json({ priceEur })
}
```

- [ ] **Step 2: Check how the existing card search route is written**

Run: `cat src/app/api/cards/search/route.ts`
Expected: it calls `searchPokemonCards`. It should still compile after Task 4 — if it passes an API key argument, drop that argument (TCGdex needs no key).

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```
Expected: green; the route list includes `/api/cards/price`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): fetch a single card's Cardmarket price on pick"
```

- [ ] **Step 5: Update the progress log** (Task 6).

---

### Task 7: i18n keys for the new form

**Files:**
- Modify: `src/lib/i18n.ts`

**Interfaces:**
- Produces: keys consumed by Task 8. Add to BOTH `it` and `en` dicts.

- [ ] **Step 1: Add to the `it` dict**

```ts
  f_typeSealed: 'Sigillato',
  f_typeCard: 'Carta',
  f_isGraded: 'Gradata',
  f_searchSealed: 'Cerca un prodotto sigillato',
  f_searchCard: 'Cerca una carta',
  f_quantity: 'Quantità',
  f_paidPrice: 'Prezzo pagato',
  f_language: 'Lingua',
  f_langIT: 'Italiano',
  f_langEN: 'Inglese',
  f_langJA: 'Giapponese',
  f_moreDetails: 'Altri dettagli',
  f_priceCardmarket: 'Cardmarket · aggiornato il',
  f_priceEstimateUsa: 'Stima TCGplayer USA · convertito ·',
  f_priceEstimateLangWarn: 'Stima basata sul prodotto inglese: il catalogo non include i sigillati in questa lingua.',
  f_priceManual: 'Valore inserito a mano',
  f_backToAuto: 'Torna al prezzo automatico',
  f_noPrice: 'Nessun prezzo automatico disponibile',
  f_fuzzyNote: 'Risultati in inglese: il catalogo dei sigillati è solo in inglese.',
  f_noResultsHint: 'Nessun risultato. Prova il nome del set o il termine inglese.',
  f_change: 'Cambia',
```

- [ ] **Step 2: Add the same keys to the `en` dict**

```ts
  f_typeSealed: 'Sealed',
  f_typeCard: 'Card',
  f_isGraded: 'Graded',
  f_searchSealed: 'Search a sealed product',
  f_searchCard: 'Search a card',
  f_quantity: 'Quantity',
  f_paidPrice: 'Price paid',
  f_language: 'Language',
  f_langIT: 'Italian',
  f_langEN: 'English',
  f_langJA: 'Japanese',
  f_moreDetails: 'More details',
  f_priceCardmarket: 'Cardmarket · updated',
  f_priceEstimateUsa: 'TCGplayer US estimate · converted ·',
  f_priceEstimateLangWarn: 'Estimate based on the English product: the catalogue has no sealed products in this language.',
  f_priceManual: 'Value entered manually',
  f_backToAuto: 'Back to the automatic price',
  f_noPrice: 'No automatic price available',
  f_fuzzyNote: 'English results: the sealed catalogue is English-only.',
  f_noResultsHint: 'No results. Try the set name or the English term.',
  f_change: 'Change',
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && npm test
```
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): keys for the simplified collection form"
```

- [ ] **Step 5: Update the progress log** (Task 7).

---

### Task 8: Rebuild `ItemFormModal` — 14 fields down to 3

**Files:**
- Modify: `src/components/ItemFormModal.tsx`
- Modify: `src/components/SealedSearch.tsx` (show price + fuzzy note)

**Interfaces:**
- Consumes: i18n keys (Task 7), `/api/cards/price` (Task 6), `SealedSearchResult` with `matchLevel` + `priceEur` + `externalId` (Task 5), `CardSearchResult` (Task 4).
- Produces: the same POST/PUT payload to `/api/items` as today — **the API contract does not change**.

**Behaviour (write the full JSX; keep the existing portal, Escape handling, focus and scroll-lock logic exactly as-is):**

- **Always visible, in order:**
  1. **Type toggle**: two buttons, `t('f_typeSealed')` / `t('f_typeCard')`, mapping to `itemType` `SEALED` / `RAW`. The **game selector is removed**; `game` is hardcoded `'POKEMON'` in the form state. When `Carta` is active, a checkbox `t('f_isGraded')` switches `itemType` between `RAW` and `GRADED`.
  2. **Search**: `SealedSearch` when `SEALED`, `CardSearch` when `RAW`/`GRADED`.
  3. **Summary card** once something is picked (or when editing): image + name + set, plus the price label (below) and a `t('f_change')` button that clears the pick and shows the search again.
  4. **Quantity** (number, min 1), **Price paid** (number, min 0, step .01), **Language** (`<select>`: `IT` / `EN` / `JA`, using `f_langIT` / `f_langEN` / `f_langJA`; store the code in `form.language`).
- **`<details>` "Altri dettagli"** (`t('f_moreDetails')`), collapsed, containing exactly the fields that exist today: condition (RAW only), grading company + grade (GRADED only), notes, market-value override, image URL, and editable name / set / card number.
- **Price label**, computed from state:
  - card (`itemType==='RAW'`, `externalId` set, source `AUTO`) → green, `t('f_priceCardmarket')` + date
  - sealed with `externalId.startsWith('tcgcsv:')` and source `AUTO` → amber, `t('f_priceEstimateUsa')` + date; **if `form.language !== 'EN'`** also render `t('f_priceEstimateLangWarn')`
  - source `MANUAL` → muted, `t('f_priceManual')`; if an `externalId` exists show a button `t('f_backToAuto')` that restores the auto value
  - no auto price available → `t('f_noPrice')`
- **On pick (card)**: fill name/set/cardNumber/imageUrl/externalId, then `GET /api/cards/price?id=<externalId>`; on `{priceEur}` non-null set `marketValue` and `marketValueSource: 'AUTO'`; on null leave `MANUAL`. Graded stays `MANUAL` (a slab's value diverges from the raw card).
- **On pick (sealed)**: fill name/imageUrl **and now also `externalId` and `marketValue` from `priceEur`**, with `marketValueSource: 'AUTO'` when `priceEur != null` — this is the bug being fixed: today `handlePickSealed` discards both.
- Editing the market value by hand sets `marketValueSource: 'MANUAL'` (existing behaviour — keep it).
- No `any`.

- [ ] **Step 1: Re-read the current file end to end**

Run: `cat src/components/ItemFormModal.tsx`
The payload construction (`autoEligible`, explicit `null`s for cleared optionals, grading/condition normalisation) is subtle and **must be preserved**; only the field layout and the two pick handlers change. Note `autoEligible` must now accept TCGdex card ids — the old check was `form.game === 'POKEMON' && form.itemType === 'RAW'`, which still holds.

- [ ] **Step 2: Rewrite the component per the behaviour above.**

- [ ] **Step 3: Update `SealedSearch.tsx`** to show `priceEur` next to each result (formatted with `formatEUR` from `@/lib/format`) and, when every result has `matchLevel === 'fuzzy'`, render `t('f_fuzzyNote')` above the list. Replace the current `t('m_noResults')` empty state with `t('f_noResultsHint')`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(collection): simplified add flow with labelled automatic prices"
```

- [ ] **Step 6: Update the progress log** (Task 8 + anything surprising found in the rewrite).

---

### Task 9: Manual verification script + final pass

**Files:**
- Modify: `docs/progress/2026-07-15-collection-refactor.md`

There is no local Postgres (the local `.env` uses SQLite), so the flow cannot be exercised end-to-end locally. This task verifies what *can* be verified and records the rest for the user to check after they authorise a deploy.

- [ ] **Step 1: Verify the live search paths against the real APIs**

```bash
# Italian card search must return Italian names
curl -s 'https://api.tcgdex.net/v2/it/cards?name=Avventura' | head -c 300
# The user's reported query, through the glossary, must resolve to an English product
node -e "console.log(require('./src/lib/pricing/sealedGlossary.ts'))" 2>/dev/null || echo "(TS module — covered by unit tests instead)"
```
Record the outcome in the progress log.

- [ ] **Step 2: Full suite**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 3: Write the post-deploy checklist into the progress log**

Add a "Da verificare dopo il deploy (quando autorizzato)" section listing:
- search "Primi compagni d'avventura" in the sealed form → First Partner Pack appears
- search "Avventura" in the card form → Italian names appear
- pick a sealed product → the value is filled and labelled as a US estimate
- pick a card → the value is filled and labelled Cardmarket
- an item whose language is IT/JA shows the English-product warning
- the price refresh button still works on existing items

- [ ] **Step 4: Commit**

```bash
git add docs/progress/2026-07-15-collection-refactor.md
git commit -m "docs: record collection refactor verification status"
```

---

## Self-Review

**Spec coverage:**
- TCGdex primary, pokemontcg.io removed → Tasks 3, 4. ✓
- Sealed auto price, labelled → Tasks 5, 8. ✓
- Live USD→EUR → Tasks 1, 5. ✓
- IT→EN glossary + 5-level cascade → Tasks 2, 5 (levels 1–4 in code; level 5 = the `f_noResultsHint` empty state in Task 8). ✓
- Form 14 → 3 fields, game selector removed, language select, "Altri dettagli" → Task 8. ✓
- Price on pick (list has no prices) → Tasks 3, 6, 8. ✓
- No schema change → nothing in any task touches `prisma/schema.prisma`. ✓
- No push / no deploy → Global Constraints + Task 9. ✓
- Progress log per task → final step of every task. ✓

**Placeholder scan:** No TBD/TODO. Task 4 Step 8 and Task 8 Step 1 direct the engineer to read real code before editing rather than guessing — the greps and expected shapes are spelled out. Task 8 gives exact field lists and label rules instead of "handle the edge cases".

**Type consistency:** `PriceProvider`/`PriceInput`/`PriceResult` reused unchanged from `types.ts` (Task 4 Step 1 verifies). `SealedSearchResult` gains `matchLevel` in Task 5 and is consumed with that field in Task 8. `CardSearchResult.lowPrice` stays in the type (Task 4) and is superseded by `/api/cards/price` (Task 6) — the field is not read by the new form. `getUsdToEurRate` (Task 1) is consumed in Task 5. `fetchTcgdexPriceEur` (Task 3) is consumed in Tasks 4 and 6. `__resetFxCache`/`__resetTcgdexCache` exist because both modules cache at module scope and Vitest shares module state across tests in a file.
