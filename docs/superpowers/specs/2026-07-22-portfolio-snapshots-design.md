# Daily portfolio snapshots — design

**Date:** 2026-07-22
**Status:** approved (brainstorming)
**Scope:** Sub-project A of the "Collectr, done better" arc. B (portfolio chart), C (movers/trending),
D (widget restyle), E (set completion), F (pricing accuracy) are separate specs.

## Problem

The dashboard is a photograph of *now*: value, cost, P/L, per-game, top-value. There is no time
dimension anywhere in the app. Collectr's entire hook — portfolio value charted over time, range
pills, % deltas, "most valuable / trending" — rests on a daily history we simply do not have.

**History can only be built forward.** Yesterday's portfolio value cannot be reconstructed: the
market values we hold are current-only, and `PriceReference` covers just the watched sealed
products, not the collection. Every day without recording is a day of chart we will never have.
That makes this foundation urgent rather than merely first.

## Design

### 1. What we record — two tables, deliberately

```prisma
model PortfolioSnapshot {          // the immutable portfolio curve
  id          String   @id @default(cuid())
  userId      String
  day         DateTime @db.Date
  totalValue  Float
  totalCost   Float
  itemCount   Int
  pieceCount  Int
  /** Oldest marketValueUpdatedAt among auto-priced items — how stale this point's prices were. */
  pricesAsOf  DateTime?
  createdAt   DateTime @default(now())
  @@unique([userId, day])
}

model ItemValueSnapshot {          // per-item history; powers movers (C) + sparklines
  id       String   @id @default(cuid())
  itemId   String
  day      DateTime @db.Date
  valueEur Float                   // per-unit effective value on that day
  quantity Int
  item     Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  @@unique([itemId, day])
}
```

**Why two and not just sum the per-item rows.** If the portfolio total were derived by summing
surviving item rows, deleting or selling an item would *retroactively rewrite history* — March's
chart would drop today. Recording the total separately keeps "what the portfolio was worth that
day" true forever. Per-item history, by contrast, legitimately follows its item (cascade delete):
once an item is gone, its movers are meaningless.

`Item` gains the back-relation `valueSnapshots ItemValueSnapshot[]`.

### 2. Which value

Snapshots are computed with the **same `collectionTotals()` / `effectiveValue` path the dashboard
uses** (`src/lib/value.ts`), so a STRONG observatory reference is honoured identically. Reusing the
one helper is what guarantees the chart's "today" can never contradict the dashboard's headline
number. Per-item `valueEur` is the same per-unit effective value; `quantity` is stored alongside so
a later mover calculation can distinguish a price move from a quantity change.

### 3. When it runs

- **Nightly**, inside the existing `netlify/functions/observatory-daily.mts` (`@daily`), and
  **before** `runObservatory`. The snapshot is DB-only and fast; the observatory self-limits to a
  25s budget under Netlify's 30s ceiling, so running it first could starve the one piece of work
  that is *not* recoverable later. Snapshot first, observatory with what remains.
- **Also on price refresh:** `/api/prices/refresh` upserts *today's* row after it finishes. The
  stored `marketValue` only moves when that route runs (page load, 6h throttle), so upserting there
  keeps today's point fresh; the nightly run still guarantees a row on days the app is never opened.
- Every write is an **upsert on `(userId, day)`** (and `(itemId, day)`), so repeated runs on the
  same day overwrite rather than duplicate. Last write of the day wins.

### 3a. Day semantics

`startOfUtcDay` means a day's row is UTC-bounded, not local: for a CEST user (UTC+2) the row
labelled day D may legitimately be last written at 01:59 local time on D+1 — a later chart must not
label these rows as local calendar days. Also: because the snapshot runs *before* the observatory
in the nightly job, a nightly-only point is built from EU references that do not yet include that
night's observation (on days the app is opened instead, the refresh-route write runs afterward and
supersedes the nightly one for that day).

### 4. Staleness is recorded, not hidden

`marketValue` is refreshed only when the app is used. If it is not opened for two weeks, the curve
flatlines on last-known values — not false, but not fresh either. `pricesAsOf` (the oldest
`marketValueUpdatedAt` among auto-priced items) records how stale each point's inputs were, so a
later UI can hedge those stretches honestly. One nullable column now; unrecoverable if omitted,
exactly like the history itself.

## Non-goals (YAGNI)

- **No UI at all.** No chart, no movers, no dashboard change — those are B, C, D.
- No backfill of past days (impossible by construction).
- No intra-day series (one row per day; last write wins).
- No refreshing prices from the nightly job (Cardtrader is ~1 req/s; it would blow the 30s ceiling).
- No snapshots for users with an empty collection (nothing to record).
- No retention policy on `ItemValueSnapshot`. It grows as items × days (~7k rows/year at today's
  collection size), and is deliberately left unpruned for now — unlike `EbayObservation`, which is
  pruned at 30 days.

## Affected / new files

- `prisma/schema.prisma` — the two models + the `Item.valueSnapshots` back-relation.
- New `src/lib/snapshots/portfolioSnapshot.ts` — pure `buildSnapshot(items)` returning the portfolio
  totals + per-item rows + `pricesAsOf`, and a `writeSnapshot(db, userId, day, built)` Prisma adapter.
- `netlify/functions/observatory-daily.mts` — snapshot all users first, then the observatory.
- `src/app/api/prices/refresh/route.ts` — upsert today's snapshot after repricing.

## Verification

- Unit (pure, no DB): `buildSnapshot` totals match `collectionTotals` for the same items; per-item
  rows carry per-unit value + quantity; `pricesAsOf` is the oldest `marketValueUpdatedAt` among
  auto-priced items and null when none are auto-priced.
- Type/adapter: `tsc` for the Prisma store (consistent with `observatory/store.ts`, which is
  tsc-checked, not unit-tested).
- Live (post-deploy): confirm a `PortfolioSnapshot` row appears for the user — after a price refresh
  the same day, and again after the first nightly run — with `totalValue` equal to the dashboard's
  displayed collection value.
