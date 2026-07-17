// Turns a product's permanent PriceReference history into the single EuReference
// the UI shows — reusing the tested maths in reference.ts, so the read path and
// the daily job agree on strength and display value by construction.
//
// summariseReference is pure (unit-tested). euReferencesFor is the DB batch read
// used by the server pages; it is thin glue and not unit-tested (no local DB).

import type { PrismaClient } from '@/generated/prisma/client'
import type { EuReference } from '@/lib/priceSource'
import { computeStrength, displayValue } from '@/lib/observatory/reference'
import { isTcgcsvId } from '@/lib/priceSource'

const STRENGTH_WINDOW_DAYS = 90

/** One permanent PriceReference row, oldest-first as reference.ts expects. */
export type RefHistoryRow = {
  medianEur: number | null
  sampleSize: number
  confirmedSales: number
  quickSales: number
}

/** Collapse a (product, lang) history into the reference the chip and value use. */
export function summariseReference(history: RefHistoryRow[]): EuReference {
  if (history.length === 0) {
    return { strength: 'NONE', displayValue: null, sampleSize: 0, sales: 0 }
  }
  const latest = history[history.length - 1]
  const window = history.slice(-STRENGTH_WINDOW_DAYS)
  const sales = window.reduce((sum, r) => sum + r.confirmedSales + r.quickSales, 0)
  return {
    strength: computeStrength(history, latest.sampleSize),
    displayValue: displayValue(history),
    sampleSize: latest.sampleSize,
    sales,
  }
}

function refKey(productKey: string, lang: string): string {
  return `${productKey}|${lang}`
}

/**
 * Batch-load the EU reference for every sealed tcgcsv item in `items`, keyed by
 * `"<externalId>|<language>"`. One query, grouped in memory. Items that are not
 * sealed tcgcsv products contribute no keys and get no reference.
 */
export async function euReferencesFor(
  db: PrismaClient,
  items: { itemType: string; externalId: string | null; language: string | null }[],
): Promise<Map<string, EuReference>> {
  const wanted = new Map<string, { productKey: string; lang: string }>()
  for (const i of items) {
    if (i.itemType === 'SEALED' && isTcgcsvId(i.externalId) && i.externalId && i.language) {
      wanted.set(refKey(i.externalId, i.language), { productKey: i.externalId, lang: i.language })
    }
  }
  if (wanted.size === 0) return new Map()

  const rows = await db.priceReference.findMany({
    where: { OR: [...wanted.values()].map((k) => ({ productKey: k.productKey, lang: k.lang })) },
    orderBy: { day: 'asc' },
    select: { productKey: true, lang: true, medianEur: true, sampleSize: true, confirmedSales: true, quickSales: true },
  })

  const histories = new Map<string, RefHistoryRow[]>()
  for (const r of rows) {
    const k = refKey(r.productKey, r.lang)
    const arr = histories.get(k) ?? []
    arr.push({ medianEur: r.medianEur, sampleSize: r.sampleSize, confirmedSales: r.confirmedSales, quickSales: r.quickSales })
    histories.set(k, arr)
  }

  const out = new Map<string, EuReference>()
  for (const [k, history] of histories) out.set(k, summariseReference(history))
  return out
}
