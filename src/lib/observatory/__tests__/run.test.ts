import { describe, it, expect } from 'vitest'
import type { EbayListing, Marketplace } from '@/lib/observatory/ebay'
import {
  gateListing,
  runObservatory,
  type ObservatoryStore,
  type WatchlistItem,
  type ObservationRow,
  type ReferenceRow,
  type UpsertObservation,
  type SaveReference,
} from '@/lib/observatory/run'

const NOW = new Date('2026-07-17T09:00:00.000Z')

// A sealed, fixed-price EBAY_IT listing that the title matcher accepts for the
// Italian ETB used across these tests. Overridable per case.
function listing(over: Partial<EbayListing> = {}): EbayListing {
  return {
    ebayItemId: 'v1|1|0',
    title: 'Pokemon Destined Rivals Elite Trainer Box sigillata ITA',
    priceEur: 50,
    conditionId: '1000',
    buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
    sellerAccountType: 'INDIVIDUAL',
    ...over,
  }
}

/** In-memory store: records writes, replays configured reads. */
class FakeStore implements ObservatoryStore {
  items: WatchlistItem[] = []
  active = new Map<string, ObservationRow[]>()
  history = new Map<string, ReferenceRow[]>()
  upserts: UpsertObservation[] = []
  goneMarks: { keys: { ebayItemId: string; marketplace: Marketplace }[]; at: Date }[] = []
  saved: SaveReference[] = []
  prunedWith: Date[] = []

  async watchlist() {
    return this.items
  }
  async activeObservations(productKey: string, lang: string) {
    return this.active.get(`${productKey}|${lang}`) ?? []
  }
  async upsertObservation(o: UpsertObservation) {
    this.upserts.push(o)
  }
  async markGone(keys: { ebayItemId: string; marketplace: Marketplace }[], at: Date) {
    this.goneMarks.push({ keys, at })
  }
  async referenceHistory(productKey: string, lang: string) {
    return this.history.get(`${productKey}|${lang}`) ?? []
  }
  async saveReference(r: SaveReference) {
    this.saved.push(r)
  }
  async prune(now: Date) {
    this.prunedWith.push(now)
    return 0
  }
}

const itItem: WatchlistItem = { productKey: 'tcgcsv:1:2', name: 'Destined Rivals Elite Trainer Box', lang: 'IT' }

/** A search stub returning the given listings for EBAY_IT and nothing for EBAY_DE. */
function searchOnIt(listings: EbayListing[]) {
  return async (_q: string, mkt: Marketplace) => (mkt === 'EBAY_IT' ? listings : [])
}

const deps = (search: (q: string, m: Marketplace) => Promise<EbayListing[]>) => ({
  now: NOW,
  search,
  concurrency: 4,
  budgetMs: 25_000,
  elapsedMs: () => 0,
})

describe('gateListing — the structured PRIMARY gate (Task 1 result)', () => {
  it('accepts a sealed, fixed-price listing', () => {
    expect(gateListing(listing()).ok).toBe(true)
  })
  it('rejects a used listing even if its title says "Sealed" — conditionId overrides the title', () => {
    // This is the real sample's third item: title "...Sealed OVP English..." but conditionId 3000.
    expect(gateListing(listing({ conditionId: '3000' }))).toEqual({
      ok: false,
      reason: expect.stringContaining('sealed'),
    })
  })
  it('rejects an auction — its current price is not a sale price', () => {
    expect(gateListing(listing({ buyingOptions: ['AUCTION'] })).ok).toBe(false)
  })
  it('rejects a listing with no FIXED_PRICE option', () => {
    expect(gateListing(listing({ buyingOptions: ['BEST_OFFER'] })).ok).toBe(false)
  })
})

