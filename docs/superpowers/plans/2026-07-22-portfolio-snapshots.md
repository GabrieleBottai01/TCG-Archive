# Daily Portfolio Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start recording, every day, what the collection was worth — a portfolio-level curve plus per-item values — so the chart (B) and movers (C) become possible at all.

**Architecture:** A pure `buildSnapshot(items, now)` computes the portfolio totals and per-item rows from the same `collectionTotals`/`effectiveValue` path the dashboard uses; a thin Prisma adapter upserts them on `(userId, day)` / `(itemId, day)`. It is called from two places: the existing nightly Netlify function (before the observatory, so it can never be starved) and `/api/prices/refresh` (so today's point stays fresh).

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs — see `AGENTS.md`), Prisma (`prisma-client` generator → `src/generated/prisma`), Vitest, Netlify scheduled functions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-portfolio-snapshots-design.md`.
- **Values MUST come from `collectionTotals()` / `effectiveValue` in `src/lib/value.ts`** — never a re-implemented sum. This is what guarantees the snapshot can never contradict the dashboard's headline number (a STRONG observatory reference is honoured identically).
- The portfolio total is stored **separately** from per-item rows, deliberately: summing surviving items would rewrite history retroactively when an item is deleted. `PortfolioSnapshot` is immutable history; `ItemValueSnapshot` cascade-deletes with its item.
- All writes are **upserts** — `(userId, day)` and `(itemId, day)`. Repeated runs the same day overwrite; last write wins. Never create duplicate rows for a day.
- In the nightly function the snapshot runs **BEFORE** `runObservatory` (the observatory self-limits to 25s under Netlify's 30s ceiling and could otherwise starve the one non-recoverable piece of work).
- `pricesAsOf` = the **oldest** `marketValueUpdatedAt` among items whose `marketValueSource === 'AUTO'`; `null` when there are none.
- **No UI in this plan at all** — no chart, no movers, no dashboard change.
- Users with an empty collection get no snapshot rows.
- Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`. Build gate: `npm run build`.
- Do NOT push to `main` without the controller's say-so; work stays on `feat/portfolio-snapshots`.
- Local `prisma db push` fails (P1013, DATABASE_URL is not a reachable Postgres) — expected; `npx prisma generate` is the required step. Prod migrates at deploy. `src/generated/prisma` is gitignored.

---

### Task 1: Prisma models

**Files:**
- Modify: `prisma/schema.prisma` (add two models; add a back-relation field to `Item`)

**Interfaces:**
- Produces: `PortfolioSnapshot { id, userId, day, totalValue, totalCost, itemCount, pieceCount, pricesAsOf, createdAt }` unique on `(userId, day)`; `ItemValueSnapshot { id, itemId, day, valueEur, quantity, item }` unique on `(itemId, day)`, cascade-deleted with the item; `Item.valueSnapshots ItemValueSnapshot[]`.

- [ ] **Step 1: Add the two models**

Append to `prisma/schema.prisma`:

```prisma
model PortfolioSnapshot {          // immutable daily curve — never recomputed from items
  id         String    @id @default(cuid())
  userId     String
  day        DateTime  @db.Date
  totalValue Float
  totalCost  Float
  itemCount  Int
  pieceCount Int
  /// Oldest marketValueUpdatedAt among AUTO-priced items — how stale this point's inputs were.
  pricesAsOf DateTime?
  createdAt  DateTime  @default(now())

  @@unique([userId, day])
  @@index([userId, day])
}

model ItemValueSnapshot {          // per-item history; powers movers + sparklines. Follows its item.
  id       String   @id @default(cuid())
  itemId   String
  day      DateTime @db.Date
  valueEur Float                   // per-UNIT effective value that day
  quantity Int
  item     Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([itemId, day])
  @@index([itemId, day])
}
```

- [ ] **Step 2: Add the back-relation on Item**

In `model Item`, after the `notes` field, add:

```prisma
  valueSnapshots       ItemValueSnapshot[]
```

