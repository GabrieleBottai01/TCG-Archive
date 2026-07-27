import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPriceGuide, cardmarketPriceFor, __resetCardmarketCache } from '@/lib/pricing/cardmarket'

const CATALOGUE = {
  version: 1,
  products: [{ idProduct: 653700, name: 'Pokémon GO Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 }],
}
const PRICEGUIDE = {
  version: 1,
  priceGuides: [{ idProduct: 653700, avg: 114, low: 97, trend: 103 }],
}

function mockFetch() {
  return vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('price_guide') ? PRICEGUIDE : CATALOGUE),
  })) as unknown as typeof fetch
}

beforeEach(() => { __resetCardmarketCache() })
afterEach(() => { vi.restoreAllMocks() })

describe('getPriceGuide single-flight', () => {
  it('downloads the guide once for concurrent callers', async () => {
    const f = mockFetch()
    vi.stubGlobal('fetch', f)
    await Promise.all([getPriceGuide(), getPriceGuide(), getPriceGuide()])
    const guideCalls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.filter((c) => String(c[0]).includes('price_guide'))
    expect(guideCalls.length).toBe(1)
  })
})

describe('cardmarketPriceFor', () => {
  it('resolves a name to trend and returns the productId', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const r = await cardmarketPriceFor('Pokémon GO Elite Trainer Box')
    expect(r).toEqual({ eur: 103, productId: 653700 })
  })
  it('uses a stored productId without scanning the catalogue', async () => {
    const f = mockFetch()
    vi.stubGlobal('fetch', f)
    const r = await cardmarketPriceFor('irrelevant name', 653700)
    expect(r).toEqual({ eur: 103, productId: 653700 })
    const catCalls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.filter((c) => String(c[0]).includes('nonsingles'))
    expect(catCalls.length).toBe(0)
  })
  it('returns null price and null id when the name does not resolve', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const r = await cardmarketPriceFor('Nonexistent Set Elite Trainer Box')
    expect(r).toEqual({ eur: null, productId: null })
  })
})
