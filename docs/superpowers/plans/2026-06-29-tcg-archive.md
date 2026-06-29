# TCG Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive web app to manage a TCG collection (raw cards, graded, sealed, multi-game) with quantity, purchase price, condition, automatic market value for Pokémon raw cards, per-item profit/loss, and filterable collection totals.

**Architecture:** Next.js (App Router, TypeScript) full-stack app. Prisma ORM over SQLite (dev) → Postgres-ready. Pure functions for value math (unit-tested). A pluggable `PriceProvider` abstraction with a `PokemonTcgIoProvider` (auto) and `ManualProvider` (no-op). Server-side API routes proxy pokemontcg.io so the API key never reaches the browser. Tailwind CSS, mobile-first UI.

**Tech Stack:** Next.js 15+ (App Router), TypeScript, Prisma, SQLite, Tailwind CSS, Zod, Vitest, Playwright.

## Global Constraints

- Language of UI copy: **Italian**.
- Single-user now, but every `Item` references a `User` (`userId`) — multi-user-ready schema. A default user is seeded.
- pokemontcg.io API key lives **only** in server env (`POKEMONTCGIO_API_KEY`), never imported in client components.
- Market value = `cardmarket.lowPrice` from the API for Pokémon RAW with an `externalId`; everything else is `MANUAL`.
- No continuous polling of the price API — refresh on insert + explicit "Aggiorna valori" button only.
- All currency amounts are EUR, stored as `Float` in SQLite, formatted to 2 decimals in UI.
- Money math lives in pure functions in `src/lib/value.ts`; never inline totals in components.
- After each task, append a dated entry to `docs/PROGRESS.md`.

---

### Task 1: Project scaffolding (Next.js + Tailwind + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `vitest.config.ts`, `src/lib/__tests__/smoke.test.ts`, `.env.example`, `docs/PROGRESS.md`

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a passing test runner (`npm test`).

- [ ] **Step 1: Scaffold the app non-interactively**

```bash
cd "/Users/mac/Documents/PersonaleGB/TCG Archive"
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm --yes
```

If the directory-not-empty prompt blocks it, scaffold in a temp dir and copy over, preserving `docs/`, `.git/`, `.gitignore`.

- [ ] **Step 2: Add test + validation deps**

```bash
npm install zod
npm install -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

- [ ] **Step 4: Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts**

- [ ] **Step 5: Write a smoke test** — `src/lib/__tests__/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 6: Run it** — `npm test` → Expected: PASS.

- [ ] **Step 7: Create `.env.example`**

```
DATABASE_URL="file:./dev.db"
POKEMONTCGIO_API_KEY=""
```

- [ ] **Step 8: Create `docs/PROGRESS.md`**

```md
# TCG Archive — Avanzamento

| Data | Task | Esito | Note |
|------|------|-------|------|
| 2026-06-29 | Task 1 scaffolding | OK | Next.js + Tailwind + Vitest |
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Tailwind and Vitest"
```

---

### Task 2: Prisma schema, migration, seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`
- Modify: `package.json` (prisma seed config + scripts), `.env`

**Interfaces:**
- Produces: Prisma client at `@/lib/db` (`export const prisma`); enums `Game`, `ItemType`, `Condition`, `GradingCompany`, `ValueSource`; models `User`, `Item`. A seeded default user with a stable id `"default-user"`.

- [ ] **Step 1: Install Prisma**

```bash
npm install @prisma/client && npm install -D prisma tsx
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

enum Game { POKEMON MAGIC YUGIOH ONEPIECE OTHER }
enum ItemType { RAW GRADED SEALED }
enum Condition { POOR PLAYED LIGHT_PLAYED GOOD EXCELLENT NEAR_MINT MINT }
enum GradingCompany { PSA BGS CGC }
enum ValueSource { AUTO MANUAL }

model User {
  id    String @id @default(cuid())
  email String? @unique
  name  String?
  items Item[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Item {
  id        String @id @default(cuid())
  user      User   @relation(fields: [userId], references: [id])
  userId    String
  game      Game
  itemType  ItemType
  name      String
  setName   String?
  cardNumber String?
  language  String?
  externalId String?
  imageUrl  String?
  condition Condition?
  gradingCompany GradingCompany?
  grade     String?
  quantity  Int @default(1)
  purchasePrice Float @default(0)
  marketValue   Float @default(0)
  marketValueSource ValueSource @default(MANUAL)
  marketValueUpdatedAt DateTime?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

- [ ] **Step 3: Create `src/lib/db.ts`**

```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Write `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: { id: 'default-user', name: 'Default' },
  })
}
main().finally(() => prisma.$disconnect())
```

