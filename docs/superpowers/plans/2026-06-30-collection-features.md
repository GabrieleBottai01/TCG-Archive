# Collection Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sorting, advanced filters, CSV export, and extra dashboard statistics to the TCG Archive collection — all client-side, built on pure functions.

**Architecture:** Pure functions in `src/lib/value.ts` and a new `src/lib/csv.ts` do the work; UI controls in `CollectionView`, `FilterBar`, `Dashboard` consume them. No DB/schema changes — the collection is already loaded client-side.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind, Vitest. Existing helpers: `itemDifference`, `collectionTotals`, `Totals`, `formatEUR`, `Money`, `useT`/i18n.

## Global Constraints

- UI copy language: Italian default + English, via `useT()` from `@/lib/i18n`. Every new visible string and CSV header goes through `t(...)`; add missing keys to BOTH `it` and `en` dicts in `src/lib/i18n.ts`.
- Money math stays in `src/lib/value.ts` pure functions; never inline totals/diffs in components.
- No `any`. `npm run lint` MUST stay error-free (next build fails on eslint errors). `npx tsc --noEmit` clean.
- Filtering/sorting are generic over `<T extends ValueItem>` so they preserve the concrete `PlainItem` type (no casts).
- `PlainItem` (exported from `@/components/CollectionView`) is the row shape; it already has: name, game, itemType, condition, setName, language, quantity, purchasePrice, marketValue, marketValueSource, createdAt (string), id.

---

### Task 1: `sortItems` pure function

**Files:**
- Modify: `src/lib/value.ts`
- Test: `src/lib/__tests__/value.test.ts`

**Interfaces:**
- Consumes: `ValueItem`, `itemDifference` (existing).
- Produces:
  - `type SortKey = 'createdAt' | 'marketValue' | 'difference' | 'name' | 'game' | 'quantity'`
  - `type SortDir = 'asc' | 'desc'`
  - `type Sort = { key: SortKey; dir: SortDir }`
  - `sortItems<T extends ValueItem>(items: T[], sort: Sort): T[]` — returns a NEW sorted array (does not mutate input). Stable. `name`/`game` compared case-insensitively; `createdAt` compared as ISO strings; numeric keys numerically; `difference` via `itemDifference`.

- [ ] **Step 1: Extend `ValueItem` to carry the fields sorting/filters need**

In `src/lib/value.ts`, replace the `ValueItem` type with:

```ts
export type ValueItem = {
  quantity: number; purchasePrice: number; marketValue: number
  game?: string; itemType?: string; condition?: string | null
  setName?: string | null; name?: string; language?: string | null; createdAt?: string
}
```

- [ ] **Step 2: Write the failing test** — append to `src/lib/__tests__/value.test.ts`

```ts
import { sortItems } from '@/lib/value'

const S = [
  { quantity: 1, purchasePrice: 0, marketValue: 5, name: 'Bravo', game: 'MAGIC', createdAt: '2026-01-02' },
  { quantity: 3, purchasePrice: 0, marketValue: 1, name: 'alpha', game: 'POKEMON', createdAt: '2026-01-01' },
  { quantity: 2, purchasePrice: 10, marketValue: 2, name: 'Charlie', game: 'POKEMON', createdAt: '2026-01-03' },
]

describe('sortItems', () => {
  it('sorts by marketValue desc/asc', () => {
    expect(sortItems(S, { key: 'marketValue', dir: 'desc' }).map((i) => i.marketValue)).toEqual([5, 2, 1])
    expect(sortItems(S, { key: 'marketValue', dir: 'asc' }).map((i) => i.marketValue)).toEqual([1, 2, 5])
  })
  it('sorts by name case-insensitively', () => {
    expect(sortItems(S, { key: 'name', dir: 'asc' }).map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
  })
  it('sorts by difference (per-line P/L)', () => {
    // diffs: Bravo (5-0)*1=5, alpha (1-0)*3=3, Charlie (2-10)*2=-16
    expect(sortItems(S, { key: 'difference', dir: 'desc' }).map((i) => i.name)).toEqual(['Bravo', 'alpha', 'Charlie'])
  })
  it('sorts by createdAt and does not mutate input', () => {
    const before = S.map((i) => i.name)
    expect(sortItems(S, { key: 'createdAt', dir: 'asc' }).map((i) => i.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(S.map((i) => i.name)).toEqual(before)
  })
})
```

