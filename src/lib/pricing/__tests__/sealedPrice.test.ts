import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  cardtraderEnabled: vi.fn(() => true),
  resolveBlueprintId: vi.fn(async () => 100 as number | null),
  getMarketplace: vi.fn(async () => [] as unknown[]),
  lowestSealedEur: vi.fn(() => ({ eur: null as number | null, sampleSize: 0 })),
  liveEbayEstimate: vi.fn(async () => ({ eur: null as number | null, sampleSize: 0 })),
}))
vi.mock('@/lib/pricing/cardtrader', () => ({
  cardtraderEnabled: h.cardtraderEnabled,
  resolveBlueprintId: h.resolveBlueprintId,
  getMarketplace: h.getMarketplace,
  lowestSealedEur: h.lowestSealedEur,
}))
vi.mock('@/lib/pricing/ebayEstimate', () => ({ liveEbayEstimate: h.liveEbayEstimate }))

import { sealedPrice } from '@/lib/pricing/sealedPrice'

const base = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'Paldean Fates Elite Trainer Box', priceQuery: 'ETB destino di paldea', language: 'IT' }

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockClear())
  h.cardtraderEnabled.mockReturnValue(true)
  h.resolveBlueprintId.mockResolvedValue(100)
})

describe('sealedPrice', () => {
  it('prefers Cardtrader when it has a price', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 135, sampleSize: 4 })
    const r = await sealedPrice(base)
    expect(r).toEqual({ value: 135, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: 100 })
    expect(h.liveEbayEstimate).not.toHaveBeenCalled()
  })

  it('uses a stored blueprint id without re-resolving', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 140, sampleSize: 2 })
    await sealedPrice({ ...base, cardtraderBlueprintId: 555 })
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).toHaveBeenCalledWith(555, { language: 'it' })
  })

  it('falls back to eBay when Cardtrader has no price, reporting origin ebay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(h.liveEbayEstimate).toHaveBeenCalledWith('ETB destino di paldea', 'IT')
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: 100 })
  })

  it('skips Cardtrader entirely when the token is absent', async () => {
    h.cardtraderEnabled.mockReturnValue(false)
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).not.toHaveBeenCalled()
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: null })
  })

  it('returns null when neither source has data', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.liveEbayEstimate.mockResolvedValue({ eur: null, sampleSize: 0 })
    expect(await sealedPrice(base)).toBeNull()
  })
})