- [ ] **Step 5: Add to `package.json`**

```json
"prisma": { "seed": "tsx prisma/seed.ts" },
"scripts": { "db:migrate": "prisma migrate dev", "db:seed": "prisma db seed" }
```

- [ ] **Step 6: Run migration + seed**

```bash
npx prisma migrate dev --name init && npm run db:seed
```
Expected: migration applied, `dev.db` created, default user upserted.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Prisma schema, client, and seed"
```

---

### Task 3: Value calculation logic (pure functions, TDD)

**Files:**
- Create: `src/lib/value.ts`, `src/lib/__tests__/value.test.ts`

**Interfaces:**
- Produces:
  - `type ValueItem = { quantity: number; purchasePrice: number; marketValue: number; game?: string; itemType?: string; condition?: string | null; setName?: string | null; name?: string }`
  - `itemDifference(item: ValueItem): number` → `(marketValue - purchasePrice) * quantity`
  - `type Totals = { totalValue: number; totalCost: number; profitLoss: number; itemCount: number; pieceCount: number }`
  - `collectionTotals(items: ValueItem[]): Totals`
  - `type Filters = { game?: string; itemType?: string; condition?: string; setName?: string; search?: string }`
  - `filterItems(items: ValueItem[], filters: Filters): ValueItem[]`

- [ ] **Step 1: Write the failing tests** — `src/lib/__tests__/value.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { itemDifference, collectionTotals, filterItems } from '@/lib/value'

const A = { quantity: 2, purchasePrice: 5, marketValue: 8, game: 'POKEMON', itemType: 'RAW', condition: 'MINT', setName: 'Base', name: 'Charizard' }
const B = { quantity: 1, purchasePrice: 20, marketValue: 15, game: 'MAGIC', itemType: 'SEALED', condition: null, setName: 'Alpha', name: 'Box' }

describe('itemDifference', () => {
  it('multiplies the per-unit delta by quantity', () => {
    expect(itemDifference(A)).toBe(6)   // (8-5)*2
    expect(itemDifference(B)).toBe(-5)  // (15-20)*1
  })
})

describe('collectionTotals', () => {
  it('sums value, cost, P/L and counts', () => {
    const t = collectionTotals([A, B])
    expect(t.totalValue).toBe(31)  // 8*2 + 15*1
    expect(t.totalCost).toBe(30)   // 5*2 + 20*1
    expect(t.profitLoss).toBe(1)
    expect(t.itemCount).toBe(2)
    expect(t.pieceCount).toBe(3)
  })
  it('returns zeros for empty input', () => {
    expect(collectionTotals([])).toEqual({ totalValue: 0, totalCost: 0, profitLoss: 0, itemCount: 0, pieceCount: 0 })
  })
})

