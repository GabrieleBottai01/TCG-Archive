# Portfolio value chart — design

**Date:** 2026-07-22
**Status:** approved (brainstorming; Gabriele granted blanket approval to proceed while AFK)
**Scope:** Sub-project B of the "Collectr, done better" arc. Depends on A (daily snapshots, shipped
2026-07-22). C (movers), D (restyle), E (set completion), F (pricing accuracy) are separate specs.

## Problem

A now records `PortfolioSnapshot` daily, but nothing reads it. The dashboard still shows only *now*.
Collectr's central affordance — the portfolio charted over time with a range selector and a delta —
is the thing to match, and it is also the only way to **verify A actually works**: A deliberately
shipped with no read surface, so from outside we cannot yet tell whether rows are being written.

## Design

### 1. Where the data comes from — no new endpoint

`src/app/page.tsx` is already a server component reading Prisma. It also loads the user's snapshots
(`prisma.portfolioSnapshot.findMany({ where: { userId }, orderBy: { day: 'asc' } })`) and passes them
to `Dashboard`, JSON-round-tripped like `items` already are (so `day`/`pricesAsOf` arrive as ISO
strings). Range switching is **client-side filtering of the already-loaded series** — a year of daily
points is ~365 rows, far too small to justify an endpoint, a fetch, or pagination.

Client-side point type:

```typescript
export type SnapshotPoint = { day: string; totalValue: number; totalCost: number }
```

### 2. Rendering — hand-rolled inline SVG, no chart library

The repo has no charting dependency and a documented concern for bundle/TTFB. A single line chart is
a path plus two scales; adding a chart library for it would be the larger change. Inline SVG also
inherits the app's existing theme tokens directly (`text-fg`, `text-muted`, `border`, `success`,
`warning`) instead of fighting a library's theming.

### 3. Ranges — deliberately no "1D"

Pills: **7D · 1M · 3M · 6M · MAX**, default **1M**.

Collectr offers 1D because it has intraday pricing. **Our series has exactly one point per day**, so a
1D range would render a single point. Offering it would imply a resolution we do not have. This is a
place where copying Collectr literally would be dishonest, so we do not.

### 4. The delta

For the selected range: the change from the first to the last point, shown as absolute EUR **and**
percent, coloured green when up and red when down (mirroring Collectr's "+$1,833.00 (17.3%)"). When
the first point's value is 0 the percentage is omitted rather than shown as infinity.

### 5. Thin history is stated, not drawn — the load-bearing rule

A shipped today, so for the first weeks the series will be 1–2 points long. **A line drawn through
one or two points reads as "the market is flat", which is a visual lie about data we do not have.**

Rule: the chart renders a line only when the selected range holds **at least 2 points**. Below that
it renders an honest empty state naming when collection started ("Sto raccogliendo i dati dal
<date> — il grafico comparirà appena ci sono almeno due giorni"). The same applies per-range: picking
6M with 9 days of history shows the 9 days, not a misleading stretch.

### 6. What is charted

`totalValue` only. Cost is already on the dashboard as a number, and a second line doubles the
chart's complexity for a figure that does not move day to day. Left as a possible follow-up.

### 7. Placement

Directly under the balance hero in `Dashboard`, so the headline number and its history read as one
unit.

## Non-goals (YAGNI)

- No new API endpoint (server component already has the data).
- No chart library.
- No "1D"/intraday range (we have daily granularity — see §3).
- No cost-basis second line.
- No rendering of `pricesAsOf` staleness yet (recorded by A; a later pass can dim stale stretches).
- No movers/trending list — that is C.
- No zoom, pan, or tooltip-follow interaction; a single hover readout is enough for v1.

## Affected / new files

- New `src/lib/snapshots/series.ts` — pure: `filterRange`, `computeDelta`, `buildChartPath` (+ scales).
- New `src/lib/snapshots/__tests__/series.test.ts`.
- New `src/components/PortfolioChart.tsx` — client component: pills, SVG, delta, empty state.
- `src/app/page.tsx` — load snapshots, pass down.
- `src/components/Dashboard.tsx` — accept `snapshots`, render the chart under the balance.
- `src/lib/i18n.ts` — chart labels in `it` + `en`.

## Verification

- Unit (pure): `filterRange` respects each window and never invents points; `computeDelta` returns
  absolute + percent and omits percent when the base is 0; `buildChartPath` maps a known series to a
  path whose first/last points sit at the expected extremes; a flat series does not divide by zero.
- Live (post-deploy) — **this also verifies A**: open the dashboard and confirm (a) a point exists at
  all, i.e. `PortfolioSnapshot` rows are really being written, and (b) the latest point's value equals
  the dashboard's displayed collection value. With <2 days of history the honest empty state must
  appear instead of a flat line.