- [ ] **Step 3: Regenerate the client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client". (`npx prisma db push` will fail locally with P1013 — expected, skip it.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(snapshots): PortfolioSnapshot + ItemValueSnapshot models"
```

---

### Task 2: Pure `buildSnapshot`

**Files:**
- Create: `src/lib/snapshots/portfolioSnapshot.ts`
- Create: `src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`

**Interfaces:**
- Consumes: `collectionTotals`, `type ValueItem` from `@/lib/value`; `effectiveValue` from `@/lib/priceSource`.
- Produces:
```typescript
export type SnapshotItem = ValueItem & { id: string; marketValueSource?: string | null; marketValueUpdatedAt?: Date | string | null }
export type BuiltSnapshot = {
  totalValue: number; totalCost: number; itemCount: number; pieceCount: number
  pricesAsOf: Date | null
  items: { itemId: string; valueEur: number; quantity: number }[]
}
export function buildSnapshot(items: SnapshotItem[]): BuiltSnapshot
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSnapshot, type SnapshotItem } from '@/lib/snapshots/portfolioSnapshot'
import { collectionTotals } from '@/lib/value'

const item = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  id: 'i1', quantity: 1, purchasePrice: 10, marketValue: 25,
  itemType: 'SEALED', externalId: 'tcgcsv:1:2',
  marketValueSource: 'AUTO', marketValueUpdatedAt: new Date('2026-07-20T00:00:00Z'),
  ...over,
})

