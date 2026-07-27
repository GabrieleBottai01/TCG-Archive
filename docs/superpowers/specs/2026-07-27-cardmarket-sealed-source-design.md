# F-cardmarket — automatic Cardmarket source for sealed products

**Date:** 2026-07-27
**Arc:** "Collectr, done better" → sub-project **F-cardmarket** (follows F-core, merged `281be12`).
**Repo:** `GabrieleBottai01/TCG-Archive` only.

## Problem

F-core fixed the observatory dragging values down and made Cardtrader a robust
primary. But a few sealed products **do not map to any Cardtrader blueprint** and
fall through to the eBay median, which for some is confidently too low.

Confirmed live: **Pokémon GO Elite Trainer Box → €39,58 (eBay) vs €97 on
Cardmarket.** These products need a trustworthy EU source Cardtrader can't give.

## Decision: use Cardmarket's public download files

Cardmarket **no longer accepts new API applications**. Instead it publishes the
**Price Guide + Product Catalogue as public files**, updated daily, no key, no
login, hosted on S3 (so no Cloudflare gate). This was verified live during
brainstorming:

- Pokémon game id = **6**.
- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
  (~15 MB, 76 584 entries). Fields per entry: `idProduct, idCategory, avg, low,
  trend, avg1, avg7, avg30` (+ `-holo` variants, unused for sealed).
- Sealed catalogue: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json`
  (~1 MB, 4 998 products). Fields: `idProduct, name, idCategory, categoryName,
  idExpansion, idMetacard, dateAdded`.
- End-to-end proof, real data: `Pokémon GO Elite Trainer Box` → idProduct
  **653700** → `low 97, avg 114, trend 103`.

Both URLs returned **200 with a browser User-Agent, no auth**. The `www.cardmarket.com`
HTML pages return 403 to bots, but the S3 file URLs do not — the automation only
ever touches S3.

### Why `trend`, not `low`

The `low` field is outlier-prone — the exact failure mode that burned the project
(observatory "confidently-wrong lows"). Real examples from the same file:

- idProduct 271440 → `low: 19000`, `avg: 2103`, `trend: 2239` (low is 9× the avg — a junk listing).
- idProduct 690879 (ETB Case) → `low: 1300`, `avg: 750`, `trend: 690`.

`trend`/`avg` stay sane where `low` explodes. For the target case, `trend` = €103 ≈
the €97 Gabriele expected. **The Cardmarket value is `trend`, falling back to `avg`,
then `low`** (first non-null). `low` is only ever used for a product so illiquid it
has no trend and no average — the weakest, last-resort case.

## Architecture

### New client — `src/lib/pricing/cardmarket.ts` (mirrors `cardtrader.ts`)

- `cardmarketEnabled(): boolean` → always `true` (no env/key required).
- `getNonsinglesCatalogue(): Promise<CmProduct[]>` → fetch `products_nonsingles_6.json`,
  in-module cache, 24h TTL.
- `getPriceGuide(): Promise<Map<number, CmPriceGuide>>` → fetch `price_guide_6.json`,
  parse into an `idProduct → {avg, low, trend}` map, 24h TTL, **single-flight**: one
  shared in-flight promise so the refresh worker pool (≤5) triggers at most one 15 MB
  download, not five.
- `resolveCardmarketProductId(englishName): number | null` — **pure**, reusing
  `sealedGlossary` (`normalizeQuery`, `extractProductType`):
  1. normalize the English catalogue name;
  2. product-type is a **hard filter** when present (ETB ≠ Booster Box ≠ Tin);
  3. among survivors, score `overlap(nameTokens, productTokens) − extraProductTokens`
     (same scoring that makes plain "Elite Trainer Box" beat sibling SKUs
     "… Center ETB Plus" / "… ETB Case" on Cardtrader);
  4. best score wins **only if ≥ a minimum threshold** (tuned against the live-check
     set); otherwise `null` (no confident match → fall through, never guess).
- `cardmarketSealedEur(productId): number | null` → `trend ?? avg ?? low ?? null`.
- `__resetCardmarketCache()` for tests.

Types: `CmProduct = { idProduct, name, idCategory, categoryName, idExpansion }`,
`CmPriceGuide = { idProduct, avg, low, trend }`.

### Chain — `src/lib/pricing/sealedPrice.ts`

Insert Cardmarket between Cardtrader and eBay:

```
Cardtrader (blueprint) — if a EUR listing exists → return origin 'cardtrader'
   ↓ (null / unmapped / error)
