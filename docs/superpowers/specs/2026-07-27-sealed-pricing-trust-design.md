# Trustworthy sealed pricing (F-core) — design

**Date:** 2026-07-27
**Status:** approved (brainstorming; Gabriele granted blanket permission while AFK)
**Scope:** Sub-project F-core of the "Collectr, done better" arc. Fixes the wrong-low collection value
diagnosed 2026-07-23 (see [[tcg-archive-observatory-wrong-lows]]). F-cardmarket (assisted Cardmarket
capture for products Cardtrader can't map) is a separate later spec.

## Problem (root cause, evidence-backed)

The collection value drifted DOWN because the **eBay observatory** produces confidently-wrong LOW
references that flip **STRONG** and OVERRIDE the value via `effectiveValue`. Confirmed against
Cardmarket: Pokémon GO Elite Trainer Box shows **€10,70** in the app vs **€97,00** "from" on
Cardmarket. Mechanism: the observatory's eBay title-matcher false-accepts cheap non-product listings
(empty ETB shells €0,40, acrylic cases €0,02, code cards €0,02); a thin sample dominated by these
lands a low median, and because those accessories genuinely sell fast, the quick/confirmed-sale signal
flips the reference STRONG — at which point it moves the balance. This is the exact failure mode pinned
as a hard risk in [[tcg-archive-observatory-resume]]; its only containment was the STRONG gate, and the
garbage clears that gate.

A secondary weakness: even the Cardtrader path takes the **absolute minimum** listing, which is often an
outlier (a foreign/mispriced/damaged listing) — the risk the 2B final review flagged.

## Design

### 1. The observatory stops moving the balance — it becomes informational only

`effectiveValue` no longer substitutes the observatory `euReference`. It returns `marketValue`
unconditionally. The whole STRONG/WEAK-override mechanism leaves the money path — which is precisely the
bug. The observatory keeps running (still cheap, still building `PriceReference`); its number is retained
only as a **secondary, muted "for reference" line** on the chip ("Osservatorio eBay: ~€X"), never the
primary chip and never the value.

`priceSourceOf` therefore stops returning `kind: 'euReference'` as the primary source; the primary chip
becomes the real source of the stored value — `cardtrader` / `estimate` (eBay) / `cardmarket` (raw
cards) / `manual` / `none`. The `euReference` datum is passed through for the optional secondary line.

Immediate effect: English-named sealed items (Pokémon GO ETB, Pitch Black, Paldean Fates ETB, …) already
have a Cardtrader value stored — the STRONG override was merely masking it — so they revert to a correct
value the moment this ships. No migration; `effectiveValue`/`priceSourceOf` are used by the dashboard,
the collection, the snapshot builder and the chart, so all money paths correct together.

### 2. Cardtrader uses a robust low estimate, not the absolute minimum

`lowestSealedEur` (in `src/lib/pricing/cardtrader.ts`) replaces `min(prices)` with a **trimmed minimum**:

1. Filter as today (EUR, `bundle_size == null || <= 1`, `!graded`, `!on_vacation`, matching
   `pokemon_language`). Call the result `prices`.
2. If `prices.length === 0` → `{ eur: null, sampleSize: 0 }`.
3. If `prices.length < MIN_FOR_TRIM` (**3**) → return `min(prices)` — too few listings for a median to
   mean anything; nothing to trim against.
4. Else: `median = median(prices)`; `floor = median × FLOOR_FRACTION` (**0.6**); `kept = prices ≥ floor`;
   return `{ eur: min(kept), sampleSize: kept.length }`. `kept` is never empty (the median itself
   clears its own floor).

Rationale: a listing below 60 % of the median is not the same product at the same grade — it is a
mispriced/damaged/foreign outlier. Trimming it and taking the min of the rest yields the honest "lowest
price you would actually pay", close to Cardmarket's "from". Both constants are named, commented, and
unit-tested. (This is a *floor* against low outliers only — not the symmetric outlier fence the
observatory memory rightly warns was wrong; the median's own robustness handles the high side.)

### 3. Remapping existing items — mostly automatic

No dedicated remap code. The refresh route already resolves a blueprint for a sealed item that lacks one
and persists it, storing the Cardtrader value. So once §1 stops the override, a **forced price refresh**
re-prices every AUTO sealed item through the robust Cardtrader path: English-named items map and get a
robust Cardtrader value; Italian-named items that don't resolve fall back to the eBay estimate or stay
manual (F-cardmarket will cover those). The forced refresh is a post-deploy step, not code.

## Non-goals (YAGNI)

- No Cardmarket integration — that is F-cardmarket.
- No change to the observatory job itself (it keeps collecting; it just no longer moves money).
- No DB migration (the needed columns exist; nothing is added or removed).
- No symmetric outlier trimming (only a low-side floor, deliberately — see §2).
- No re-pricing of raw cards (TCGdex/Cardmarket-for-singles is untouched).
- No deletion/backfill of historical snapshots (immutable; they correct going forward).

## Affected files

- `src/lib/priceSource.ts` — `effectiveValue` drops the euReference substitution; `priceSourceOf` stops
  returning `euReference` as the primary kind (keeps the datum for the secondary line).
- `src/components/PriceSourceChip.tsx` — render the observatory number as a secondary muted line instead
  of the primary chip.
- `src/lib/pricing/cardtrader.ts` — `lowestSealedEur` becomes the trimmed minimum.
- Tests for both pure changes.

## Verification

- Unit: `effectiveValue` returns `marketValue` even when a STRONG euReference is present (regression pin
  for the exact bug); `lowestSealedEur` trims a low outlier (`[58,120,125,130,140]` → 120, not 58),
  leaves a tight distribution alone, and returns the plain min below `MIN_FOR_TRIM`.
- Live (post-deploy): Pokémon GO ETB no longer shows €10,70; the collection total rises back toward the
  real value; the observatory number, where shown, is a secondary line, not the value. Then a forced
  refresh maps the English-named items onto robust Cardtrader values.