describe('filterItems', () => {
  it('filters by game', () => { expect(filterItems([A, B], { game: 'POKEMON' })).toEqual([A]) })
  it('filters by free-text search on name/set, case-insensitive', () => {
    expect(filterItems([A, B], { search: 'chari' })).toEqual([A])
    expect(filterItems([A, B], { search: 'alpha' })).toEqual([B])
  })
  it('returns all when no filters', () => { expect(filterItems([A, B], {})).toHaveLength(2) })
})
```

- [ ] **Step 2: Run → FAIL** (`npm test`) — module not found.

- [ ] **Step 3: Implement `src/lib/value.ts`**

```ts
export type ValueItem = {
  quantity: number; purchasePrice: number; marketValue: number
  game?: string; itemType?: string; condition?: string | null
  setName?: string | null; name?: string
}
export function itemDifference(i: ValueItem): number {
  return (i.marketValue - i.purchasePrice) * i.quantity
}
export type Totals = { totalValue: number; totalCost: number; profitLoss: number; itemCount: number; pieceCount: number }
export function collectionTotals(items: ValueItem[]): Totals {
  const t = items.reduce((acc, i) => {
    acc.totalValue += i.marketValue * i.quantity
    acc.totalCost += i.purchasePrice * i.quantity
    acc.pieceCount += i.quantity
    return acc
  }, { totalValue: 0, totalCost: 0, pieceCount: 0 })
  return { ...t, profitLoss: t.totalValue - t.totalCost, itemCount: items.length }
}
export type Filters = { game?: string; itemType?: string; condition?: string; setName?: string; search?: string }
export function filterItems(items: ValueItem[], f: Filters): ValueItem[] {
  return items.filter((i) => {
    if (f.game && i.game !== f.game) return false
    if (f.itemType && i.itemType !== f.itemType) return false
    if (f.condition && i.condition !== f.condition) return false
    if (f.setName && i.setName !== f.setName) return false
    if (f.search) {
      const q = f.search.toLowerCase()
      const hay = `${i.name ?? ''} ${i.setName ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add value calculation pure functions with tests"
```

---

### Task 4: Pricing provider abstraction (TDD with mocked fetch)

**Files:**
- Create: `src/lib/pricing/types.ts`, `src/lib/pricing/pokemonTcgIo.ts`, `src/lib/pricing/manual.ts`, `src/lib/pricing/index.ts`, `src/lib/pricing/__tests__/pokemonTcgIo.test.ts`

**Interfaces:**
- Produces:
  - `type PriceInput = { game: string; itemType: string; externalId?: string | null }`
  - `type PriceResult = { value: number; source: 'AUTO' | 'MANUAL' }`
  - `interface PriceProvider { supports(i: PriceInput): boolean; fetchPrice(i: PriceInput): Promise<PriceResult | null> }`
  - `pickProvider(i: PriceInput): PriceProvider`
  - `class PokemonTcgIoProvider` — supports POKEMON+RAW+externalId; fetches `GET https://api.pokemontcg.io/v2/cards/{id}`, returns `cardmarket.prices.lowPrice` as AUTO; `null` on missing price.

- [ ] **Step 1: Write the failing test** — `src/lib/pricing/__tests__/pokemonTcgIo.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { PokemonTcgIoProvider } from '@/lib/pricing/pokemonTcgIo'
import { pickProvider } from '@/lib/pricing'

afterEach(() => vi.restoreAllMocks())

describe('PokemonTcgIoProvider', () => {
  const p = new PokemonTcgIoProvider('key')
  it('supports only Pokémon raw with externalId', () => {
    expect(p.supports({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' })).toBe(true)
    expect(p.supports({ game: 'POKEMON', itemType: 'RAW', externalId: null })).toBe(false)
    expect(p.supports({ game: 'MAGIC', itemType: 'RAW', externalId: 'x' })).toBe(false)
  })
  it('returns lowPrice as AUTO', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { cardmarket: { prices: { lowPrice: 3.5, trendPrice: 4 } } }
    }), { status: 200 }))
    expect(await p.fetchPrice({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' }))
      .toEqual({ value: 3.5, source: 'AUTO' })
  })
  it('returns null when no cardmarket price', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { cardmarket: null } }), { status: 200 }))
    expect(await p.fetchPrice({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' })).toBeNull()
  })
})

describe('pickProvider', () => {
  it('returns manual for non-Pokémon-raw', () => {
    const r = pickProvider({ game: 'MAGIC', itemType: 'SEALED', externalId: null })
    expect(r.supports({ game: 'MAGIC', itemType: 'SEALED', externalId: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/pricing/types.ts`**

```ts
export type PriceInput = { game: string; itemType: string; externalId?: string | null }
export type PriceResult = { value: number; source: 'AUTO' | 'MANUAL' }
export interface PriceProvider {
  supports(i: PriceInput): boolean
  fetchPrice(i: PriceInput): Promise<PriceResult | null>
}
```

- [ ] **Step 4: Implement `src/lib/pricing/pokemonTcgIo.ts`**

```ts
import type { PriceProvider, PriceInput, PriceResult } from './types'

export class PokemonTcgIoProvider implements PriceProvider {
  constructor(private apiKey?: string) {}
  supports(i: PriceInput): boolean {
    return i.game === 'POKEMON' && i.itemType === 'RAW' && !!i.externalId
  }
  async fetchPrice(i: PriceInput): Promise<PriceResult | null> {
    if (!this.supports(i)) return null
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${i.externalId}`, {
      headers: this.apiKey ? { 'X-Api-Key': this.apiKey } : {},
    })
    if (!res.ok) return null
    const json = await res.json()
    const low = json?.data?.cardmarket?.prices?.lowPrice
    if (typeof low !== 'number' || low <= 0) return null
    return { value: low, source: 'AUTO' }
  }
}
```

- [ ] **Step 5: Implement `src/lib/pricing/manual.ts`**

```ts
import type { PriceProvider, PriceInput, PriceResult } from './types'
export class ManualProvider implements PriceProvider {
  supports(): boolean { return false }
  async fetchPrice(_i: PriceInput): Promise<PriceResult | null> { return null }
}
```

- [ ] **Step 6: Implement `src/lib/pricing/index.ts`**

```ts
import type { PriceInput, PriceProvider } from './types'
import { PokemonTcgIoProvider } from './pokemonTcgIo'
import { ManualProvider } from './manual'

export * from './types'
export { PokemonTcgIoProvider } from './pokemonTcgIo'
export { ManualProvider } from './manual'

export function pickProvider(i: PriceInput): PriceProvider {
  const pkmn = new PokemonTcgIoProvider(process.env.POKEMONTCGIO_API_KEY)
  return pkmn.supports(i) ? pkmn : new ManualProvider()
}
```

- [ ] **Step 7: Run → PASS.**

- [ ] **Step 8: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add pluggable pricing providers with tests"
```

---

### Task 5: Card search API route (proxy to pokemontcg.io)

**Files:**
- Create: `src/lib/pricing/search.ts`, `src/app/api/cards/search/route.ts`, `src/lib/pricing/__tests__/search.test.ts`

**Interfaces:**
- Produces:
  - `type CardSearchResult = { externalId: string; name: string; setName: string; cardNumber: string; imageUrl: string | null; lowPrice: number | null }`
  - `searchPokemonCards(q: string, apiKey?: string): Promise<CardSearchResult[]>`
  - `GET /api/cards/search?q=` → `{ results: CardSearchResult[] }`

- [ ] **Step 1: Write the failing test** — `src/lib/pricing/__tests__/search.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPokemonCards } from '@/lib/pricing/search'
afterEach(() => vi.restoreAllMocks())

it('maps API cards to search results', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    data: [{ id: 'xy1-1', name: 'Venusaur', number: '1', set: { name: 'XY' },
      images: { small: 'http://img/1.png' }, cardmarket: { prices: { lowPrice: 2.2 } } }]
  }), { status: 200 }))
  const r = await searchPokemonCards('venu', 'key')
  expect(r).toEqual([{ externalId: 'xy1-1', name: 'Venusaur', setName: 'XY', cardNumber: '1', imageUrl: 'http://img/1.png', lowPrice: 2.2 }])
})

it('returns [] for blank query', async () => {
  expect(await searchPokemonCards('  ')).toEqual([])
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/pricing/search.ts`**

```ts
export type CardSearchResult = {
  externalId: string; name: string; setName: string
  cardNumber: string; imageUrl: string | null; lowPrice: number | null
}
export async function searchPokemonCards(q: string, apiKey?: string): Promise<CardSearchResult[]> {
  const term = q.trim()
  if (!term) return []
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(term)}*"&pageSize=20&orderBy=-set.releaseDate`
  const res = await fetch(url, { headers: apiKey ? { 'X-Api-Key': apiKey } : {} })
  if (!res.ok) return []
  const json = await res.json()
  const data: any[] = json?.data ?? []
  return data.map((c) => ({
    externalId: c.id,
    name: c.name,
    setName: c.set?.name ?? '',
    cardNumber: c.number ?? '',
    imageUrl: c.images?.small ?? null,
    lowPrice: typeof c.cardmarket?.prices?.lowPrice === 'number' ? c.cardmarket.prices.lowPrice : null,
  }))
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement `src/app/api/cards/search/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { searchPokemonCards } from '@/lib/pricing/search'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchPokemonCards(q, process.env.POKEMONTCGIO_API_KEY)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Ricerca non disponibile' }, { status: 502 })
  }
}
```

- [ ] **Step 6: Manual check** — `npm run dev`, visit `/api/cards/search?q=pikachu` → JSON with results (needs API key in `.env`; without key the API still works at lower rate).

- [ ] **Step 7: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add card search proxy route"
```

---

### Task 6: Item CRUD + Zod validation (API routes)

**Files:**
- Create: `src/lib/itemSchema.ts`, `src/app/api/items/route.ts`, `src/app/api/items/[id]/route.ts`, `src/lib/__tests__/itemSchema.test.ts`
- Constant: use `userId = 'default-user'` everywhere (single-user now).

**Interfaces:**
- Produces:
  - `itemInputSchema` (Zod) and `type ItemInput = z.infer<typeof itemInputSchema>`
  - `GET /api/items` → `{ items: Item[] }` (newest first)
  - `POST /api/items` → creates, returns `{ item }`
  - `PUT /api/items/[id]` → updates, returns `{ item }`
  - `DELETE /api/items/[id]` → `{ ok: true }`
- Consumes: `pickProvider` (Task 4), `prisma` (Task 2).

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/itemSchema.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { itemInputSchema } from '@/lib/itemSchema'

it('accepts a minimal valid item', () => {
  const r = itemInputSchema.safeParse({ game: 'POKEMON', itemType: 'RAW', name: 'Pikachu', quantity: 1, purchasePrice: 1, marketValue: 2 })
  expect(r.success).toBe(true)
})
it('rejects bad enum + negative qty', () => {
  expect(itemInputSchema.safeParse({ game: 'NOPE', itemType: 'RAW', name: 'x', quantity: -1, purchasePrice: 0, marketValue: 0 }).success).toBe(false)
})
it('requires a non-empty name', () => {
  expect(itemInputSchema.safeParse({ game: 'POKEMON', itemType: 'RAW', name: '', quantity: 1, purchasePrice: 0, marketValue: 0 }).success).toBe(false)
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/itemSchema.ts`**

```ts
import { z } from 'zod'
export const itemInputSchema = z.object({
  game: z.enum(['POKEMON', 'MAGIC', 'YUGIOH', 'ONEPIECE', 'OTHER']),
  itemType: z.enum(['RAW', 'GRADED', 'SEALED']),
  name: z.string().min(1),
  setName: z.string().optional().nullable(),
  cardNumber: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  condition: z.enum(['POOR','PLAYED','LIGHT_PLAYED','GOOD','EXCELLENT','NEAR_MINT','MINT']).optional().nullable(),
  gradingCompany: z.enum(['PSA','BGS','CGC']).optional().nullable(),
  grade: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  purchasePrice: z.number().min(0),
  marketValue: z.number().min(0),
  marketValueSource: z.enum(['AUTO','MANUAL']).default('MANUAL'),
  notes: z.string().optional().nullable(),
})
export type ItemInput = z.infer<typeof itemInputSchema>
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement `src/app/api/items/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { itemInputSchema } from '@/lib/itemSchema'

const USER_ID = 'default-user'

export async function GET() {
  const items = await prisma.item.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = itemInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  const item = await prisma.item.create({
    data: { ...d, userId: USER_ID, marketValueUpdatedAt: d.marketValueSource === 'AUTO' ? new Date() : null },
  })
  return NextResponse.json({ item }, { status: 201 })
}
```

- [ ] **Step 6: Implement `src/app/api/items/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { itemInputSchema } from '@/lib/itemSchema'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = itemInputSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const item = await prisma.item.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ item })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.item.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Manual check** — POST via curl creates an item; GET returns it.