Cardmarket (productId via stored id or resolver; trend→avg→low) → return origin 'cardmarket'
   ↓ (null / no confident match / error)
eBay median (priceQuery ?? name) → return origin 'ebay'
```

- If `i.cardmarketProductId` is set, use it directly (skip resolution); else resolve
  from `i.name`.
- Every S3 fetch is wrapped in `try/catch`; any failure falls through to the next
  source. Cardmarket **never** throws out of `sealedPrice` (same contract as
  Cardtrader today).

### Data

- **Prisma** (`prisma/schema.prisma`): add `Item.cardmarketProductId Int?` (twin of
  `cardtraderBlueprintId`). Migration + regenerate the Prisma client under
  `src/generated/prisma`.
- **Types** (`src/lib/pricing/types.ts`): add `cardmarketProductId?: number | null`
  to `PriceInput` and `PriceResult`; add `'cardmarket'` to the `origin` union.
- **itemSchema** (`src/lib/itemSchema.ts`): add
  `cardmarketProductId: z.number().int().optional().nullable()`. It flows to
  create/update automatically via the existing `...d` spread in the item routes.

### UI / source attribution

- `src/lib/priceSource.ts`: in `priceSourceOf`, a SEALED item with
  `autoPriceSource === 'cardmarket'` → `kind: 'cardmarket'`. The chip label keys
  (`src_cardmarket`) and modal price line (`f_priceCardmarket`) **already exist** in
  `i18n.ts` (IT + EN).
- `src/app/api/sealed/estimate/route.ts`: include `cardmarketProductId` in the JSON
  (alongside `cardtraderBlueprintId`); `sealedPrice` already yields the origin.
- `src/components/ItemFormModal.tsx`: the existing `showCardmarket` branch now also
  fires for sealed; `handlePickSealed` stores `cardmarketProductId`; the submit
  payload carries it.
- `src/app/api/prices/refresh/route.ts`: already routes through `sealedPrice`, so
  Cardmarket is covered; persist `cardmarketProductId` on update exactly as it
  persists a newly-resolved `cardtraderBlueprintId`.

## Trust & error handling (the project's scar)

- **`trend`, not `low`** — avoids the outlier-low failure mode.
- Every S3 fetch `try/catch` → graceful fall-through to eBay; no throw breaks a refresh.
- **Mandatory live-check** (the "never trust mocked tests for `src/lib/pricing`"
  lesson): a script that hits the real S3 files and asserts
  `Pokémon GO ETB → ~€103` plus 2–3 more owned products, run before merge and again
  after deploy.

## Testing

- Pure unit tests on `resolveCardmarketProductId` (correct match; sibling SKUs not
  confused — ETB vs "ETB Plus"/"ETB Case"; no-match → null) and `cardmarketSealedEur`
  (`trend→avg→low`; all null → null), using fixtures trimmed from the real S3 files.
- Chain tests on `sealedPrice`: Cardtrader null → Cardmarket wins; Cardmarket null →
  eBay; Cardmarket throws → eBay (no crash).
- **Full test suite before merge** — F-core's scar: changes touching shared pricing
  functions must run the whole suite, never a focused subset (that hid 3 stale tests).

## Scope guards

- Cardmarket only fills the gap **after Cardtrader yields nothing**. Products
  Cardtrader already prices correctly are untouched (no re-anchoring of good values).
- **Known limitation:** catalogue names are English (Phase 2A), so we map the English
  Cardmarket product. Italian/Japanese-language sealed are separate `idProduct`s and
  are out of scope here — consistent with the current Cardtrader/tcgcsv English-name
  approach.

## Out of scope

- Backfilling `cardmarketProductId` for existing items: they resolve lazily on the
  next refresh / modal open, like `cardtraderBlueprintId` did.
- A Cardmarket expansions file / idExpansion→name mapping: resolution scans the 4 998
  nonsingles names directly; no expansions file needed.
- Any manual per-item entry (explicitly rejected by Gabriele: must be automatic).