describe('buildSnapshot', () => {
  it('totals agree with collectionTotals for the same items', () => {
    const items = [item(), item({ id: 'i2', quantity: 3, purchasePrice: 5, marketValue: 8 })]
    const built = buildSnapshot(items)
    const expected = collectionTotals(items)
    expect(built.totalValue).toBe(expected.totalValue)
    expect(built.totalCost).toBe(expected.totalCost)
    expect(built.itemCount).toBe(expected.itemCount)
    expect(built.pieceCount).toBe(expected.pieceCount)
  })

  it('emits one per-item row carrying the PER-UNIT value and the quantity', () => {
    const built = buildSnapshot([item({ id: 'a', quantity: 4, marketValue: 30 })])
    expect(built.items).toEqual([{ itemId: 'a', valueEur: 30, quantity: 4 }])
  })

  it('honours a STRONG EU reference exactly as the dashboard does', () => {
    // effectiveValue substitutes a STRONG reference for the stored marketValue.
    const strong = item({
      id: 's', marketValue: 100,
      euReference: { strength: 'STRONG', displayValue: 140, sampleSize: 9, sales: 3 },
    })
    const built = buildSnapshot([strong])
    expect(built.items[0].valueEur).toBe(140)
    expect(built.totalValue).toBe(140)
  })

  it('pricesAsOf is the OLDEST marketValueUpdatedAt among AUTO-priced items', () => {
    const built = buildSnapshot([
      item({ id: 'old', marketValueUpdatedAt: new Date('2026-07-01T00:00:00Z') }),
      item({ id: 'new', marketValueUpdatedAt: new Date('2026-07-21T00:00:00Z') }),
    ])
    expect(built.pricesAsOf).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('ignores MANUAL items when computing pricesAsOf, and is null when none are AUTO', () => {
    const manualOld = item({ id: 'm', marketValueSource: 'MANUAL', marketValueUpdatedAt: new Date('2020-01-01T00:00:00Z') })
    const auto = item({ id: 'a', marketValueUpdatedAt: new Date('2026-07-21T00:00:00Z') })
    expect(buildSnapshot([manualOld, auto]).pricesAsOf).toEqual(new Date('2026-07-21T00:00:00Z'))
    expect(buildSnapshot([manualOld]).pricesAsOf).toBeNull()
  })

  it('returns zeroed totals and no rows for an empty collection', () => {
    expect(buildSnapshot([])).toEqual({
      totalValue: 0, totalCost: 0, itemCount: 0, pieceCount: 0, pricesAsOf: null, items: [],
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`
Expected: FAIL — module `@/lib/snapshots/portfolioSnapshot` not found.

- [ ] **Step 3: Implement**

Create `src/lib/snapshots/portfolioSnapshot.ts`:

```typescript
// What the collection was worth on one day. Pure: no DB, no clock.
//
// Every figure goes through collectionTotals/effectiveValue — the same path the
// dashboard renders — so a snapshot can never disagree with the headline number,
// and a STRONG observatory reference is honoured identically in both.

import { collectionTotals, type ValueItem } from '@/lib/value'
import { effectiveValue } from '@/lib/priceSource'

export type SnapshotItem = ValueItem & {
  id: string
  marketValueSource?: string | null
  marketValueUpdatedAt?: Date | string | null
}

export type BuiltSnapshot = {
  totalValue: number
  totalCost: number
  itemCount: number
  pieceCount: number
  /** Oldest marketValueUpdatedAt among AUTO-priced items; null when none are auto-priced. */
  pricesAsOf: Date | null
  items: { itemId: string; valueEur: number; quantity: number }[]
}

export function buildSnapshot(items: SnapshotItem[]): BuiltSnapshot {
  const totals = collectionTotals(items)

  const rows = items.map((i) => ({
    itemId: i.id,
    // Per-UNIT value, so a later mover can tell a price move from a quantity change.
    valueEur: effectiveValue({
      itemType: i.itemType ?? '',
      externalId: i.externalId,
      marketValue: i.marketValue,
      euReference: i.euReference,
    }),
    quantity: i.quantity,
  }))

  let pricesAsOf: Date | null = null
  for (const i of items) {
    if (i.marketValueSource !== 'AUTO' || !i.marketValueUpdatedAt) continue
    const at = new Date(i.marketValueUpdatedAt)
    if (pricesAsOf === null || at < pricesAsOf) pricesAsOf = at
  }

  return {
    totalValue: totals.totalValue,
    totalCost: totals.totalCost,
    itemCount: totals.itemCount,
    pieceCount: totals.pieceCount,
    pricesAsOf,
    items: rows,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/snapshots/portfolioSnapshot.ts src/lib/snapshots/__tests__/portfolioSnapshot.test.ts
git commit -m "feat(snapshots): pure buildSnapshot over the dashboard's own value path"
```

---

### Task 3: Prisma writer + per-user runner

**Files:**
- Modify: `src/lib/snapshots/portfolioSnapshot.ts` (append the DB-facing functions)

**Interfaces:**
- Consumes: `buildSnapshot` (Task 2); the Prisma client type from `@/lib/db`.
- Produces:
```typescript
export function startOfUtcDay(now: Date): Date
export async function writeSnapshot(db: PrismaLike, userId: string, day: Date, built: BuiltSnapshot): Promise<void>
export async function snapshotUser(db: PrismaLike, userId: string, now: Date): Promise<boolean> // false = empty collection, nothing written
export async function snapshotAllUsers(db: PrismaLike, now: Date): Promise<number> // how many users got a snapshot
```

Note: this file now holds pure logic AND a thin Prisma adapter. That mirrors the observatory split in spirit; keep the adapter functions at the bottom and thin (query → buildSnapshot → upsert), so the pure part stays independently testable. The adapter is tsc-checked, not unit-tested (it needs a live DB) — the same established pattern as `src/lib/observatory/store.ts`.

- [ ] **Step 1: Write the failing test for `startOfUtcDay`**

Append to `src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`:

```typescript
import { startOfUtcDay } from '@/lib/snapshots/portfolioSnapshot'

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC so one calendar day yields one row', () => {
    expect(startOfUtcDay(new Date('2026-07-22T23:59:59.999Z'))).toEqual(new Date('2026-07-22T00:00:00.000Z'))
    expect(startOfUtcDay(new Date('2026-07-22T00:00:00.000Z'))).toEqual(new Date('2026-07-22T00:00:00.000Z'))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`
Expected: FAIL — `startOfUtcDay` is not exported.

- [ ] **Step 3: Implement the day helper and the adapter**

Append to `src/lib/snapshots/portfolioSnapshot.ts`:

```typescript
// --- Prisma adapter (tsc-checked; needs a live DB, so not unit-tested) ---

/** Midnight UTC of `now`, so a calendar day maps to exactly one row. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

type PrismaLike = typeof import('@/lib/db').prisma

/** Upserts the portfolio row and every per-item row for `day`. Last write of the day wins. */
export async function writeSnapshot(db: PrismaLike, userId: string, day: Date, built: BuiltSnapshot): Promise<void> {
  const data = {
    totalValue: built.totalValue,
    totalCost: built.totalCost,
    itemCount: built.itemCount,
    pieceCount: built.pieceCount,
    pricesAsOf: built.pricesAsOf,
  }
  await db.portfolioSnapshot.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...data },
    update: data,
  })
  for (const row of built.items) {
    await db.itemValueSnapshot.upsert({
      where: { itemId_day: { itemId: row.itemId, day } },
      create: { itemId: row.itemId, day, valueEur: row.valueEur, quantity: row.quantity },
      update: { valueEur: row.valueEur, quantity: row.quantity },
    })
  }
}

/** Snapshots one user's collection for the UTC day of `now`. Returns false when they own nothing. */
export async function snapshotUser(db: PrismaLike, userId: string, now: Date): Promise<boolean> {
  const items = await db.item.findMany({ where: { userId } })
  if (items.length === 0) return false
  const refs = await euReferencesFor(db, items)
  const withRefs = items.map((i) => ({ ...i, euReference: refs.get(`${i.externalId}|${i.language}`) ?? null }))
  await writeSnapshot(db, userId, startOfUtcDay(now), buildSnapshot(withRefs))
  return true
}

/** Snapshots every user who owns anything. Returns how many were written. */
export async function snapshotAllUsers(db: PrismaLike, now: Date): Promise<number> {
  const users = await db.user.findMany({ select: { id: true } })
  let written = 0
  for (const u of users) if (await snapshotUser(db, u.id, now)) written++
  return written
}
```

Add this import at the top of the file (next to the existing imports):

```typescript
import { euReferencesFor } from '@/lib/observatory/euReference'
```

**Why `euReferencesFor`:** the dashboard attaches EU references before rendering (`src/app/page.tsx` does exactly this), and `effectiveValue` needs them to honour a STRONG reference. Without this the snapshot would silently diverge from the dashboard for any product with a STRONG reference — the one thing the Global Constraints forbid.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/snapshots/__tests__/portfolioSnapshot.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean. If `euReferencesFor`'s signature differs from `(db, items)`, adapt the call to the real signature and note it in the report.

```bash
git add src/lib/snapshots/portfolioSnapshot.ts src/lib/snapshots/__tests__/portfolioSnapshot.test.ts
git commit -m "feat(snapshots): Prisma writer + per-user snapshot runner"
```

---

### Task 4: Wire into the nightly function and the price refresh

**Files:**
- Modify: `netlify/functions/observatory-daily.mts`
- Modify: `src/app/api/prices/refresh/route.ts`

**Interfaces:**
- Consumes: `snapshotAllUsers(db, now)`, `snapshotUser(db, userId, now)` (Task 3).

- [ ] **Step 1: Snapshot first in the nightly function**

In `netlify/functions/observatory-daily.mts`, import the runner and call it **before** `runObservatory`:

```typescript
import { snapshotAllUsers } from '@/lib/snapshots/portfolioSnapshot'
```

Replace the handler body with:

```typescript
export default async function handler(): Promise<Response> {
  const start = performance.now()

  // Snapshot FIRST: it is DB-only and fast, and it is the one piece of work that
  // cannot be recovered later (yesterday's portfolio value is unreconstructable).
  // runObservatory self-limits to 25s under Netlify's 30s ceiling, so letting it
  // go first could starve the snapshot entirely.
  let snapshots = 0
  try {
    snapshots = await snapshotAllUsers(prisma, new Date())
  } catch {
    // A snapshot failure must not abort the observatory run.
  }

  const store = createObservatoryStore(prisma)
  const summary = await runObservatory(store, {
    now: new Date(),
    search: searchSealed,
    elapsedMs: () => performance.now() - start, // elapsed since THIS run began
  })
  return Response.json({ ok: true, snapshots, ...summary })
}
```

Also update the file's header comment: the function now takes the daily portfolio snapshot before running the observatory.

- [ ] **Step 2: Upsert today's snapshot after a price refresh**

In `src/app/api/prices/refresh/route.ts`, add the import:

```typescript
import { snapshotUser } from '@/lib/snapshots/portfolioSnapshot'
```

Then, after the worker pool finishes and before the route returns its JSON response, add:

```typescript
  // Keep today's point fresh: the stored marketValues only move when this route
  // runs, so re-snapshot right after. The nightly job still guarantees a row on
  // days the app is never opened. Upsert on (userId, day) — last write wins.
  try {
    await snapshotUser(prisma, userId, new Date())
  } catch {
    // Never fail a price refresh because the snapshot could not be written.
  }
```

(Locate the existing `return NextResponse.json({ ... })` at the end of `POST` and insert the block immediately above it.)

- [ ] **Step 3: Type-check, full suite, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests pass; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/observatory-daily.mts src/app/api/prices/refresh/route.ts
git commit -m "feat(snapshots): snapshot nightly (before observatory) and after each price refresh"
```

---

## Notes for the implementer

- **Do NOT push.** The controller decides when to merge/deploy. The prod migration runs in that deploy's `prisma db push`; both tables are new and the `Item` change is a back-relation only (no column), so it is additive and safe.
- There is **no UI work** in this plan. If you find yourself editing a component, stop — you are out of scope.
- Post-deploy verification (controller's job, not yours): a `PortfolioSnapshot` row appears for the user after a price refresh, with `totalValue` equal to the dashboard's displayed collection value.
