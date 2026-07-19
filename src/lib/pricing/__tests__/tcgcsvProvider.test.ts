import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spy on the eBay call so the test asserts WHICH query the provider passes,
// not any live pricing (which the mock-vs-live memory warns never to trust).
// vi.hoisted() is required here: vi.mock() factories are hoisted above
// top-level `const`, so a plain `const liveEbayEstimate = vi.fn(...)` above
// the vi.mock() call throws "Cannot access before initialization".
const { liveEbayEstimate } = vi.hoisted(() => ({
  liveEbayEstimate: vi.fn(async () => ({ eur: 99, sampleSize: 3 })),
}))
vi.mock('@/lib/pricing/ebayEstimate', () => ({ liveEbayEstimate }))

// Cardtrader is now first in sealedPrice; disable it here so these tests keep
// deterministically exercising the eBay path regardless of CARDTRADER_JWT env.
vi.mock('@/lib/pricing/cardtrader', () => ({
  cardtraderEnabled: () => false,
  resolveBlueprintId: vi.fn(),
  getMarketplace: vi.fn(),
  lowestSealedEur: vi.fn(),
}))

import { TcgcsvProvider } from '@/lib/pricing/tcgcsvProvider'

describe('TcgcsvProvider query routing', () => {
  beforeEach(() => liveEbayEstimate.mockClear())

  it('searches eBay with priceQuery when present', async () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'Paldean Fates Elite Trainer Box', priceQuery: 'ETB destino di paldea', language: 'IT' }
    const r = await new TcgcsvProvider().fetchPrice(i)
    expect(liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
    expect(r).toEqual({ value: 99, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: null })
  })

  it('falls back to name when priceQuery is null (pre-migration item)', async () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'ETB destino di paldea', priceQuery: null, language: 'IT' }
    await new TcgcsvProvider().fetchPrice(i)
    expect(liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
  })
})
