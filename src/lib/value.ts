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
export function filterItems<T extends ValueItem>(items: T[], f: Filters): T[] {
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
