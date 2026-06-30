export type ValueItem = {
  quantity: number; purchasePrice: number; marketValue: number
  game?: string; itemType?: string; condition?: string | null
  setName?: string | null; name?: string; language?: string | null; createdAt?: string
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
