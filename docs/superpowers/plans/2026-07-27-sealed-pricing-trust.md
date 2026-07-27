# Trustworthy Sealed Pricing (F-core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the eBay observatory from overriding the collection value with confidently-wrong lows, and make the Cardtrader price a robust low estimate instead of the absolute (often-outlier) minimum.

**Architecture:** Two pure, unit-tested changes. (1) `effectiveValue` stops substituting the observatory `euReference` — it always returns the stored `marketValue`; `priceSourceOf`/`PriceSourceChip` demote the observatory number to a muted secondary line. (2) `lowestSealedEur` replaces `min` with a trimmed minimum (drop listings below 60% of the median, then take the min of the rest). No DB migration; the needed fields already exist.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs — see `AGENTS.md`), React, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-sealed-pricing-trust-design.md`.
- **The observatory `euReference` must NEVER move the balance again.** `effectiveValue` returns `marketValue` unconditionally. This is the exact bug (a STRONG ref of €10,70 for a €97 product). Keep a regression test that pins it.
- The observatory number stays visible only as a **muted, hedged secondary line** (never the primary chip, never the value). The observatory job itself is untouched — it keeps collecting.
- Robust Cardtrader = **trimmed minimum**: drop listings below `FLOOR_FRACTION` (**0.6**) × median, then take the min of the rest; below `MIN_FOR_TRIM` (**3**) listings, take the plain min. Low-side floor ONLY — do NOT add a symmetric high-side fence (the observatory memory proved that wrong).
- No DB migration. No change to the observatory nightly job. No re-pricing of raw cards.
- Theme token classes only; no hard-coded colours. Test runner `npx vitest run <file>`; type check `npx tsc --noEmit`; lint `npx eslint .` must stay 0/0; build `npm run build`.
- Do NOT push. Work stays on `feat/sealed-pricing-trust`.

---

### Task 1: The observatory becomes informational — it no longer moves the value

**Files:**
- Modify: `src/lib/priceSource.ts` (`effectiveValue`, `priceSourceOf`, remove the now-dead `hasShowableEuReference` helper)
- Modify: `src/components/PriceSourceChip.tsx` (drop the euReference primary block; add a muted secondary line)
- Modify: `src/lib/__tests__/priceSource.test.ts` (append regression tests)

**Interfaces:**
- `effectiveValue(i)` keeps its signature but returns `i.marketValue` always.
- `priceSourceOf(i)` never returns `kind: 'euReference'`; sealed AUTO tcgcsv → `'cardtrader'` (when `autoPriceSource==='cardtrader'`) else `'estimate'`; raw AUTO non-tcgcsv → `'cardmarket'`; else `'manual'`/`'none'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/priceSource.test.ts`:

```typescript
import { effectiveValue } from '@/lib/priceSource'

describe('effectiveValue — observatory no longer overrides (F-core bug fix)', () => {
  const strongRef = { strength: 'STRONG' as const, displayValue: 10.7, sampleSize: 25, sales: 5 }

  it('returns the stored marketValue even when a STRONG euReference is present', () => {
    // The exact bug: a STRONG €10,70 reference must NOT replace the €97 stored value.
    expect(effectiveValue({ itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 97, euReference: strongRef })).toBe(97)
  })

  it('returns marketValue when there is no reference', () => {
    expect(effectiveValue({ itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 88, euReference: null })).toBe(88)
  })
})

describe('priceSourceOf — observatory is never the primary source', () => {
  const withStrongRef = {
    itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 97, marketValueSource: 'AUTO',
    language: 'IT' as string | null,
    euReference: { strength: 'STRONG' as const, displayValue: 10.7, sampleSize: 25, sales: 5 },
  }
  it('a Cardtrader sealed item with a STRONG euReference is still kind cardtrader, not euReference', () => {
    expect(priceSourceOf({ ...withStrongRef, autoPriceSource: 'cardtrader' }).kind).toBe('cardtrader')
  })
  it('an eBay-sourced sealed item with a STRONG euReference is kind estimate, not euReference', () => {
    expect(priceSourceOf({ ...withStrongRef, autoPriceSource: 'ebay' }).kind).toBe('estimate')
  })
})
```

(Existing tests in this file — `priceSourceOf — Cardtrader` and any prior ones — must keep passing.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/priceSource.test.ts`
Expected: FAIL — the first test currently returns `10.7` (the STRONG override), and the priceSourceOf tests return `'euReference'`.

- [ ] **Step 3: Implement — `effectiveValue`**

In `src/lib/priceSource.ts`, replace the whole body of `effectiveValue` with an unconditional return (keep the JSDoc but update it):

```typescript
export function effectiveValue(i: {
  itemType: string
  externalId?: string | null
  marketValue: number
  euReference?: EuReference | null
}): number {
  // The observatory reference is informational only — it must NEVER move the balance.
  // It produced confidently-wrong lows that flipped STRONG and dragged the value down
  // (a €10,70 STRONG ref for a €97 product); see the F-core spec. The stored
  // marketValue (Cardtrader / eBay estimate / manual) is the value.
  return i.marketValue
}
```

- [ ] **Step 4: Implement — `priceSourceOf`**

Remove the `if (hasShowableEuReference(i)) { … }` block from `priceSourceOf` (the first branch). The function now starts straight at the RAW/cardmarket branch. Then delete the now-unused `hasShowableEuReference` helper function entirely (it is referenced nowhere else). Leave the `euReference` field on `PriceSourceInput` and the `strength` field on `PriceSource` in place (still consumed by the chip / harmless).

- [ ] **Step 5: Implement — the chip's secondary line**