```bash
curl -s -X POST localhost:3000/api/items -H 'content-type: application/json' \
  -d '{"game":"POKEMON","itemType":"RAW","name":"Pikachu","quantity":1,"purchasePrice":1,"marketValue":2}' | head
```

- [ ] **Step 8: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add item CRUD API with Zod validation"
```

---

### Task 7: Price refresh API route (batch on AUTO items)

**Files:**
- Create: `src/app/api/prices/refresh/route.ts`

**Interfaces:**
- Produces: `POST /api/prices/refresh` → `{ updated: number; failed: number }`. For each `Item` with `marketValueSource = AUTO` and an `externalId`, calls `pickProvider().fetchPrice`; on success updates `marketValue` + `marketValueUpdatedAt`; on `null` leaves the last known value untouched.
- Consumes: `prisma` (Task 2), `pickProvider` (Task 4).

- [ ] **Step 1: Implement `src/app/api/prices/refresh/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickProvider } from '@/lib/pricing'

const USER_ID = 'default-user'

export async function POST() {
  const items = await prisma.item.findMany({
    where: { userId: USER_ID, marketValueSource: 'AUTO', externalId: { not: null } },
  })
  let updated = 0, failed = 0
  for (const it of items) {
    try {
      const r = await pickProvider({ game: it.game, itemType: it.itemType, externalId: it.externalId })
        .fetchPrice({ game: it.game, itemType: it.itemType, externalId: it.externalId })
      if (r) {
        await prisma.item.update({ where: { id: it.id }, data: { marketValue: r.value, marketValueUpdatedAt: new Date() } })
        updated++
      } else { failed++ }
    } catch { failed++ }
  }
  return NextResponse.json({ updated, failed })
}
```

- [ ] **Step 2: Manual check** — create an AUTO Pokémon item with a real `externalId` (e.g. `base1-4` Charizard), POST `/api/prices/refresh`, confirm `marketValue` changes.

- [ ] **Step 3: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add batch price refresh route"
```

