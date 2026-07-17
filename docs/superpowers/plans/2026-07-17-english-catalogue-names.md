# English Catalogue Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the English catalogue name for sealed products while still searching eBay with the Italian term, by splitting the two roles of `Item.name` into `name` (English, displayed) + a new `priceQuery` (Italian, internal).

**Architecture:** Add one nullable `Item.priceQuery` column. Everywhere eBay is searched (`TcgcsvProvider`, the refresh route, the observatory watchlist, the estimate call) uses `priceQuery ?? name`, so pre-migration items (Italian in `name`, `priceQuery = null`) keep working unchanged and new items store English `name` + Italian `priceQuery`. `productKey` stays `externalId`, so existing `PriceReference` history is not invalidated.

**Tech Stack:** Next.js (see `AGENTS.md` — read `node_modules/next/dist/docs/` before touching framework APIs), Prisma (`prisma-client` generator → `src/generated/prisma`), Zod, Vitest, React.

## Global Constraints

- **Golden rule at every eBay-search site:** use `priceQuery ?? name` — never `name` alone. Sites: `TcgcsvProvider.fetchPrice`, `/api/prices/refresh` PriceInput, `observatory/store.ts` `watchlist()`, and the modal's `/api/sealed/estimate` call.
- `priceQuery` is **nullable** and **internal** — never rendered or editable in the UI.
- No data backfill; no migration of existing rows.
- `productKey` in the observatory stays `externalId` (`tcgcsv:groupId:productId`) — do not change it.
- Prisma client lives at `src/generated/prisma`; regenerate with `npx prisma generate` after any schema edit.
- Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`.
- Spec: `docs/superpowers/specs/2026-07-17-english-catalogue-names-design.md`.
- Per memory `tcg-archive-mock-vs-live`: green unit tests for `src/lib/pricing/` do NOT prove behaviour — Task 4 ends with a real live check.

---

### Task 1: Data model — `priceQuery` column, Zod field, DTO field

**Files:**
- Modify: `prisma/schema.prisma` (Item model, after `externalId` on line 103)
- Modify: `src/lib/itemSchema.ts:10` (add after `externalId`)
- Modify: `src/components/CollectionView.tsx:26` (PlainItem, after `externalId`)

**Interfaces:**
- Produces: `Item.priceQuery: string | null` (Prisma), `itemInputSchema` accepts optional nullable `priceQuery`, `PlainItem.priceQuery: string | null`.

- [ ] **Step 1: Add the column to the Prisma schema**

In `prisma/schema.prisma`, in `model Item`, immediately after the `externalId` line, add:

```prisma
  priceQuery           String?         // Italian "type + set" term for eBay recall; null = use name
```

- [ ] **Step 2: Regenerate the Prisma client and push to the local dev DB**

Run: `npx prisma generate && npx prisma db push`
Expected: `generate` prints "Generated Prisma Client"; `db push` prints "Your database is now in sync with your Prisma schema" (adds a nullable column — no data loss prompt).

- [ ] **Step 3: Add `priceQuery` to the Zod input schema**

In `src/lib/itemSchema.ts`, add after the `externalId` line (line 10):

```typescript
  priceQuery: z.string().optional().nullable(),
```

- [ ] **Step 4: Add `priceQuery` to the PlainItem DTO**

In `src/components/CollectionView.tsx`, in `export type PlainItem`, add after the `externalId` line (line 26):

```typescript
  priceQuery: string | null
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the new field is optional/nullable everywhere, so nothing breaks yet).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/itemSchema.ts src/components/CollectionView.tsx
git commit -m "feat(pricing): add Item.priceQuery column, Zod field, DTO field"
```

---

### Task 2: Server pricing path — `PriceInput.priceQuery` + provider fallback + refresh route

**Files:**
- Modify: `src/lib/pricing/types.ts` (PriceInput)
- Modify: `src/lib/pricing/tcgcsvProvider.ts:21`
- Modify: `src/app/api/prices/refresh/route.ts:39-44` (the `input` object)
- Create: `src/lib/pricing/__tests__/tcgcsvProvider.test.ts`

**Interfaces:**
- Consumes: `Item.priceQuery` (Task 1); `liveEbayEstimate(name: string, lang: string)` from `@/lib/pricing/ebayEstimate`.
- Produces: `PriceInput.priceQuery?: string | null`; `TcgcsvProvider.fetchPrice` calls `liveEbayEstimate(i.priceQuery ?? i.name, ...)`.

- [ ] **Step 1: Add `priceQuery` to `PriceInput`**

In `src/lib/pricing/types.ts`, inside `PriceInput`, add after the `name` field (line 8):

```typescript
  // The Italian eBay term when the display name is the English catalogue name.
  // Every eBay-search site uses `priceQuery ?? name`; null falls back to name.
  priceQuery?: string | null
