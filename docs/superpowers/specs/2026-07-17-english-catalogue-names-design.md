# English catalogue names for sealed products — design

**Date:** 2026-07-17
**Status:** approved (brainstorming)
**Scope:** Phase 2, sub-project A. Sub-project B (Cardtrader as a second price source) is a separate spec.

## Problem

Sealed items display the **Italian eBay search term** as their name (e.g. "ETB destino di
paldea") instead of the English catalogue name Gabriele wants to see (e.g. "Paldean Fates
Elite Trainer Box").

This is not cosmetic laziness — it is a real constraint. `name` currently does double duty:

1. **Display** — what the user reads in the list / collection.
2. **eBay query** — the string passed to the observatory's `searchSealed` / `matchListing`.
   English catalogue names have poor recall on eBay IT (validated earlier: "Paldean Fates
   ETB" → €464 wrong vs "ETB destino di paldea" → €140 right), so `name` is forced to hold
   the Italian term.

The English catalogue name **is already available** at pick time (`SealedSearchResult.name`
from tcgcsv, which the user even sees in the search list) but `handlePickSealed`
(`ItemFormModal.tsx:297`) discards it in favour of the typed Italian query. To show English
while searching Italian we must store **both**.

## Design

### 1. Data model — split `name` / `priceQuery`

Add one nullable column to `Item`:

```prisma
priceQuery  String?   // Italian "type + set" term used for eBay recall; null = use name
```

- **`name`** becomes the **English catalogue name** (`r.name` from tcgcsv, verbatim as the
  user picked it — still editable in the modal name field).
- **`priceQuery`** holds the **Italian** eBay search term. Internal to pricing; not shown in
  the UI.

The column is nullable → an **additive, non-destructive migration** (no repeat of the
`User.email` NULL blocker). No data backfill.

**The golden rule at every eBay search site: `priceQuery ?? name`.** Old items (Italian in
`name`, `priceQuery = null`) keep working via the fallback; new items use `priceQuery`.

### 2. Threading — the three eBay-query sites

1. **`PriceInput`** (`src/lib/pricing/types.ts`): add `priceQuery?: string | null`.
   `TcgcsvProvider.fetchPrice` (`tcgcsvProvider.ts`) passes `i.priceQuery ?? i.name` to
   `liveEbayEstimate`.
2. **Observatory watchlist** (`src/lib/observatory/store.ts:23-53`): `select` also
   `priceQuery`; map `name: i.priceQuery ?? i.name`. `WatchlistItem.name` stays "the eBay
   query", `productKey` stays `externalId`.
3. **Estimate endpoint + modal**:
   - `handlePickSealed` (`ItemFormModal.tsx`) stores `name: r.name` (English) **and**
     `priceQuery: query` (Italian), and calls `/api/sealed/estimate` with the Italian
     `priceQuery`.
   - The item create/update payload + API route + Prisma write carry `priceQuery`.

`productKey` stays `externalId` (`tcgcsv:groupId:productId`), so **already-collected
`PriceReference` history is not invalidated** by the rename.

### 3. Existing items

No data migration. Existing items keep their Italian `name` and `priceQuery = null`; the
`priceQuery ?? name` fallback makes them behave exactly as today. A user who wants the
English name re-picks the product from search (which overwrites `name` + sets `priceQuery`).
No automatic backfill (YAGNI).

### 4. UX

`priceQuery` stays **internal** — not rendered or editable in the modal. The modal stays
clean. Trade-off accepted: if a specific product has poor eBay recall it can't be hand-tuned,
but that is rare and the value simply stays MANUAL (never a wrong number).

## Non-goals

- Cardtrader / second price source (separate spec, sub-project B).
- Translating set names in the glossary (the glossary translates product *types* only; this
  design sidesteps that by storing the picked English name verbatim rather than deriving it).
- Making `priceQuery` visible/editable, or backfilling English names onto existing items.

## Affected files

- `prisma/schema.prisma` — add `Item.priceQuery`.
- `src/lib/pricing/types.ts` — add `priceQuery` to `PriceInput`.
- `src/lib/pricing/tcgcsvProvider.ts` — use `priceQuery ?? name`.
- `src/lib/observatory/store.ts` — select + map `priceQuery` in `watchlist()`.
- `src/components/ItemFormModal.tsx` — store both names on pick; thread `priceQuery` through
  the save payload and estimate call.
- The item create/update API route + any item-write helper that maps the payload to Prisma.
- Whatever assembles `PriceInput` for the refresh flow (`/api/prices/refresh`).

## Verification

- Unit: `priceQuery ?? name` fallback in provider + watchlist (old item → Italian name used;
  new item → priceQuery used).
- Live (per the mock-vs-live lesson): add a sealed product, confirm the list shows the English
  name, the estimate still resolves (using the Italian priceQuery), and an existing pre-migration
  item still prices correctly.
- Prisma migration applies cleanly against a NULL-tolerant additive column.
