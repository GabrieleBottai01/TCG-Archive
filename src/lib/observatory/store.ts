// The Prisma-backed ObservatoryStore: the only place the daily job touches the
// database. It is a thin adapter — all the decisions live in run.ts, which is
// unit-tested against an in-memory fake. This file is validated by tsc and at
// deploy, never by a local unit test (the local .env is SQLite; the app runs on
// the Neon adapter, so nothing DB-backed runs locally).

import type { PrismaClient } from '@/generated/prisma/client'
import type {
  ObservatoryStore,
  ObservationRow,
  ReferenceRow,
  SaveReference,
  UpsertObservation,
  WatchlistItem,
} from './run'
import type { Marketplace } from './ebay'

const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const STRENGTH_WINDOW_DAYS = 90

export function createObservatoryStore(db: PrismaClient): ObservatoryStore {
  return {
    async watchlist(): Promise<WatchlistItem[]> {
      // The sealed products the user owns, one row per (product, language).
      const owned = await db.item.findMany({
        where: { itemType: 'SEALED', externalId: { startsWith: 'tcgcsv:' }, language: { not: null } },
        distinct: ['externalId', 'language'],
        select: { externalId: true, language: true, name: true },
      })

      // Order stalest-first: the product referenced longest ago (or never) leads,
      // so a run truncated by the 30s budget resumes here tomorrow — the implicit
      // cursor is the data itself, no extra table.
      const lastSeen = await db.priceReference.groupBy({
        by: ['productKey', 'lang'],
        _max: { day: true },
      })
      const lastDay = new Map<string, number>()
      for (const r of lastSeen) {
        if (r._max.day) lastDay.set(`${r.productKey}|${r.lang}`, r._max.day.getTime())
      }

      return owned
        .filter((i): i is { externalId: string; language: string; name: string } =>
          i.externalId !== null && i.language !== null,
        )
        .map((i) => ({ productKey: i.externalId, name: i.name, lang: i.language }))
        .sort((a, b) => {
          const da = lastDay.get(`${a.productKey}|${a.lang}`) ?? 0 // never referenced → stalest
          const db_ = lastDay.get(`${b.productKey}|${b.lang}`) ?? 0
          return da - db_
        })
    },

    async activeObservations(productKey: string, lang: string): Promise<ObservationRow[]> {
      const rows = await db.ebayObservation.findMany({
        where: { productKey, lang, goneAt: null },
        select: { ebayItemId: true, marketplace: true, priceEur: true, firstSeenAt: true, goneAt: true },
      })
      // `marketplace` is a free-text column but we only ever write the two values.
      return rows.map((r) => ({ ...r, marketplace: r.marketplace as Marketplace }))
    },

    async upsertObservation(o: UpsertObservation): Promise<void> {
      await db.ebayObservation.upsert({
        where: { ebayItemId_marketplace: { ebayItemId: o.ebayItemId, marketplace: o.marketplace } },
        create: {
          productKey: o.productKey,
          ebayItemId: o.ebayItemId,
          marketplace: o.marketplace,
          lang: o.lang,
          priceEur: o.priceEur,
          confidence: o.confidence,
          firstSeenAt: o.seenAt,
          lastSeenAt: o.seenAt,
        },
        // A reappearing listing is revived (goneAt back to null) and re-priced;
        // firstSeenAt is left untouched so its lifetime keeps counting from origin.
        update: { lastSeenAt: o.seenAt, goneAt: null, priceEur: o.priceEur, confidence: o.confidence },
      })
    },

    async markGone(keys: { ebayItemId: string; marketplace: Marketplace }[], at: Date): Promise<void> {
      if (keys.length === 0) return
      await db.ebayObservation.updateMany({
        where: { OR: keys.map((k) => ({ ebayItemId: k.ebayItemId, marketplace: k.marketplace })) },
        data: { goneAt: at },
      })
    },

    async referenceHistory(productKey: string, lang: string): Promise<ReferenceRow[]> {
      const rows = await db.priceReference.findMany({
        where: { productKey, lang },
        orderBy: { day: 'desc' },
        take: STRENGTH_WINDOW_DAYS,
        select: { medianEur: true, sampleSize: true, confirmedSales: true, quickSales: true },
      })
      return rows.reverse() // caller wants oldest-first
    },

    async saveReference(r: SaveReference): Promise<void> {
      const data = {
        medianEur: r.medianEur,
        sampleSize: r.sampleSize,
        confirmedSales: r.confirmedSales,
        quickSales: r.quickSales,
        strength: r.strength,
      }
      await db.priceReference.upsert({
        where: { productKey_lang_day: { productKey: r.productKey, lang: r.lang, day: r.day } },
        create: { productKey: r.productKey, lang: r.lang, day: r.day, ...data },
        update: data,
      })
    },

    async prune(now: Date): Promise<number> {
      const cutoff = new Date(now.getTime() - PRUNE_AFTER_MS)
      // ToS: delete eBay content once the listing is no longer public (goneAt set).
      // The lastSeenAt backstop catches rows a dropped-from-watchlist product left
      // behind, which never get a goneAt.
      const { count } = await db.ebayObservation.deleteMany({
        where: { OR: [{ goneAt: { not: null } }, { lastSeenAt: { lt: cutoff } }] },
      })
      return count
    },
  }
}
