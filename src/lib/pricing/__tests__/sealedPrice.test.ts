import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  cardtraderEnabled: vi.fn(() => true),
  resolveBlueprintId: vi.fn(async () => 100 as number | null),
  getMarketplace: vi.fn(async () => [] as unknown[]),
  lowestSealedEur: vi.fn(() => ({ eur: null as number | null, sampleSize: 0 })),
  cardmarketEnabled: vi.fn(() => true),
  cardmarketPriceFor: vi.fn(async () => ({ eur: null as number | null, productId: null as number | null })),
  liveEbayEstimate: vi.fn(async () => ({ eur: null as number | null, sampleSize: 0 })),
}))
vi.mock('@/lib/pricing/cardtrader', () => ({
  cardtraderEnabled: h.cardtraderEnabled,
  resolveBlueprintId: h.resolveBlueprintId,
  getMarketplace: h.getMarketplace,
  lowestSealedEur: h.lowestSealedEur,
}))
vi.mock('@/lib/pricing/cardmarket', () => ({
  cardmarketEnabled: h.cardmarketEnabled,
  cardmarketPriceFor: h.cardmarketPriceFor,
}))
vi.mock('@/lib/pricing/ebayEstimate', () => ({ liveEbayEstimate: h.liveEbayEstimate }))

import { sealedPrice } from '@/lib/pricing/sealedPrice'

const base = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2', name: 'Paldean Fates Elite Trainer Box', priceQuery: 'ETB destino di paldea', language: 'IT' }

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockClear())
  h.cardtraderEnabled.mockReturnValue(true)
  h.resolveBlueprintId.mockResolvedValue(100)
  h.cardmarketEnabled.mockReturnValue(true)
  h.cardmarketPriceFor.mockResolvedValue({ eur: null, productId: null })
})

describe('sealedPrice', () => {
  it('prefers Cardtrader when it has a price', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 135, sampleSize: 4 })
    const r = await sealedPrice(base)
    expect(r).toEqual({ value: 135, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: 100, cardmarketProductId: null })
    expect(h.liveEbayEstimate).not.toHaveBeenCalled()
  })

  it('uses a stored blueprint id without re-resolving', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: 140, sampleSize: 2 })
    await sealedPrice({ ...base, cardtraderBlueprintId: 555 })
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).toHaveBeenCalledWith(555, { language: 'it' })
  })

  it('uses Cardmarket when Cardtrader has no price, before eBay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: 103, productId: 653700 })
    const r = await sealedPrice(base)
    expect(h.cardmarketPriceFor).toHaveBeenCalledWith('Paldean Fates Elite Trainer Box', null)
    expect(h.liveEbayEstimate).not.toHaveBeenCalled()
    expect(r).toEqual({ value: 103, source: 'AUTO', origin: 'cardmarket', cardtraderBlueprintId: 100, cardmarketProductId: 653700 })
  })

  it('falls back to eBay when neither Cardtrader nor Cardmarket has a price', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: null, productId: null })
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: 100, cardmarketProductId: null })
  })

  it('does not crash if Cardmarket throws — it falls through to eBay', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockRejectedValue(new Error('S3 down'))
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(r?.origin).toBe('ebay')
  })

  it('passes a stored cardmarketProductId straight through', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.cardmarketPriceFor.mockResolvedValue({ eur: 97, productId: 653700 })
    await sealedPrice({ ...base, cardmarketProductId: 653700 })
    expect(h.cardmarketPriceFor).toHaveBeenCalledWith('Paldean Fates Elite Trainer Box', 653700)
  })

  it('skips Cardtrader entirely when the token is absent', async () => {
    h.cardtraderEnabled.mockReturnValue(false)
    h.liveEbayEstimate.mockResolvedValue({ eur: 139, sampleSize: 20 })
    const r = await sealedPrice(base)
    expect(h.resolveBlueprintId).not.toHaveBeenCalled()
    expect(h.getMarketplace).not.toHaveBeenCalled()
    expect(r).toEqual({ value: 139, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: null, cardmarketProductId: null })
  })

  it('returns null when neither source has data', async () => {
    h.lowestSealedEur.mockReturnValue({ eur: null, sampleSize: 0 })
    h.liveEbayEstimate.mockResolvedValue({ eur: null, sampleSize: 0 })
    expect(await sealedPrice(base)).toBeNull()
  })
})
