# EU Price Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn what each sealed product in the collection is actually worth in Europe, by observing eBay every day, so the collection stops being valued with a US estimate measured at ~2.5–3× off.

**Architecture:** A daily Netlify scheduled function polls the eBay Browse API for the sealed products the user owns, matches listing titles to products (discarding anything uncertain), and records observations. Raw observations are pruned at 30 days; permanent per-day aggregates (`PriceReference`) carry the learning forward. A listing's available quantity dropping is a **confirmed sale** at a known price — the strongest signal, and free.

**Tech Stack:** Next.js 16 (App Router, TS), Prisma 7 on Neon Postgres (HTTP driver), Vitest, Netlify Scheduled Functions.

**Spec:** `docs/superpowers/specs/2026-07-15-eu-price-observatory-design.md` — read it before Task 2.

## ⛔ THIS PLAN IS BLOCKED

**Task 1 is a human verification gate. Do not implement Tasks 2+ until it returns.**

Every eBay fact in the spec is **unverified**: `developer.ebay.com` blocks automated access (6 consecutive failed fetches), so the rate limit, the marketplace IDs, the response shape and — critically — the **data-retention clause** all come from search snippets, not from documents anyone has read. A plan that specifies eBay request/response code right now would be **invented**. In this same repo, mocked fixtures that did not mirror reality hid the same bug three times (see `docs/progress/2026-07-15-collection-refactor.md`); do not repeat that against an API nobody has seen.

## Global Constraints

- **NEVER `git push` and never deploy without the user asking.** Netlify free = 300 credits/month and a deploy costs 15 → **~20 deploys/month**. Local commits are fine.
- **Netlify scheduled functions time out at 30s.** ~100 products × 2 marketplaces cannot be fetched serially. Bound the concurrency, and if a run cannot finish in 30s, split the watchlist across days rather than exceeding the limit.
- **Neon free = 0.5 GB, hard stop** (writes start failing; no overage billing). Raw observations MUST be pruned. Aggregates are permanent but tiny.
- No `any`. `npx tsc --noEmit` clean, `npm run lint` error-free, `npm test` green, `npm run build` compiles.
- Prisma import is always `import { prisma } from '@/lib/db'`. Types/enums from `@/generated/prisma/client`.
- UI copy via `useT()` in BOTH `it` and `en` dicts.
- **The local `.env` uses SQLite while the app uses the Neon adapter, so nothing DB-backed runs locally.** Verify with tsc/lint/test/build; runtime only in production.
- This plan DOES change `prisma/schema.prisma` (two new models) — the first schema change since the auth work. `npx prisma db push` runs in the Netlify build.

---

### Task 1: 🔴 Verification gate (the user does this, not an agent)

**Nothing here is code. Tasks 2+ are undefined until these answers exist.**

- [ ] **Step 1: Read eBay's API License Agreement, logged in**

Go to `developer.ebay.com`, sign in, find the API License Agreement, and read the caching / data-retention section. Answer:
1. Does a **30-day destruction rule for eBay Data** exist in the CURRENT agreement?
2. Does it cover **derived aggregates** (a median price computed from listings), or only listing content (titles, images, descriptions)?

**If derived aggregates are exempt** → the roll-up design stands, continue.
**If aggregates are also covered** → **STOP.** The observatory is not lawful on eBay data and the source must change. Do not write the code and tell the user.

- [ ] **Step 2: Capture one real Browse API response**

With the dev account active, make one real call and save the raw JSON to `docs/reference/ebay-browse-sample.json`:

```
GET https://api.ebay.com/buy/browse/v1/item_summary/search?q=Pokemon%20Elite%20Trainer%20Box&limit=10
Headers: Authorization: Bearer <token>, X-EBAY-C-MARKETPLACE-ID: EBAY_IT
```

Record, from the real response and the real dashboard:
- The exact JSON shape of an `itemSummary` — the real field names for id, title, price, currency, and **available quantity** (the spec assumes something like `estimatedAvailabilities.estimatedAvailableQuantity`; **this is a guess** and the whole confirmed-sale signal depends on it).
- **Is available quantity present in the SEARCH results, or only in the item-detail call?** If detail-only, the confirmed-sale signal costs one extra call per listing per day and the design must be re-costed before Task 5.
- Whether `EBAY_IT` is accepted as a marketplace id.
- The actual daily call limit shown in the developer dashboard.