In `src/components/PriceSourceChip.tsx`:

- DELETE the entire `if (source.kind === 'euReference' && item.euReference) { … }` block.
- In the remaining normal render, after the `{langMismatch && (…)}` line and before the closing `</span>`, add a muted, hedged observatory line:

```tsx
      {item.euReference?.displayValue != null && item.euReference.strength !== 'NONE' && (
        <span className="text-[0.65rem] leading-tight text-muted">
          {t('src_euReference')} ~{formatEUR(item.euReference.displayValue)}
        </span>
      )}
```

(`formatEUR` and `t('src_euReference')` are already imported/defined in this file. The tilde makes clear it is never the settled value.)

- [ ] **Step 6: Run tests + gate**

Run: `npx vitest run src/lib/__tests__/priceSource.test.ts` → PASS.
Run: `npx tsc --noEmit && npx eslint .` → no type errors, 0 lint errors/warnings (the removed helper must leave no unused import — if `EuReference` becomes unused anywhere, keep it only where still referenced).

- [ ] **Step 7: Commit**

```bash
git add src/lib/priceSource.ts src/components/PriceSourceChip.tsx src/lib/__tests__/priceSource.test.ts
git commit -m "fix(pricing): observatory is informational only — it no longer overrides the value"
```

---

### Task 2: Cardtrader uses a robust low estimate, not the absolute minimum

**Files:**
- Modify: `src/lib/pricing/cardtrader.ts` (`lowestSealedEur` + two named constants + a small `median` helper)
- Modify: `src/lib/pricing/__tests__/cardtrader.test.ts` (append trimming tests)

**Interfaces:**
- `lowestSealedEur(products, language?)` keeps its signature and return shape `{ eur, sampleSize }`; `sampleSize` becomes the count of KEPT (post-trim) listings.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/pricing/__tests__/cardtrader.test.ts` (the `p` fixture helper already exists in this file — reuse it):

```typescript
describe('lowestSealedEur — robust low estimate (drops low outliers)', () => {
  it('drops a listing below 60% of the median, then takes the min of the rest', () => {
    // median of [58,120,125,130,140] is 125; floor = 75; 58 is dropped → min of the rest is 120.
    const products = [58, 120, 125, 130, 140].map((c) => p({ price: { cents: c * 100, currency: 'EUR' } }))
    expect(lowestSealedEur(products)).toEqual({ eur: 120, sampleSize: 4 })
  })

  it('leaves a tight distribution untouched', () => {
    const products = [120, 122, 125].map((c) => p({ price: { cents: c * 100, currency: 'EUR' } }))
    expect(lowestSealedEur(products)).toEqual({ eur: 120, sampleSize: 3 })
  })

  it('with fewer than 3 listings there is nothing to trim against — takes the plain min', () => {
    const products = [58, 130].map((c) => p({ price: { cents: c * 100, currency: 'EUR' } }))
    expect(lowestSealedEur(products)).toEqual({ eur: 58, sampleSize: 2 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: FAIL — the first test currently returns `{ eur: 58, sampleSize: 5 }` (absolute min, no trim).

- [ ] **Step 3: Implement**

In `src/lib/pricing/cardtrader.ts`, add the constants + helper above `lowestSealedEur`:

```typescript
// A listing below this fraction of the median is not the same product at the same
// grade — a mispriced/damaged/foreign outlier. Drop it before taking the floor, so
// the value is the honest "lowest you'd actually pay", not a single bad listing.
// Low-side only: the median already handles the high side (do NOT add a high fence).
const FLOOR_FRACTION = 0.6
const MIN_FOR_TRIM = 3 // fewer listings than this: no meaningful median to trim against

function medianOf(sortedAsc: number[]): number {
  const mid = Math.floor(sortedAsc.length / 2)
  return sortedAsc.length % 2 === 0 ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2 : sortedAsc[mid]
}
```

Replace the last two lines of `lowestSealedEur` (`if (eur.length === 0) …` / `return { eur: Math.min(...eur) … }`) with:

```typescript
  if (eur.length === 0) return { eur: null, sampleSize: 0 }
  if (eur.length < MIN_FOR_TRIM) return { eur: Math.min(...eur), sampleSize: eur.length }
  const sorted = [...eur].sort((a, b) => a - b)
  const floor = medianOf(sorted) * FLOOR_FRACTION
  const kept = sorted.filter((price) => price >= floor) // never empty: the median clears its own floor
  return { eur: kept[0], sampleSize: kept.length }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pricing/__tests__/cardtrader.test.ts`
Expected: PASS (existing cardtrader tests + the 3 new ones).

- [ ] **Step 5: Full gate + commit**

Run: `npx tsc --noEmit && npx vitest run && npx eslint . && npm run build` → all green (lint 0/0).

```bash
git add src/lib/pricing/cardtrader.ts src/lib/pricing/__tests__/cardtrader.test.ts
git commit -m "fix(pricing): Cardtrader uses a trimmed minimum, not the absolute lowest listing"
```

---

## Notes for the implementer

- **Do NOT push.** The controller decides when to merge/deploy, then runs a forced price refresh so every
  AUTO sealed item re-prices through the robust Cardtrader path.
- Do NOT touch `netlify/functions/observatory-daily.mts` or the observatory maths — it keeps collecting;
  this change only stops its number from being used as the value.
- If removing `hasShowableEuReference` leaves `Strength`/`EuReference` imports unused in `priceSource.ts`,
  keep only the ones still referenced (the `EuReference` type is still used by `effectiveValue`'s
  parameter and `PriceSourceInput`). Let `tsc`/`eslint` tell you.