describe('runObservatory', () => {
  it('records a matching sealed listing and writes its reference', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    const summary = await runObservatory(store, deps(searchOnIt([listing({ priceEur: 50 })])))

    expect(store.upserts).toHaveLength(1)
    expect(store.upserts[0]).toMatchObject({
      productKey: 'tcgcsv:1:2',
      ebayItemId: 'v1|1|0',
      marketplace: 'EBAY_IT',
      lang: 'IT',
      priceEur: 50,
      seenAt: NOW,
    })
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0]).toMatchObject({ productKey: 'tcgcsv:1:2', lang: 'IT', medianEur: 50, sampleSize: 1 })
    expect(summary.processed).toBe(1)
  })

  it('drops listings rejected by the structured gate or the title matcher', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    await runObservatory(
      store,
      deps(
        searchOnIt([
          listing({ ebayItemId: 'used', conditionId: '3000' }), // used
          listing({ ebayItemId: 'auction', buyingOptions: ['AUCTION'] }), // auction
          listing({ ebayItemId: 'other', title: 'Pokemon 151 Booster Bundle ITA' }), // wrong product
          listing({ ebayItemId: 'good', priceEur: 60 }), // the only keeper
        ]),
      ),
    )
    expect(store.upserts.map((u) => u.ebayItemId)).toEqual(['good'])
    expect(store.saved[0]).toMatchObject({ sampleSize: 1, medianEur: 60 })
  })

  it('marks a vanished listing gone and counts it as a quick sale when it lived < 48h', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    // A listing seen for the first time yesterday, gone today (< 48h) → quick sale.
    store.active.set('tcgcsv:1:2|IT', [
      { ebayItemId: 'sold', marketplace: 'EBAY_IT', priceEur: 55, firstSeenAt: new Date('2026-07-16T20:00:00.000Z'), goneAt: null },
    ])
    await runObservatory(store, deps(searchOnIt([listing({ ebayItemId: 'still-up', priceEur: 50 })])))

    expect(store.goneMarks).toHaveLength(1)
    expect(store.goneMarks[0].keys).toEqual([{ ebayItemId: 'sold', marketplace: 'EBAY_IT' }])
    // Today's sample: the still-up ask (50) + the quick sale (55). One quick sale recorded.
    expect(store.saved[0]).toMatchObject({ sampleSize: 2, quickSales: 1 })
  })

  it('does NOT count a long-lived vanished listing as a quick sale', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    store.active.set('tcgcsv:1:2|IT', [
      { ebayItemId: 'expired', marketplace: 'EBAY_IT', priceEur: 55, firstSeenAt: new Date('2026-06-01T00:00:00.000Z'), goneAt: null },
    ])
    await runObservatory(store, deps(searchOnIt([]))) // nothing found today

    expect(store.goneMarks[0].keys).toEqual([{ ebayItemId: 'expired', marketplace: 'EBAY_IT' }])
    // The expired ask is neither active nor a quick sale → today's sample is empty, strength NONE.
    expect(store.saved[0]).toMatchObject({ sampleSize: 0, quickSales: 0, medianEur: null, strength: 'NONE' })
  })

  it('reports STRONG when the 90-day history plus today clears the sale + sample bars', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    store.history.set('tcgcsv:1:2|IT', [
      { medianEur: 50, sampleSize: 4, confirmedSales: 0, quickSales: 3 }, // 3 sales already banked
    ])
    await runObservatory(
      store,
      deps(
        searchOnIt([
          listing({ ebayItemId: 'a', priceEur: 48 }),
          listing({ ebayItemId: 'b', priceEur: 50 }),
          listing({ ebayItemId: 'c', priceEur: 52 }),
        ]),
      ),
    )
    expect(store.saved[0]).toMatchObject({ sampleSize: 3, strength: 'STRONG', medianEur: 50 })
  })

  it('prunes once, after every product is processed', async () => {
    const store = new FakeStore()
    store.items = [itItem]
    await runObservatory(store, deps(searchOnIt([listing()])))
    expect(store.prunedWith).toEqual([NOW])
  })

  it('respects the wall-clock budget: processes stalest-first and skips the rest', async () => {
    const store = new FakeStore()
    store.items = [
      { productKey: 'tcgcsv:A', name: 'Destined Rivals Elite Trainer Box', lang: 'IT' },
      { productKey: 'tcgcsv:B', name: 'Destined Rivals Elite Trainer Box', lang: 'IT' },
      { productKey: 'tcgcsv:C', name: 'Destined Rivals Elite Trainer Box', lang: 'IT' },
    ]
    // Budget already blown before any product starts except, with concurrency 1,
    // the very first one that is pulled.
    let ticks = 0
    const elapsed = () => (ticks++ === 0 ? 0 : 999_999)
    const summary = await runObservatory(store, {
      now: NOW,
      search: searchOnIt([listing()]),
      concurrency: 1,
      budgetMs: 25_000,
      elapsedMs: elapsed,
    })
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(2)
    // Skipped products are NOT touched — no gone-marking, no reference for them.
    expect(store.saved).toHaveLength(1)
  })
})