- [ ] **Step 3: Check the Netlify plan**

In the Netlify dashboard, confirm whether the account is on the **credit model** (300 credits/month) or a **legacy plan** (separate build minutes). Record which.

- [ ] **Step 4: Write the answers into the spec**

Update the Rischi table in `docs/superpowers/specs/2026-07-15-eu-price-observatory-design.md`, replacing each "non verificato" with the verified fact and the date. Commit.

**Only when Steps 1–4 are done do Tasks 2+ become writable.** Tasks 2–4 below are safe to implement now (they touch no eBay data); Tasks 5+ are deliberately left as intent, not code.

---

### Task 2: Prisma models + prune boundary

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `src/lib/__tests__/observatory.schema.test.ts`

**Interfaces:**
- Produces: models `EbayObservation` and `PriceReference` exactly as in the spec's Architettura section, plus the generated Prisma client types.

Independent of eBay: these tables model *our* data, not theirs.

- [ ] **Step 1: Add both models to `prisma/schema.prisma`**

Copy the two `model` blocks verbatim from the spec (`EbayObservation`, `PriceReference`), including `@@unique([ebayItemId, marketplace])`, `@@index([productKey, lang, lastSeenAt])`, and `@@unique([productKey, lang, day])`.

The `lang` on both is the **product's** language (IT/EN/JA), never the marketplace's.

- [ ] **Step 2: Regenerate and typecheck**

```bash
npx prisma generate
npx tsc --noEmit   # expected: clean
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma src/generated
git commit -m "feat(observatory): EbayObservation and PriceReference models"
```

---

### Task 3: The matcher (`src/lib/observatory/matchListing.ts`)

**Files:**
- Create: `src/lib/observatory/matchListing.ts`, `src/lib/observatory/__tests__/matchListing.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery`, `translateSealedQuery`, `queryTokens` from `@/lib/pricing/sealedGlossary` (already built and live-verified).
- Produces:
  - `type ListingMatch = { ok: boolean; lang: string | null; confidence: number; reason: string }`
  - `matchListing(title: string, product: { name: string; lang: string }, marketplace: 'EBAY_IT' | 'EBAY_DE'): ListingMatch`

This is pure string logic. It needs no eBay access and is the highest-risk part of the project, so it is built and tested first.

**Rules (from the spec):**
- Reject if the title contains any exclusion: `pokemon center` / `pokémon center`, `vuota`/`vuoto`/`empty`/`solo scatola`/`nur box`, `proxy`/`custom`/`repack`/`fake`, `lotto`/`stock`.
- Detect the **product** language: `ITA`/`italiano` → IT; `ENG`/`English`/`Englisch` → EN; `JAP`/`giapponese`/`japanese` → JA; `DE`/`Deutsch`/`tedesco` → DE.
- **No marker → the marketplace's default language**: `EBAY_IT` → IT, `EBAY_DE` → DE. A German seller listing a German product does not write the language; it is obvious to him.
- Reject when the detected language is DE, or when it differs from `product.lang`.
- Require every token of the (glossary-translated) product name to appear.
- `reason` explains the rejection — it is what makes a bad matcher debuggable.

