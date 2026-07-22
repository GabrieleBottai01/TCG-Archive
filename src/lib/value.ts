import { effectiveValue, type EuReference } from '@/lib/priceSource'

export type ValueItem = {
  quantity: number; purchasePrice: number; marketValue: number
  game?: string; itemType?: string; condition?: string | null
  setName?: string | null; name?: string; language?: string | null; createdAt?: string
  externalId?: string | null; euReference?: EuReference | null
}

/**
 * The per-unit value the collection counts: the stored market value, unless a
 * STRONG EU reference has earned the right to replace it (see effectiveValue).
 * Every money figure below goes through here so a STRONG reference reaches the
 * item difference AND the collection balance in one place.
 */
function valueOf(i: ValueItem): number {
  return effectiveValue({ itemType: i.itemType ?? '', externalId: i.externalId, marketValue: i.marketValue, euReference: i.euReference })
}

export function itemDifference(i: ValueItem): number {
  return (valueOf(i) - i.purchasePrice) * i.quantity
}

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

export type Totals = { totalValue: number; totalCost: number; profitLoss: number; itemCount: number; pieceCount: number }
export function collectionTotals(items: ValueItem[]): Totals {
  const t = items.reduce((acc, i) => {
    acc.totalValue += valueOf(i) * i.quantity
    acc.totalCost += i.purchasePrice * i.quantity
    acc.pieceCount += i.quantity
    return acc
  }, { totalValue: 0, totalCost: 0, pieceCount: 0 })
  return { ...t, profitLoss: t.totalValue - t.totalCost, itemCount: items.length }
}
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
    if (f.minValue != null && valueOf(i) < f.minValue) return false
    if (f.maxValue != null && valueOf(i) > f.maxValue) return false
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
      case 'marketValue': c = valueOf(a) - valueOf(b); break
      case 'quantity': c = a.quantity - b.quantity; break
      case 'difference': c = itemDifference(a) - itemDifference(b); break
      case 'createdAt': c = (a.createdAt ?? '').localeCompare(b.createdAt ?? ''); break
    }
    return c * dir
  })
}

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
  return [...items].sort((a, b) => valueOf(b) * b.quantity - valueOf(a) * a.quantity).slice(0, n)
}
export function topByDifference<T extends ValueItem>(items: T[], n: number, dir: SortDir): T[] {
  const s = [...items].sort((a, b) => itemDifference(b) - itemDifference(a)) // gains first
  return (dir === 'desc' ? s : [...s].reverse()).slice(0, n)
}
export function averageValuePerPiece(items: ValueItem[]): number {
  const t = collectionTotals(items)
  return t.pieceCount > 0 ? t.totalValue / t.pieceCount : 0
}