- [ ] **Step 3: Run → FAIL** (`npm test`) — `sortItems` not exported.

- [ ] **Step 4: Implement** — append to `src/lib/value.ts`

```ts
export type SortKey = 'createdAt' | 'marketValue' | 'difference' | 'name' | 'game' | 'quantity'
export type SortDir = 'asc' | 'desc'
export type Sort = { key: SortKey; dir: SortDir }

export function sortItems<T extends ValueItem>(items: T[], sort: Sort): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  const ci = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  return [...items].sort((a, b) => {
    let c = 0
    switch (sort.key) {
      case 'name': c = ci(a.name ?? '', b.name ?? ''); break
      case 'game': c = ci(a.game ?? '', b.game ?? ''); break
      case 'marketValue': c = a.marketValue - b.marketValue; break
      case 'quantity': c = a.quantity - b.quantity; break
      case 'difference': c = itemDifference(a) - itemDifference(b); break
      case 'createdAt': c = (a.createdAt ?? '').localeCompare(b.createdAt ?? ''); break
    }
    return c * dir
  })
}
```

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/value.ts src/lib/__tests__/value.test.ts
git commit -m "feat: add sortItems pure function"
```

---

### Task 2: Extended `filterItems` (value range, P/L, language)

**Files:**
- Modify: `src/lib/value.ts`
- Test: `src/lib/__tests__/value.test.ts`

**Interfaces:**
- Produces:
  - Extended `Filters` type: `{ game?, itemType?, condition?, setName?, search?, minValue?, maxValue?, pl?, language? }` where `minValue?: number`, `maxValue?: number`, `pl?: 'gain' | 'loss'`, `language?: string`.
  - `filterItems<T extends ValueItem>(items: T[], f: Filters): T[]` updated: `setName` becomes case-insensitive substring; `language` case-insensitive substring; `minValue`/`maxValue` inclusive on `marketValue` (per unit); `pl` via `itemDifference` (`gain` → diff > 0, `loss` → diff < 0).

- [ ] **Step 1: Write the failing test** — append to `value.test.ts`

```ts
describe('filterItems advanced', () => {
  const X = [
    { quantity: 1, purchasePrice: 2, marketValue: 5, setName: 'Base', language: 'IT' },   // diff +3
    { quantity: 1, purchasePrice: 10, marketValue: 4, setName: 'Jungle', language: 'EN' }, // diff -6
    { quantity: 2, purchasePrice: 1, marketValue: 1, setName: 'Base Set 2', language: null },// diff 0
  ]
  it('filters by value range (inclusive, per unit)', () => {
    expect(filterItems(X, { minValue: 4, maxValue: 5 })).toHaveLength(2)
    expect(filterItems(X, { minValue: 5 })).toHaveLength(1)
  })
  it('filters by P/L gain/loss', () => {
    expect(filterItems(X, { pl: 'gain' })).toHaveLength(1)
    expect(filterItems(X, { pl: 'loss' })).toHaveLength(1)
  })
  it('filters by set substring (case-insensitive) and language', () => {
    expect(filterItems(X, { setName: 'base' })).toHaveLength(2)
    expect(filterItems(X, { language: 'it' })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run → FAIL** (new fields not handled / type errors).

- [ ] **Step 3: Implement** — in `src/lib/value.ts` replace the `Filters` type and `filterItems` body:

```ts
export type Filters = {
  game?: string; itemType?: string; condition?: string; setName?: string; search?: string
  minValue?: number; maxValue?: number; pl?: 'gain' | 'loss'; language?: string
}
export function filterItems<T extends ValueItem>(items: T[], f: Filters): T[] {
  return items.filter((i) => {
    if (f.game && i.game !== f.game) return false
    if (f.itemType && i.itemType !== f.itemType) return false
    if (f.condition && i.condition !== f.condition) return false
    if (f.setName && !(i.setName ?? '').toLowerCase().includes(f.setName.toLowerCase())) return false
    if (f.language && !(i.language ?? '').toLowerCase().includes(f.language.toLowerCase())) return false
    if (f.minValue != null && i.marketValue < f.minValue) return false
    if (f.maxValue != null && i.marketValue > f.maxValue) return false
    if (f.pl) {
      const d = itemDifference(i)
      if (f.pl === 'gain' && d <= 0) return false
      if (f.pl === 'loss' && d >= 0) return false
    }
    if (f.search) {
      const q = f.search.toLowerCase()
      const hay = `${i.name ?? ''} ${i.setName ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
```

- [ ] **Step 4: Run → PASS** (existing `filterItems` tests still pass: `setName: 'Alpha'` substring-matches `'Alpha'`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/value.ts src/lib/__tests__/value.test.ts
git commit -m "feat: extend filterItems with value range, P/L, language"
```

---

### Task 3: Statistics pure functions

**Files:**
- Modify: `src/lib/value.ts`
- Test: `src/lib/__tests__/value.test.ts`

**Interfaces:**
- Consumes: `collectionTotals`, `Totals`, `itemDifference`.
- Produces:
  - `type GroupTotal = { key: string; totals: Totals }`
  - `groupTotals<T extends ValueItem>(items: T[], keyFn: (i: T) => string): GroupTotal[]`
  - `topByValue<T extends ValueItem>(items: T[], n: number): T[]` — top N by `marketValue * quantity` desc.
  - `topByDifference<T extends ValueItem>(items: T[], n: number, dir: SortDir): T[]` — `desc` = biggest gains first, `asc` = biggest losses first.
  - `averageValuePerPiece(items: ValueItem[]): number` — `totalValue / pieceCount`, 0 if no pieces.

- [ ] **Step 1: Write the failing test** — append to `value.test.ts`

```ts
import { groupTotals, topByValue, topByDifference, averageValuePerPiece } from '@/lib/value'

const G = [
  { quantity: 1, purchasePrice: 1, marketValue: 10, itemType: 'RAW' },   // diff +9, value 10
  { quantity: 2, purchasePrice: 5, marketValue: 3, itemType: 'RAW' },    // diff -4, value 6
  { quantity: 1, purchasePrice: 0, marketValue: 20, itemType: 'SEALED' },// diff +20, value 20
]

describe('stats', () => {
  it('groupTotals groups and totals by key', () => {
    const g = groupTotals(G, (i) => i.itemType ?? '')
    const raw = g.find((x) => x.key === 'RAW')!
    expect(raw.totals.totalValue).toBe(16) // 10 + 3*2
    expect(g.find((x) => x.key === 'SEALED')!.totals.totalValue).toBe(20)
  })
  it('topByValue ranks by line value desc', () => {
    expect(topByValue(G, 2).map((i) => i.marketValue)).toEqual([20, 10])
  })
  it('topByDifference desc=gains, asc=losses', () => {
    expect(topByDifference(G, 1, 'desc')[0].marketValue).toBe(20) // +20 gain
    expect(topByDifference(G, 1, 'asc')[0].marketValue).toBe(3)   // -4 loss
  })
  it('averageValuePerPiece divides total value by pieces', () => {
    expect(averageValuePerPiece(G)).toBe(36 / 4) // value 36 over 4 pieces
    expect(averageValuePerPiece([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append to `src/lib/value.ts`

```ts
export type GroupTotal = { key: string; totals: Totals }
export function groupTotals<T extends ValueItem>(items: T[], keyFn: (i: T) => string): GroupTotal[] {
  const map = new Map<string, T[]>()
  for (const i of items) {
    const k = keyFn(i)
    const arr = map.get(k)
    if (arr) arr.push(i)
    else map.set(k, [i])
  }
  return [...map.entries()].map(([key, arr]) => ({ key, totals: collectionTotals(arr) }))
}
export function topByValue<T extends ValueItem>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.marketValue * b.quantity - a.marketValue * a.quantity).slice(0, n)
}
export function topByDifference<T extends ValueItem>(items: T[], n: number, dir: SortDir): T[] {
  const s = [...items].sort((a, b) => itemDifference(b) - itemDifference(a)) // gains first
  return (dir === 'desc' ? s : [...s].reverse()).slice(0, n)
}
export function averageValuePerPiece(items: ValueItem[]): number {
  const t = collectionTotals(items)
  return t.pieceCount > 0 ? t.totalValue / t.pieceCount : 0
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/value.ts src/lib/__tests__/value.test.ts
git commit -m "feat: add collection statistics pure functions"
```

---

### Task 4: CSV generation (`itemsToCsv`)

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/__tests__/csv.test.ts`

**Interfaces:**
- Produces:
  - `type CsvItem = { name: string; game: string; itemType: string; condition: string | null; language: string | null; setName: string | null; quantity: number; purchasePrice: number; marketValue: number; marketValueSource: string | null }`
  - `type CsvLabels = { game: Record<string,string>; itemType: Record<string,string>; condition: Record<string,string>; headers: string[] }` (`headers` has 11 entries in column order).
  - `itemsToCsv(items: CsvItem[], labels: CsvLabels): string` — CSV text: header row + one row per item. Columns: Nome, Gioco, Tipo, Condizione, Lingua, Set, Quantità, Prezzo acquisto, Valore di mercato, Differenza, Fonte valore. Numbers `.toFixed(2)` except quantity. Difference = `(marketValue - purchasePrice) * quantity`. Fields containing `"` `,` `\r` `\n` are quoted with `"` doubled. Rows joined by `\r\n`. Output prefixed with a UTF-8 BOM (`﻿`).

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/csv.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { itemsToCsv } from '@/lib/csv'

const labels = {
  game: { POKEMON: 'Pokémon' },
  itemType: { RAW: 'Carta' },
  condition: { MINT: 'Mint' },
  headers: ['Nome', 'Gioco', 'Tipo', 'Cond.', 'Lingua', 'Set', 'Qta', 'Acquisto', 'Valore', 'Diff', 'Fonte'],
}

it('builds CSV with BOM, header, quoting and computed difference', () => {
  const csv = itemsToCsv(
    [{ name: 'Char, "rizard"', game: 'POKEMON', itemType: 'RAW', condition: 'MINT', language: 'IT', setName: 'Base', quantity: 2, purchasePrice: 5, marketValue: 8, marketValueSource: 'AUTO' }],
    labels,
  )
  const lines = csv.split('\r\n')
  expect(csv.startsWith('﻿')).toBe(true)
  expect(lines[0]).toBe('﻿Nome,Gioco,Tipo,Cond.,Lingua,Set,Qta,Acquisto,Valore,Diff,Fonte')
  expect(lines[1]).toBe('"Char, ""rizard""",Pokémon,Carta,Mint,IT,Base,2,5.00,8.00,6.00,AUTO')
})

it('handles null condition/language/set', () => {
  const csv = itemsToCsv(
    [{ name: 'X', game: 'POKEMON', itemType: 'RAW', condition: null, language: null, setName: null, quantity: 1, purchasePrice: 0, marketValue: 0, marketValueSource: null }],
    labels,
  )
  expect(csv.split('\r\n')[1]).toBe('X,Pokémon,Carta,,,,1,0.00,0.00,0.00,')
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `src/lib/csv.ts`

```ts
export type CsvItem = {
  name: string; game: string; itemType: string; condition: string | null
  language: string | null; setName: string | null
  quantity: number; purchasePrice: number; marketValue: number; marketValueSource: string | null
}
export type CsvLabels = {
  game: Record<string, string>
  itemType: Record<string, string>
  condition: Record<string, string>
  headers: string[]
}

function esc(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function itemsToCsv(items: CsvItem[], labels: CsvLabels): string {
  const rows: string[] = [labels.headers.map(esc).join(',')]
  for (const i of items) {
    const diff = (i.marketValue - i.purchasePrice) * i.quantity
    const cells = [
      i.name,
      labels.game[i.game] ?? i.game,
      labels.itemType[i.itemType] ?? i.itemType,
      i.condition ? labels.condition[i.condition] ?? i.condition : '',
      i.language ?? '',
      i.setName ?? '',
      String(i.quantity),
      i.purchasePrice.toFixed(2),
      i.marketValue.toFixed(2),
      diff.toFixed(2),
      i.marketValueSource ?? '',
    ]
    rows.push(cells.map((c) => esc(String(c))).join(','))
  }
  return '﻿' + rows.join('\r\n')
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/__tests__/csv.test.ts
git commit -m "feat: add CSV generation for collection export"
```

---

### Task 5: i18n keys for the new UI

**Files:**
- Modify: `src/lib/i18n.ts`

**Interfaces:**
- Produces: new keys in BOTH `it` and `en` dicts, consumed by Tasks 6–8.

- [ ] **Step 1: Add keys to the `it` dict** (place near the collection keys):

```ts
  sort_label: 'Ordina per',
  sort_createdAt: 'Data aggiunta',
  sort_marketValue: 'Valore',
  sort_difference: 'Differenza',
  sort_name: 'Nome',
  sort_game: 'Gioco',
  sort_quantity: 'Quantità',
  sort_dir: 'Inverti ordine',
  adv_toggle: 'Filtri avanzati',
  adv_minValue: 'Valore min',
  adv_maxValue: 'Valore max',
  adv_pl: 'P/L',
  adv_pl_all: 'Tutti',
  adv_pl_gain: 'In guadagno',
  adv_pl_loss: 'In perdita',
  adv_set: 'Set',
  adv_language: 'Lingua',
  filter_reset: 'Azzera filtri',
  csv_export: 'Esporta CSV',
  csv_h_name: 'Nome', csv_h_game: 'Gioco', csv_h_type: 'Tipo', csv_h_condition: 'Condizione',
  csv_h_language: 'Lingua', csv_h_set: 'Set', csv_h_quantity: 'Quantità', csv_h_purchase: 'Prezzo acquisto',
  csv_h_value: 'Valore di mercato', csv_h_difference: 'Differenza', csv_h_source: 'Fonte valore',
  stats_byType: 'Per tipo',
  stats_byCondition: 'Per condizione',
  stats_topValue: 'Top per valore',
  stats_topGain: 'Top guadagni',
  stats_topLoss: 'Top perdite',
  stats_avgPerPiece: 'Valore medio per pezzo',
  stats_noCondition: 'Senza condizione',
```

- [ ] **Step 2: Add the same keys to the `en` dict**:

```ts
  sort_label: 'Sort by',
  sort_createdAt: 'Date added',
  sort_marketValue: 'Value',
  sort_difference: 'Difference',
  sort_name: 'Name',
  sort_game: 'Game',
  sort_quantity: 'Quantity',
  sort_dir: 'Reverse order',
  adv_toggle: 'Advanced filters',
  adv_minValue: 'Min value',
  adv_maxValue: 'Max value',
  adv_pl: 'P/L',
  adv_pl_all: 'All',
  adv_pl_gain: 'Gains',
  adv_pl_loss: 'Losses',
  adv_set: 'Set',
  adv_language: 'Language',
  filter_reset: 'Reset filters',
  csv_export: 'Export CSV',
  csv_h_name: 'Name', csv_h_game: 'Game', csv_h_type: 'Type', csv_h_condition: 'Condition',
  csv_h_language: 'Language', csv_h_set: 'Set', csv_h_quantity: 'Quantity', csv_h_purchase: 'Purchase price',
  csv_h_value: 'Market value', csv_h_difference: 'Difference', csv_h_source: 'Value source',
  stats_byType: 'By type',
  stats_byCondition: 'By condition',
  stats_topValue: 'Top by value',
  stats_topGain: 'Top gains',
  stats_topLoss: 'Top losses',
  stats_avgPerPiece: 'Average value per piece',
  stats_noCondition: 'No condition',
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm test` still green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): keys for sorting, advanced filters, CSV, stats"
```

---

### Task 6: FilterBar — advanced filters + reset

**Files:**
- Modify: `src/components/FilterBar.tsx`

**Interfaces:**
- Consumes: extended `Filters` (Task 2), i18n keys (Task 5).
- Produces: `FilterBar` renders an "Advanced filters" toggle; when open, extra controls update the same `Filters` via `onChange`. A "Reset filters" button calls `onChange({})`.

**Behavior (write full JSX):**
- Keep the existing props `{ filters: Filters; onChange: (f: Filters) => void }` and the existing basic controls (game/type/condition selects + search input).
- Add a small text button `t('adv_toggle')` that toggles a local `useState(false)` `open` flag (with an aria-expanded). When `open`, render a second row (`flex flex-wrap gap-2`) with:
  - Number input `adv_minValue` → `onChange({ ...filters, minValue: e.target.value === '' ? undefined : Number(e.target.value) })`.
  - Number input `adv_maxValue` → same with `maxValue`.
  - Select `adv_pl`: options `t('adv_pl_all')` (value '' → `pl: undefined`), `t('adv_pl_gain')` (`'gain'`), `t('adv_pl_loss')` (`'loss'`).
  - Text input `adv_set` → `setName` (`|| undefined`).
  - Text input `adv_language` → `language` (`|| undefined`).
  - Button `t('filter_reset')` → `onChange({})` and reset the inputs (since they are controlled from `filters`, clearing filters clears them).
- Style inputs like the existing ones (`rounded border border-border bg-card px-2 py-1 text-sm`, `aria-label` on each, `focus-visible:ring-2 focus-visible:ring-ring`). All controlled from `filters` (e.g. `value={filters.minValue ?? ''}`).
- No `any`. Keep empty-string → `undefined` so cleared fields drop out of `Filters`.

- [ ] **Step 1: Implement the advanced section + reset per the behavior above.**
- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean, `npm run lint` error-free, `npm test` green.
- [ ] **Step 3: Manual check** — on `/collezione`, open "Filtri avanzati", set a min value / P/L gain, confirm the list and totals narrow; "Azzera filtri" restores everything.
- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat: advanced filters (value range, P/L, set, language) + reset in FilterBar"
```

---

### Task 7: CollectionView — sorting controls + CSV export

**Files:**
- Modify: `src/components/CollectionView.tsx`

**Interfaces:**
- Consumes: `sortItems`, `Sort`, `SortKey` (Task 1), extended `filterItems` (Task 2), `itemsToCsv`/`CsvItem`/`CsvLabels` (Task 4), `CONDITION_LABELS` + `useT` (i18n), i18n keys (Task 5).
- Produces: sorted+filtered `visible` list; a sort `<select>` + direction toggle; an "Esporta CSV" button.

**Behavior (write full JSX/handlers):**
- Add state: `const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' })`.
- Compute: `const visible = sortItems(filterItems(items, filters), sort)`. `const totals = collectionTotals(visible)` (unchanged — totals reflect the filtered+sorted set; sort doesn't change totals).
- Sort UI (near the Galleria/Tabella + Aggiungi controls): a `<select aria-label={t('sort_label')}>` with options for each `SortKey` using labels `t('sort_'+key)` (i.e. `sort_createdAt`, `sort_marketValue`, `sort_difference`, `sort_name`, `sort_game`, `sort_quantity`) → `setSort((s) => ({ ...s, key: e.target.value as SortKey }))`; and a button (aria-label `t('sort_dir')`) showing ↑/↓ that toggles `dir` → `setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))`. Style like the existing toggles.
- Export CSV button `t('csv_export')` next to Aggiungi:
  - Build labels once:
    ```ts
    const GKEYS = ['POKEMON','MAGIC','YUGIOH','ONEPIECE','OTHER']
    const TKEYS = ['RAW','GRADED','SEALED']
    const CKEYS = ['POOR','PLAYED','LIGHT_PLAYED','GOOD','EXCELLENT','NEAR_MINT','MINT']
    const csvLabels: CsvLabels = {
      game: Object.fromEntries(GKEYS.map((k) => [k, t('game_' + k)])),
      itemType: Object.fromEntries(TKEYS.map((k) => [k, t('type_' + k)])),
      condition: Object.fromEntries(CKEYS.map((k) => [k, CONDITION_LABELS[k]])),
      headers: ['csv_h_name','csv_h_game','csv_h_type','csv_h_condition','csv_h_language','csv_h_set','csv_h_quantity','csv_h_purchase','csv_h_value','csv_h_difference','csv_h_source'].map((k) => t(k)),
    }
    ```
  - On click: `const csv = itemsToCsv(visible.map((i) => ({ name: i.name, game: i.game, itemType: i.itemType, condition: i.condition, language: i.language, setName: i.setName, quantity: i.quantity, purchasePrice: i.purchasePrice, marketValue: i.marketValue, marketValueSource: i.marketValueSource })), csvLabels)` then download:
    ```ts
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tcg-archive-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    ```
- `PlainItem` already has all fields above; `visible` is `PlainItem[]` (generic `sortItems`/`filterItems` preserve the type — no cast).
- No `any`. Keep the existing modal/delete/confirm wiring intact.

- [ ] **Step 1: Implement sort state + controls, apply `sortItems`, and the CSV export button/handler.**
- [ ] **Step 2: Verify** — tsc clean, lint error-free, `npm test` green.
- [ ] **Step 3: Manual check** — sort by Valore/Differenza and toggle direction (both gallery + table reorder); click "Esporta CSV" and confirm a `tcg-archive-<date>.csv` downloads with the visible rows and translated headers; opening it in a spreadsheet shows correct columns (BOM → accents OK).
- [ ] **Step 4: Commit**

```bash
git add src/components/CollectionView.tsx
git commit -m "feat: sorting controls and CSV export in collection"
```

---

### Task 8: Dashboard — extra statistics

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `groupTotals`, `topByValue`, `topByDifference`, `averageValuePerPiece` (Task 3), `collectionTotals`, `formatEUR`, `Money`, `SummaryCard`, `GameBadge`, i18n keys (Task 5), `useT`, `ITEM_TYPE` via `t('type_'+k)`, `CONDITION_LABELS`.
- Produces: new dashboard sections.

**Behavior (write full JSX):**
- Add after the existing "Per gioco" section, reusing the same card styling:
  - **`stats_avgPerPiece`** as an extra `SummaryCard` in the secondary stats grid: `formatEUR(averageValuePerPiece(items))`.
  - **`stats_byType`**: `groupTotals(items, (i) => i.itemType ?? '')` → for each, a card showing `t('type_'+key)`, count, `formatEUR(totals.totalValue)` and `<Money value={totals.profitLoss} signed />`. Reuse the per-game card layout (`grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3`).
  - **`stats_byCondition`**: `groupTotals(items, (i) => i.condition ?? '')`; label `key ? CONDITION_LABELS[key] : t('stats_noCondition')`; same card layout.
  - **`stats_topValue`**: `topByValue(items, 5)` → a list, each row: name (+ `<GameBadge game={i.game} />`) and `formatEUR(i.marketValue * i.quantity)`.
  - **`stats_topGain`**: `topByDifference(items, 5, 'desc')` and **`stats_topLoss`**: `topByDifference(items, 5, 'asc')` → lists with name and `<Money value={itemDifference(i)} signed />` (import `itemDifference`). Only render the loss list rows that are actually negative and the gain rows that are positive (filter to avoid showing a "top gain" that is really a loss when the collection is tiny): e.g. `topByDifference(items,5,'desc').filter((i)=>itemDifference(i) > 0)` and `...'asc').filter((i)=>itemDifference(i) < 0)`.
- Each new section under a small uppercase heading like the existing "PER GIOCO" (`text-xs font-medium uppercase tracking-wider text-muted mb-3`), and only rendered when it has rows.
- Keep the empty-state (no items) and refresh section unchanged. No `any`.

- [ ] **Step 1: Implement the extra stats sections per the behavior above.**
- [ ] **Step 2: Verify** — tsc clean, lint error-free, `npm test` green.
- [ ] **Step 3: Manual check** — with several items of mixed type/condition and gains/losses, the dashboard shows Per tipo / Per condizione breakdowns, Top per valore, Top guadagni/perdite, and Valore medio per pezzo; numbers match the collection.
- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: extra dashboard statistics (by type/condition, top lists, avg/piece)"
```

---

## Self-Review

**Spec coverage:**
- Ordinamenti → Task 1 (`sortItems`) + Task 7 (UI). Default createdAt desc ✓.
- Filtri avanzati (range valore, P/L, set, lingua, reset) → Task 2 (`filterItems`) + Task 6 (UI) ✓.
- Export CSV (campi, quoting, BOM, set filtrato+ordinato) → Task 4 (`itemsToCsv`) + Task 7 (download) ✓.
- Statistiche extra (per tipo/condizione, top valore, top guadagno/perdita, media per pezzo) → Task 3 + Task 8 ✓.
- i18n IT/EN per tutte le etichette → Task 5 + used throughout ✓.
- Testing funzioni pure → Tasks 1–4 tests ✓.

**Placeholder scan:** Pure-function tasks (1–4) and i18n (5) contain complete code. UI tasks (6–8) describe exact state, handlers, classes, and key snippets (CSV labels/download). No "TBD"/"handle edge cases".

**Type consistency:** `Sort`/`SortKey`/`SortDir` consistent (Tasks 1,7). Extended `Filters` consistent (Tasks 2,6). `CsvItem`/`CsvLabels`/`itemsToCsv` consistent (Tasks 4,7). `groupTotals`/`topByValue`/`topByDifference`/`averageValuePerPiece` consistent (Tasks 3,8). `ValueItem` extended once (Task 1) with `language?`/`createdAt?` used by Tasks 2,3. Generic `<T extends ValueItem>` preserves `PlainItem` so no casts in UI.