```

- [ ] **Step 2: Write the failing test for provider query routing**

Create `src/lib/pricing/__tests__/tcgcsvProvider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spy on the eBay call so the test asserts WHICH query the provider passes,
// not any live pricing (which the mock-vs-live memory warns never to trust).
const liveEbayEstimate = vi.fn(async () => ({ eur: 99, sampleSize: 3 }))
vi.mock('@/lib/pricing/ebayEstimate', () => ({ liveEbayEstimate }))

import { TcgcsvProvider } from '@/lib/pricing/tcgcsvProvider'

describe('TcgcsvProvider query routing', () => {
  beforeEach(() => liveEbayEstimate.mockClear())

  it('searches eBay with priceQuery when present', async () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'Paldean Fates Elite Trainer Box', priceQuery: 'ETB destino di paldea', language: 'IT' }
    const r = await new TcgcsvProvider().fetchPrice(i)
    expect(liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
    expect(r).toEqual({ value: 99, source: 'AUTO' })
  })

  it('falls back to name when priceQuery is null (pre-migration item)', async () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'ETB destino di paldea', priceQuery: null, language: 'IT' }
    await new TcgcsvProvider().fetchPrice(i)
    expect(liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/pricing/__tests__/tcgcsvProvider.test.ts`
Expected: FAIL on the first test — the provider currently passes `i.name` ("Paldean Fates Elite Trainer Box"), not `priceQuery`.

- [ ] **Step 4: Make the provider use `priceQuery ?? name`**

In `src/lib/pricing/tcgcsvProvider.ts`, replace the body of `fetchPrice` (lines 18-23) with:

```typescript
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    // The Italian "type + set" term drives eBay recall. New items carry it in
    // priceQuery (name holds the English catalogue name); pre-migration items
    // have it in name with priceQuery null — hence priceQuery ?? name.
    const query = i.priceQuery ?? i.name
    if (!query || !query.trim()) return null
    const est = await liveEbayEstimate(query, i.language ?? 'IT')
    return est.eur != null ? { value: est.eur, source: 'AUTO' } : null
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/pricing/__tests__/tcgcsvProvider.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Pass `priceQuery` from the refresh route**

In `src/app/api/prices/refresh/route.ts`, in the `input` object (lines 39-44), add `priceQuery`:

```typescript
      const input = {
        game: it.game,
        itemType: it.itemType,
        externalId: it.externalId,
        name: it.name,
        priceQuery: it.priceQuery,
        language: it.language,
      }
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (`it.priceQuery` is now a real column from Task 1).

- [ ] **Step 8: Commit**

```bash
git add src/lib/pricing/types.ts src/lib/pricing/tcgcsvProvider.ts src/app/api/prices/refresh/route.ts src/lib/pricing/__tests__/tcgcsvProvider.test.ts
git commit -m "feat(pricing): provider + refresh use priceQuery ?? name for eBay search"
```

---

### Task 3: Observatory watchlist — search with `priceQuery ?? name`

**Files:**
- Modify: `src/lib/observatory/store.ts:23-53` (the `watchlist()` method)

**Interfaces:**
- Consumes: `Item.priceQuery` (Task 1). `WatchlistItem` shape is unchanged — `{ productKey, name, lang }`, where `name` is the eBay query and `productKey` is `externalId`.

Note: `store.ts` is the Prisma adapter and, per the observatory resume memory, is tsc-checked, not unit-tested (it needs a live DB). This task follows that established pattern: verified by `tsc` plus the Task 4 live check, not a new unit test.

- [ ] **Step 1: Select `priceQuery` and map `priceQuery ?? name`**

In `src/lib/observatory/store.ts`, in `watchlist()`:

Change the `select` (line 28) to include `priceQuery`:

```typescript
        select: { externalId: true, language: true, name: true, priceQuery: true },
```

Change the `.filter(...).map(...)` (lines 43-47) to:

```typescript
      return owned
        .filter((i): i is { externalId: string; language: string; name: string; priceQuery: string | null } =>
          i.externalId !== null && i.language !== null,
        )
        // name here is the eBay QUERY: the Italian term (priceQuery) for new
        // items, or the legacy Italian name for pre-migration items.
        .map((i) => ({ productKey: i.externalId, name: i.priceQuery ?? i.name, lang: i.language }))
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the observatory test suite (guard against regressions)**

Run: `npx vitest run src/lib/observatory`
Expected: PASS — the watchlist mapping change does not touch `run.ts` or the pure maths the suite covers.

- [ ] **Step 4: Commit**

```bash
git add src/lib/observatory/store.ts
git commit -m "feat(observatory): watchlist searches eBay with priceQuery ?? name"
```

---

### Task 4: Modal wiring — store English name + Italian priceQuery, then live-verify

**Files:**
- Modify: `src/components/ItemFormModal.tsx` — `FormState` (line 18-35), `seedForm` (line 58-97), `handlePickSealed` (line 292-349), `handleSubmit` payload (line 379-402)

**Interfaces:**
- Consumes: `PlainItem.priceQuery` (Task 1), `SealedSearchResult.name` (English catalogue name), the typed `query` (Italian).
- Produces: item write payloads that carry `priceQuery`; the estimate call keyed on the Italian term.

- [ ] **Step 1: Add `priceQuery` to `FormState`**

In `src/components/ItemFormModal.tsx`, in `type FormState`, add after `externalId: string` (line 25):

```typescript
  priceQuery: string
```

- [ ] **Step 2: Seed `priceQuery` in `seedForm` (both branches)**

In the `if (item)` branch, after `externalId: item.externalId ?? '',` (line 67):

```typescript
      priceQuery: item.priceQuery ?? '',
```

In the default (new-item) branch, after `externalId: '',` (line 86):

```typescript
      priceQuery: '',
```

- [ ] **Step 3: Store English name + Italian priceQuery on pick**

In `handlePickSealed`, replace the comment + `setForm` block (lines 294-307) with:

```typescript
    // name = the ENGLISH catalogue name (what the user sees); priceQuery = the
    // Italian "type + set" the user typed, which drives eBay recall for the
    // estimate now and the refresh / observatory later.
    const searchName = query || r.name
    const lang = form.language || 'IT'
    setForm((prev) => ({
      ...prev,
      name: r.name,
      priceQuery: query || '',
      imageUrl: r.imageUrl ?? '',
      externalId: r.externalId,
      // Start MANUAL at 0; the eBay estimate below promotes it to AUTO.
      marketValue: 0,
      marketValueSource: 'MANUAL',
    }))
```

(`searchName` — the Italian term — remains what the estimate fetch below uses; only the stored `name` changes to English.)

- [ ] **Step 4: Send `priceQuery` in the save payload**

In `handleSubmit`, in the `payload` object, add after the `externalId` line (line 399):

```typescript
      // Only meaningful for sealed products; null for everything else so an edit clears it.
      priceQuery: autoEligible && form.itemType === 'SEALED' ? (form.priceQuery.trim() || null) : null,
```

- [ ] **Step 5: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItemFormModal.tsx
git commit -m "feat(ui): store English catalogue name + internal Italian priceQuery on pick"
```

- [ ] **Step 7: Live verification (REQUIRED — do not skip; unit green ≠ correct)**

Start the app: `npm run dev`. Then, logged in:

1. **New item shows English, prices via Italian.** Add a sealed product: type an Italian term (e.g. "ETB destino di paldea"), pick the result. Confirm:
   - the saved item's **name reads the English catalogue name** (e.g. "Paldean Fates Elite Trainer Box") in the list/collection;
   - the estimate still resolves to a sane EUR with "· N annunci" (proves the Italian `priceQuery` drove eBay, not the English name).
2. **Pre-migration item still prices.** Take an existing sealed item created before this change (Italian `name`, `priceQuery = null`). Trigger a refresh (`force`) and confirm it still gets an eBay estimate (proves the `priceQuery ?? name` fallback).
3. Note the observed values in the completion report.

- [ ] **Step 8: Commit any fix from live verification** (only if step 7 surfaced a bug)

```bash
git add -A
git commit -m "fix(pricing): <what the live check surfaced>"
```

---

## Notes for the implementer

- **Do NOT push to `main`.** Pushing triggers a Netlify build that consumes Gabriele's credits (memory `tcg-archive-deploy-costs-credits`). Work stays on `feat/english-catalogue-names`; Gabriele decides when to merge/deploy. The prod migration runs as part of that deploy's `prisma db push`.
- The prod `db push` adds a nullable column — no repeat of the `User.email` NULL blocker (that was a required column meeting a NULL row; this column is optional).
- If `npx tsc --noEmit` complains about pre-existing unrelated errors, scope your check to the changed files' imports; do not fix unrelated issues in this plan.