- [ ] **Step 1: Write the failing test** — `src/lib/observatory/__tests__/matchListing.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { matchListing } from '@/lib/observatory/matchListing'

const etbEn = { name: 'Destined Rivals Elite Trainer Box', lang: 'EN' }
const etbIt = { name: 'Destined Rivals Elite Trainer Box', lang: 'IT' }

describe('exclusions — these are what keep the median honest', () => {
  it('rejects an EMPTY box, which would otherwise say an ETB is worth 15 euro', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box VUOTA scatola da collezione', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('empty')
  })
  it('rejects the Pokemon Center exclusive, a different product at up to 3x', () => {
    expect(matchListing('Destined Rivals Pokemon Center Elite Trainer Box', etbEn, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects a multi-item lot, whose price is not per unit', () => {
    expect(matchListing('LOTTO 3x Destined Rivals Elite Trainer Box', etbIt, 'EBAY_IT').ok).toBe(false)
  })
})

describe('product language is not the marketplace language', () => {
  it('accepts an Italian product on the Italian site with no marker', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('IT')
  })
  it('rejects an unmarked listing on the German site: no marker there means German', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box neu original verpackt', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(false)
    expect(r.lang).toBe('DE')
  })
  it('accepts an explicitly English product on the German site — this is why .de adds volume', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box ENGLISCH neu', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('EN')
  })
  it('rejects an explicitly German product even on the Italian site', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box DEUTSCH', etbEn, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects an English product when the item owned is Italian', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENG sealed', etbIt, 'EBAY_IT').ok).toBe(false)
  })
})

describe('an Italian query still has to find the English product name', () => {
  it('accepts the Italian phrasing via the glossary', () => {
    const r = matchListing('Pokemon Collezione Allenatore Elite Rivali Predestinati ITA', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(true)
  })
})

describe('unrelated titles', () => {
  it('rejects a different product', () => {
    expect(matchListing('Pokemon 151 Booster Bundle ITA', etbIt, 'EBAY_IT').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test -- matchListing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `matchListing.ts` to satisfy exactly those cases.** Reuse the glossary; do not write a second normaliser (this repo already shipped a bug where two normalisers disagreed about `&` and silently returned zero results for every set with an ampersand).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/observatory/
git commit -m "feat(observatory): listing title matcher with language and exclusion rules"
```

- [ ] **Step 6: ⚠️ Reality check — REQUIRED before this task counts as done**

The tests above use titles **I invented**. That is exactly the failure mode this repo already paid for three times. Take **20 real eBay titles** from a live search for a sealed product (the user can paste them, or use the Task 1 sample), run them through `matchListing`, and paste the verdicts into the report. Any false accept is a bug; a false reject is acceptable. If the invented tests pass but real titles do not, **the tests are wrong, not the titles**.

---

### Task 4: Reference maths (`src/lib/observatory/reference.ts`)

**Files:**
- Create: `src/lib/observatory/reference.ts`, `src/lib/observatory/__tests__/reference.test.ts`

**Interfaces:**
- Produces:
  - `computeDailyReference(obs: { priceEur: number; confirmedSale: boolean; quickSale: boolean }[]): { medianEur: number | null; sampleSize: number; confirmedSales: number; quickSales: number }`
  - `computeStrength(history: { confirmedSales: number; quickSales: number }[], todaySample: number): 'STRONG' | 'WEAK' | 'NONE'`
  - `displayValue(history: { medianEur: number | null; sampleSize: number }[]): number | null`

Pure maths, no DB and no eBay. Encodes the spec's "what is computed on what":
- `computeStrength` reads the **permanent history** (up to 90 rows), never raw observations — the raw is pruned at 30 days, so a 90-day question cannot be asked of it.
- `STRONG` → `SUM(confirmedSales + quickSales) >= 3` over the history **and** `todaySample >= 3`.
- `WEAK` → observations exist but the above is unmet.
- `NONE` → `todaySample === 0`.
- `displayValue` → median of the last 14 daily `medianEur` where `sampleSize > 0`; `null` if none. A single day with 2 listings must not swing the number.

