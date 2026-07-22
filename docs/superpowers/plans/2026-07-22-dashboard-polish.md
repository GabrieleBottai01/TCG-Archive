# Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove a breakdown that only restates the total, and pair every gain/loss figure with the percentage it represents.

**Architecture:** One pure, tested helper in `src/lib/value.ts` (`itemDifferencePercent`), consumed by `Dashboard.tsx`; plus three one-word guard changes in `Dashboard.tsx`. No new files, no new dependency, no styling system changes.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs — see `AGENTS.md`), React, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-dashboard-polish-design.md`.
- **This is a deliberately small change.** No repaint, no palette change, no spacing overhaul, no icons, no new dependency. If you find yourself restyling anything, stop — out of scope.
- A percentage off a **zero cost** must be `null` (omitted in the UI), never `Infinity` or `NaN` — the same rule the chart's delta already follows.
- The percent is secondary to the money: render it muted/smaller, with the € amount staying primary.
- Do not touch the hero, the chart, the stat cards, or the collection page.
- Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`. Lint must stay 0 errors / 0 warnings. Build gate: `npm run build`.
- Do NOT push. Work stays on `feat/dashboard-polish`.

---

### Task 1: `itemDifferencePercent` (pure)

**Files:**
- Modify: `src/lib/value.ts` (add the helper next to `itemDifference`)
- Create: `src/lib/__tests__/valuePercent.test.ts`

**Interfaces:**
- Consumes: the existing `itemDifference(i: ValueItem): number` and `type ValueItem` in the same module.
- Produces: `export function itemDifferencePercent(i: ValueItem): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/valuePercent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { itemDifferencePercent, type ValueItem } from '@/lib/value'

const item = (over: Partial<ValueItem> = {}): ValueItem => ({
  quantity: 1, purchasePrice: 100, marketValue: 138, ...over,
})

describe('itemDifferencePercent', () => {
  it('is the gain over what the item cost', () => {
    expect(itemDifferencePercent(item())).toBeCloseTo(38, 5)
  })

  it('is negative when the item lost value', () => {
    expect(itemDifferencePercent(item({ marketValue: 75 }))).toBeCloseTo(-25, 5)
  })

  it('measures against the TOTAL cost, so quantity cancels out', () => {
    // 4 × (138 − 100) = +152 on 4 × 100 = 400 → still +38%
    expect(itemDifferencePercent(item({ quantity: 4 }))).toBeCloseTo(38, 5)
  })

  it('is null when the item cost nothing — a percentage off zero is undefined, not infinite', () => {
    expect(itemDifferencePercent(item({ purchasePrice: 0 }))).toBeNull()
    expect(itemDifferencePercent(item({ purchasePrice: 0, marketValue: 0 }))).toBeNull()
  })

  it('is 0 when the value did not move', () => {
    expect(itemDifferencePercent(item({ marketValue: 100 }))).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/valuePercent.test.ts`
Expected: FAIL — `itemDifferencePercent` is not exported from `@/lib/value`.

- [ ] **Step 3: Implement**

In `src/lib/value.ts`, immediately after the existing `itemDifference` function, add:

```typescript
/**
 * The item's gain or loss as a percentage of what it cost. Null when it cost
 * nothing: a percentage off a zero base is undefined, not infinite growth —
 * the same rule the portfolio chart's delta follows.
 */
export function itemDifferencePercent(i: ValueItem): number | null {
  const cost = i.purchasePrice * i.quantity
  if (cost === 0) return null
  return (itemDifference(i) / cost) * 100
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/valuePercent.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/value.ts src/lib/__tests__/valuePercent.test.ts
git commit -m "feat(dashboard): itemDifferencePercent — gain/loss against what it cost"
```

---

### Task 2: Apply both changes in `Dashboard`

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `itemDifferencePercent` (Task 1), already-imported `itemDifference`, `Money`.

- [ ] **Step 1: Hide single-entry breakdowns**

`Dashboard.tsx` guards its three breakdown sections on the group list being non-empty. With a single
group the card restates the hero (same value, same P/L) and adds nothing.

Change each of the three guards from "has any group" to "has more than one group":

- the per-game section (currently `{gameGroups.length > 0 && (`) → `{gameGroups.length > 1 && (`
- the per-type section — same change on its own group variable
- the per-condition section — same change on its own group variable

Find each by its heading (`t('dash_perGame')`, and the two sections that follow it with the same
`grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3` structure). Change ONLY the comparison; leave
everything inside untouched.

- [ ] **Step 2: Show the percentage in Top gains and Top losses**

Both ranked lists currently render the amount alone:

```tsx
                      <span className="text-sm tabular-nums shrink-0">
                        <Money value={itemDifference(item)} signed />
                      </span>
```

In BOTH the gains list and the losses list, replace that block with:

```tsx
                      <span className="text-sm tabular-nums shrink-0">
                        <Money value={itemDifference(item)} signed />
                        {itemDifferencePercent(item) !== null && (
                          <span className="ml-2 text-xs text-muted">
                            {itemDifferencePercent(item)! >= 0 ? '+' : '−'}
                            {Math.abs(itemDifferencePercent(item)!).toFixed(1)}%
                          </span>
                        )}
                      </span>
```

Add `itemDifferencePercent` to the existing import from `@/lib/value` at the top of the file.

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx eslint . && npm run build`
Expected: no type errors; all tests pass; 0 lint errors and 0 warnings; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): drop single-entry breakdowns, pair gains/losses with their percent"
```

---

## Notes for the implementer

- **Do NOT push.** This work is batched with sub-project C for a single deploy.
- Calling `itemDifferencePercent(item)` more than once per row is fine — it is pure arithmetic over
  three numbers, not a query. Prefer clarity over caching it in a local.
- If a breakdown's group variable is named differently from `gameGroups`, use whatever the file
  actually calls it; the change is the comparison operator only.
