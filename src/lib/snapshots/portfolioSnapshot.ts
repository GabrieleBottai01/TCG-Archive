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
