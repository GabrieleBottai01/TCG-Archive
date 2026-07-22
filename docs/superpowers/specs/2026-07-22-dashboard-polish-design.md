# Dashboard polish — design

**Date:** 2026-07-22
**Status:** approved (brainstorming; Gabriele granted blanket approval to proceed while AFK)
**Scope:** Sub-project D of the "Collectr, done better" arc. A (snapshots) and B (chart) shipped
2026-07-22. C (movers), E (set completion), F (pricing accuracy) are separate specs.

## Problem — and what it is NOT

D was framed as "restyle the widgets like Collectr". Inspecting the running app first changed that
framing, and the spec records the finding rather than the original assumption:

- The dashboard **already speaks Collectr's visual language** — dark surface, one accent, a big-number
  hero, stat cards, ranked lists. Verified on desktop *and* at 414px: the responsive behaviour is
  sound (stat cards reflow 5→2 columns, the chart card holds up, nothing overflows).
- The apparently "unbalanced" breakdown rows are not a layout bug: they are 3-column grids holding a
  **single** entry, because the collection has one game and one type.

So a general repaint would be motion without value, and would risk regressing a UI that works. This
spec is deliberately small: two changes that add information or remove noise, and nothing decorative.

**Explicitly rejected: icons on section headings.** They would need a hand-rolled SVG set (or a new
dependency) for six headings that already read clearly — decoration without information, which is the
opposite of what the rest of this arc has been built on.

## Design

### 1. Hide a breakdown that has only one entry

`Dashboard` renders per-game, per-type and per-condition breakdowns whenever the group list is
non-empty. With a single group the card **restates the hero**: same value, same P/L, no new
information — and on desktop it leaves two-thirds of the row empty.

Change each guard from "has any group" to **"has more than one group"**. A breakdown earns its space
only when it actually divides something. The sections return automatically once a second game, type
or condition exists.

### 2. Show the percentage beside the amount in Top gains / Top losses

Today each row reads `+€ 80,78`. An absolute figure alone cannot be compared across items: €80 on a
€40 box and €80 on a €400 box are very different outcomes. Collectr pairs every figure with its
percentage, and that is the affordance worth taking.

Add the percent change against what the item cost: `itemDifference / (purchasePrice × quantity)`.

- Rendered beside the money, muted and smaller, so the € stays primary: `+€ 80,78 · +38,1%`.
- **When the item's cost is 0 the percentage is omitted**, not shown as infinity — the same rule the
  chart's delta already follows for a zero base.
- The maths lives in a pure, tested helper next to the existing value helpers, not inline in JSX.

## Non-goals (YAGNI)

- No repaint, no new palette, no spacing overhaul — the existing system works.
- No icons (see above).
- No change to the hero, the chart, the stat cards, or the collection page.
- No movers-over-time list — that is C, and it needs the per-item snapshots, not purchase price.
- No new dependency.

## Affected files

- `src/lib/value.ts` — new pure `itemDifferencePercent(i): number | null`.
- `src/lib/__tests__/` — tests for it.
- `src/components/Dashboard.tsx` — the three `> 1` guards; the percent in both ranked lists.
- `src/lib/i18n.ts` — only if a new string is needed (it should not be: the percent is a number).

## Verification

- Unit: `itemDifferencePercent` returns the signed percent against total cost, and **null** when the
  cost is 0; sign follows the difference.
- Live (post-deploy, batched with C): the per-game/per-type/per-condition sections are absent for a
  single-game single-type collection, and reappear if a second type exists; Top gains/losses show
  `€ · %` with the percent matching the amount over cost.