- [ ] **Step 1: Write the failing test** covering: even/odd medians; `NONE` on an empty day; `WEAK` when there are listings but no sales; `STRONG` at exactly 3 sales with a sample of 3; that `computeStrength` ignores days outside the 90-row window; that `displayValue` skips empty days and returns null when every day is empty.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/observatory/
git commit -m "feat(observatory): daily reference, strength and display-value maths"
```

---

### Task 5: eBay client — ⛔ DO NOT WRITE UNTIL TASK 1 IS DONE

**Files (intended):** `src/lib/observatory/ebay.ts` + tests.

**Why there is no code here:** the request shape, the auth flow, the response fields and the availability field are all unverified. Writing them now would be fabrication.

**Once Task 1 Step 2 has produced `docs/reference/ebay-browse-sample.json`, this task must:**
- Build the client from the **real** sample, mirroring `src/lib/pricing/tcgdex.ts`: `getJson` helper, errors swallowed to `null`, module-scope token cache, a `__reset*` export for tests.
- Fixtures must be **copied from the real sample**, never invented.
- Handle OAuth application-token acquisition + refresh.
- Expose: `searchSealed(query: string, marketplace: 'EBAY_IT' | 'EBAY_DE'): Promise<EbayListing[]>` where `EbayListing` carries id, title, priceEur, currency, and available quantity **if and only if** Task 1 confirmed it is in the search response.
- Convert to EUR with the existing `getUsdToEurRate()` only if a marketplace returns non-EUR; `EBAY_IT`/`EBAY_DE` should be EUR natively — **confirm from the sample rather than assuming.**

---

### Task 6: The daily job — ⛔ DEPENDS ON TASK 5

**Files (intended):** `netlify/functions/observatory-daily.mts`, `src/lib/observatory/run.ts` + tests.

**Intended behaviour:**
- Watchlist: `SELECT DISTINCT externalId, language FROM Item WHERE itemType = 'SEALED' AND externalId LIKE 'tcgcsv:%'`.
- For each (product, lang): search both marketplaces, `matchListing` each result, drop rejects.
- Upsert observations by `(ebayItemId, marketplace)`: update `lastSeenAt`; **if quantity decreased since the last run → a confirmed sale at that price**.
- Set `goneAt` on listings not seen this run; a listing gone within 48h of `firstSeenAt` is a `quickSale`.
- Recompute today's `PriceReference` per (product, lang).
- **Prune `EbayObservation` older than 30 days** — this is what keeps Neon's 0.5 GB and the retention rule satisfied. It is not optional.
- **Respect the 30s timeout**: bound concurrency and, if the watchlist cannot be covered in one run, process it in slices across days (record the cursor) rather than overrunning.

`netlify.toml` gains a `[functions."observatory-daily"] schedule = "@daily"`.

---

### Task 7: Surface the reference in the UI — ⛔ DEPENDS ON TASK 6

**Files (intended):** `src/lib/priceSource.ts`, `src/components/PriceSourceChip.tsx`, `src/lib/i18n.ts`, the collection/dashboard read paths.

**Intended behaviour:**
- `PriceSourceKind` gains `'euReference'`. It outranks `'estimate'` **only when `strength === 'STRONG'`** (the user's explicit decision); otherwise the US estimate stays, labelled as today.
- The chip states its own footing rather than just printing a number:
  - `Riferimento EU €95,00 · 12 osservazioni · 3 vendite confermate` (STRONG, green solid)
  - `Riferimento EU ~€95,00 · 4 osservazioni, nessuna vendita confermata — dato debole` (WEAK, amber dashed)
  - `NONE` → falls through to the existing US-estimate chip.
- The item's effective value (and therefore the collection balance) uses the EU reference when STRONG.
- Keys in BOTH `it` and `en`.

---

## Self-Review

**Spec coverage:** roll-up models → Task 2. Matcher incl. language/exclusion rules → Task 3. Strength/median maths and the 30-vs-90-day boundary → Task 4. eBay client → Task 5 (gated). Daily job, quantity-drop signal, pruning, 30s limit → Task 6 (gated). `euReference` chip + STRONG-only substitution → Task 7 (gated). Costs → Global Constraints + Task 1 Step 3. ✓

**Placeholder scan:** Tasks 5–7 are intentionally intent-only, and say why. That is not a "TBD" — it is the plan refusing to invent an API contract nobody has read. Tasks 1–4 are fully specified and implementable today.

**Type consistency:** `matchListing` returns `lang` which Task 6 writes to `EbayObservation.lang`; `computeDailyReference`'s output fields are exactly `PriceReference`'s columns; `computeStrength` consumes the history rows Task 6 persists. `PriceSourceKind` extends the enum shipped in `src/lib/priceSource.ts` rather than redefining it.

**Scope check:** Tasks 1–4 are a coherent, shippable first slice (schema + the two pure-logic cores, both testable with no network). Tasks 5–7 should be re-planned as their own document once Task 1 returns facts.