---

### Task 8: Shared UI utilities + app shell

**Files:**
- Create: `src/lib/format.ts`, `src/lib/labels.ts`, `src/components/Money.tsx`, `src/lib/__tests__/format.test.ts`
- Modify: `src/app/layout.tsx` (Italian metadata, nav shell)

**Interfaces:**
- Produces:
  - `formatEUR(n: number): string` → e.g. `"€ 8,00"`
  - `GAME_LABELS`, `ITEM_TYPE_LABELS`, `CONDITION_LABELS` (record maps enum → Italian label)
  - `<Money value={n} signed?={boolean} />` — green if ≥0, red if <0 when `signed`.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/format.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { formatEUR } from '@/lib/format'
it('formats EUR with 2 decimals, comma separator', () => {
  expect(formatEUR(8)).toBe('€ 8,00')
  expect(formatEUR(-5.5)).toBe('-€ 5,50')
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/format.ts`**

```ts
export function formatEUR(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}€ ${abs}`
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement `src/lib/labels.ts`**

```ts
export const GAME_LABELS: Record<string, string> = { POKEMON: 'Pokémon', MAGIC: 'Magic', YUGIOH: 'Yu-Gi-Oh!', ONEPIECE: 'One Piece', OTHER: 'Altro' }
export const ITEM_TYPE_LABELS: Record<string, string> = { RAW: 'Carta', GRADED: 'Gradata', SEALED: 'Sealed' }
export const CONDITION_LABELS: Record<string, string> = { POOR: 'Poor', PLAYED: 'Played', LIGHT_PLAYED: 'Light Played', GOOD: 'Good', EXCELLENT: 'Excellent', NEAR_MINT: 'Near Mint', MINT: 'Mint' }
```

- [ ] **Step 6: Implement `src/components/Money.tsx`**

```tsx
import { formatEUR } from '@/lib/format'
export function Money({ value, signed = false }: { value: number; signed?: boolean }) {
  const cls = signed ? (value >= 0 ? 'text-emerald-600' : 'text-red-600') : ''
  const text = signed && value > 0 ? `+${formatEUR(value)}` : formatEUR(value)
  return <span className={cls}>{text}</span>
}
```

- [ ] **Step 7: Update `src/app/layout.tsx`** — set `lang="it"`, title "TCG Archive", and a top nav with links to `/` (Dashboard) and `/collezione`. Keep Tailwind body classes.

- [ ] **Step 8: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add formatting, labels, Money component, app shell"
```

---

### Task 9: Collection page (list + filters + totals)

**Files:**
- Create: `src/app/collezione/page.tsx` (server component: fetch items), `src/components/CollectionView.tsx` (client: filters + table/grid + totals bar), `src/components/FilterBar.tsx`
- Consumes: `prisma`, `filterItems`/`collectionTotals` (Task 3), `Money`, labels/format (Task 8), `itemDifference` (Task 3).

**Interfaces:**
- Produces: a responsive collection screen. Desktop ≥`md`: table. Mobile: stacked cards. A sticky totals bar shows `collectionTotals` of the **filtered** set. Each row shows name/set, game/type/condition badges, qty, purchase, market value, difference (signed), and Edit/Delete buttons (wired in Task 10).

- [ ] **Step 1: Implement `src/app/collezione/page.tsx`**

```tsx
import { prisma } from '@/lib/db'
import { CollectionView } from '@/components/CollectionView'
export const dynamic = 'force-dynamic'
export default async function Page() {
  const items = await prisma.item.findMany({ where: { userId: 'default-user' }, orderBy: { createdAt: 'desc' } })
  return <CollectionView initialItems={JSON.parse(JSON.stringify(items))} />
}
```

- [ ] **Step 2: Implement `src/components/FilterBar.tsx`** — controlled selects for game, itemType, condition + a text input for search; calls `onChange(filters)`. Use `GAME_LABELS`, `ITEM_TYPE_LABELS`, `CONDITION_LABELS`. Tailwind: `flex flex-wrap gap-2`, inputs `rounded border px-2 py-1`.

- [ ] **Step 3: Implement `src/components/CollectionView.tsx`** (client component)

Key behaviors (write full JSX):
- `const [items, setItems] = useState(initialItems)` and `const [filters, setFilters] = useState({})`.
- `const visible = filterItems(items, filters)`; `const totals = collectionTotals(visible)`.
- Render `<FilterBar onChange={setFilters} />`, a totals bar (`Valore`, `Costo`, `P/L` via `<Money signed>`, `Pezzi`), then:
  - Desktop table (`hidden md:table w-full`) with columns: Articolo, Gioco, Tipo, Cond., Qtà, Acquisto, Valore, Differenza, Azioni.
  - Mobile cards (`md:hidden` list) with the same fields stacked.
- Difference per row = `itemDifference(item)` rendered with `<Money signed />`.
- "Aggiungi" button and Edit/Delete buttons are placeholders here; Task 10 wires the modal + calls.

- [ ] **Step 4: Manual check** — seed 2–3 items via API, load `/collezione`, verify totals update when filtering, and that layout collapses to cards on a narrow viewport.

- [ ] **Step 5: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add collection page with filters and live totals"
```

---

### Task 10: Add/Edit item modal (with Pokémon card search)

**Files:**
- Create: `src/components/ItemFormModal.tsx`, `src/components/CardSearch.tsx`
- Modify: `src/components/CollectionView.tsx` (open modal, optimistic refresh, delete call)

**Interfaces:**
- Produces:
  - `<CardSearch onPick={(r: CardSearchResult) => void} />` — debounced fetch to `/api/cards/search?q=`, renders results with thumbnail/set/number; on pick passes the result up.
  - `<ItemFormModal item?={Item} onClose() onSaved(item) />` — full form. When game=POKEMON & type=RAW, shows `<CardSearch>` that prefills name/set/number/imageUrl/externalId/marketValue and sets `marketValueSource='AUTO'`. Other combinations show manual fields (grading fields when GRADED). Submits to `POST /api/items` or `PUT /api/items/[id]`.
- Consumes: `itemInputSchema` shape (Task 6), `searchPokemonCards` results via the route (Task 5), `CONDITION_LABELS` etc.

- [ ] **Step 1: Implement `src/components/CardSearch.tsx`** — input with `useState(query)`, `useEffect` debounce (300ms) → `fetch('/api/cards/search?q='+encodeURIComponent(query))`, render `results` list; clicking an item calls `onPick(result)`.

- [ ] **Step 2: Implement `src/components/ItemFormModal.tsx`**

Behaviors (write full JSX + handlers):
- Local form state seeded from `item` or defaults (`game:'POKEMON', itemType:'RAW', quantity:1, purchasePrice:0, marketValue:0, marketValueSource:'MANUAL'`).
- If `game==='POKEMON' && itemType==='RAW'`: render `<CardSearch onPick={...}>` that sets name/setName/cardNumber/imageUrl/externalId, sets `marketValue = pick.lowPrice ?? 0`, `marketValueSource='AUTO'`.
- If `itemType==='GRADED'`: show `gradingCompany` select + `grade` input; market value manual.
- Always: condition select (for RAW), quantity, purchasePrice, marketValue, notes.
- On submit: `fetch(item ? PUT : POST, { method, body: JSON.stringify(form) })`; on ok call `onSaved(json.item)`.
- Modal styling: fixed overlay `bg-black/40`, centered panel `max-w-lg w-full rounded-lg bg-white p-4`, scrollable on mobile.

- [ ] **Step 3: Wire into `CollectionView.tsx`** — `Aggiungi` opens modal with no item; row `Modifica` opens with that item; `onSaved` updates `items` state (replace or prepend); `Elimina` calls `DELETE /api/items/[id]` then removes from state.

- [ ] **Step 4: Manual check** — Add a Pokémon raw card via search (value auto-fills), add a sealed item manually, edit one, delete one. Confirm totals update.

- [ ] **Step 5: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add item form modal with Pokémon card search"
```

---

### Task 11: Dashboard (summary + refresh button)

**Files:**
- Create: `src/app/page.tsx` (replace default), `src/components/Dashboard.tsx`, `src/components/SummaryCard.tsx`
- Consumes: `prisma`, `collectionTotals` (Task 3), `Money`, `GAME_LABELS`.

**Interfaces:**
- Produces: home dashboard with summary cards (Valore totale, Costo totale, P/L, N. articoli, Pezzi), a per-game breakdown, and an **"Aggiorna valori"** button that POSTs `/api/prices/refresh` then refreshes.

- [ ] **Step 1: Implement `src/components/SummaryCard.tsx`** — `{ label, children }` → card `rounded-lg border p-4` with label + big value.

- [ ] **Step 2: Implement `src/app/page.tsx`**

```tsx
import { prisma } from '@/lib/db'
import { Dashboard } from '@/components/Dashboard'
export const dynamic = 'force-dynamic'
export default async function Home() {
  const items = await prisma.item.findMany({ where: { userId: 'default-user' } })
  return <Dashboard items={JSON.parse(JSON.stringify(items))} />
}
```

- [ ] **Step 3: Implement `src/components/Dashboard.tsx`** (client) — compute `collectionTotals(items)`; render `SummaryCard`s in `grid gap-4 grid-cols-2 md:grid-cols-5`; per-game breakdown via grouping; "Aggiorna valori" button → `setLoading`, `await fetch('/api/prices/refresh', {method:'POST'})`, then `location.reload()`. Show last-updated hint.

- [ ] **Step 4: Manual check** — dashboard totals match collection; refresh button updates AUTO Pokémon values.

- [ ] **Step 5: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "feat: add dashboard with summary and price refresh"
```

---

### Task 12: Light end-to-end test (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/collection.spec.ts`
- Modify: `package.json` (`"e2e": "playwright test"`)

**Interfaces:**
- Produces: one happy-path e2e: load dashboard → go to Collezione → add a manual SEALED item → assert it appears and totals reflect it.

- [ ] **Step 1: Install** — `npm install -D @playwright/test && npx playwright install chromium`

- [ ] **Step 2: Write `playwright.config.ts`** — `webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true }`, `use: { baseURL: 'http://localhost:3000' }`.

- [ ] **Step 3: Write `e2e/collection.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
test('add a manual sealed item appears in collection', async ({ page }) => {
  await page.goto('/collezione')
  await page.getByRole('button', { name: 'Aggiungi' }).click()
  await page.getByLabel('Nome').fill('Booster Box Test')
  await page.getByLabel('Tipo').selectOption('SEALED')
  await page.getByLabel('Valore di mercato').fill('100')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Booster Box Test')).toBeVisible()
})
```

- [ ] **Step 4: Run → PASS** (`npm run e2e`). Adjust labels/roles to match the actual form from Task 10.

- [ ] **Step 5: Commit + PROGRESS.md row**

```bash
git add -A && git commit -m "test: add light e2e for adding an item"
```

---

## Self-Review

**Spec coverage:**
- Inserimento collezione → Tasks 6, 10. Quantità/prezzo/condizione → schema Task 2, form Task 10. Valore auto Pokémon raw → Tasks 4/7/10. Differenza acquisto/valore → Task 3 + UI 9/11. Saldo complessivo + filtri custom → Task 3 + 9. UI responsive PC/tablet/smartphone → Tasks 8–11 (Tailwind mobile-first). Multi-tipo/multi-gioco → schema Task 2 + form Task 10. Provider pluggable → Task 4. PROGRESS.md → every task. ✓ No gaps.

**Placeholder scan:** UI tasks (9–11) describe JSX behavior in prose rather than full files because they're large view components; each lists exact state, classes, and data flow so an implementer can write them directly. Core logic/API tasks (3–8) contain complete code. No "TBD"/"handle edge cases" left.

**Type consistency:** `pickProvider(PriceInput)` / `fetchPrice(PriceInput)` consistent across Tasks 4 & 7. `CardSearchResult.lowPrice` used in Task 10 matches Task 5. `ValueItem` fields in Task 3 match Prisma `Item` fields in Task 2. `formatEUR`, `Money`, label maps consistent across 8–11.
