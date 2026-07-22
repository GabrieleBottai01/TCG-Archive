// What the collection was worth on one day. Pure: no DB, no clock.
//
// Every figure goes through collectionTotals/effectiveValue — the same path the
// dashboard renders — so a snapshot can never disagree with the headline number,
// and a STRONG observatory reference is honoured identically in both.

import { collectionTotals, type ValueItem } from '@/lib/value'
import { effectiveValue } from '@/lib/priceSource'
import { euReferencesFor } from '@/lib/observatory/euReference'

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

// --- Prisma adapter (tsc-checked; needs a live DB, so not unit-tested) ---

/** Midnight UTC of `now`, so a calendar day maps to exactly one row. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

type PrismaLike = typeof import('@/lib/db').prisma

/** Upserts the portfolio row and every per-item row for `day`, atomically. Last write of the day wins. */
export async function writeSnapshot(db: PrismaLike, userId: string, day: Date, built: BuiltSnapshot): Promise<void> {
  const data = {
    totalValue: built.totalValue,
    totalCost: built.totalCost,
    itemCount: built.itemCount,
    pieceCount: built.pieceCount,
    pricesAsOf: built.pricesAsOf,
  }
  const ops = [
    db.portfolioSnapshot.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, ...data },
      update: data,
    }),
    ...built.items.map((row) =>
      db.itemValueSnapshot.upsert({
        where: { itemId_day: { itemId: row.itemId, day } },
        create: { itemId: row.itemId, day, valueEur: row.valueEur, quantity: row.quantity },
        update: { valueEur: row.valueEur, quantity: row.quantity },
      })
    ),
  ]
  await db.$transaction(ops)
}

/** Snapshots one user's collection for the UTC day of `now`. Returns false when they own nothing. */
export async function snapshotUser(db: PrismaLike, userId: string, now: Date): Promise<boolean> {
  const items = await db.item.findMany({ where: { userId } })
  if (items.length === 0) return false
  const refs = await euReferencesFor(db, items)
  // ValueItem wants createdAt as string|undefined (the dashboard's own read path
  // only satisfies that via a JSON round-trip before render); convert the same
  // way here instead of dropping the field.
  const withRefs = items.map((i) => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    euReference: refs.get(`${i.externalId}|${i.language}`) ?? null,
  }))
  await writeSnapshot(db, userId, startOfUtcDay(now), buildSnapshot(withRefs))
  return true
}

/** Snapshots every user who owns anything. One user's failure is logged and does not
 *  stop the rest — otherwise a single throw would silently lose every user after it.
 *  Returns how many were written. */
export async function snapshotAllUsers(db: PrismaLike, now: Date): Promise<number> {
  const users = await db.user.findMany({ select: { id: true } })
  let written = 0
  for (const u of users) {
    try {
      if (await snapshotUser(db, u.id, now)) written++
    } catch (e) {
      console.error('portfolio snapshot failed for user', u.id, e)
    }
  }
  return written
}
