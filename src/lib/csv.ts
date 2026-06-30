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
