import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchSealedProducts } from '@/lib/pricing/sealed'
import { __resetFxCache } from '@/lib/fx'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

// One group whose products are English, as tcgcsv really is.
const GROUPS = { results: [{ groupId: 1, name: 'Sword & Shield' }] }
const PRODUCTS = { results: [
  { productId: 10, name: 'First Partner Pack', imageUrl: 'https://img/1.jpg', extendedData: [] },
  { productId: 11, name: 'Sword & Shield Elite Trainer Box', imageUrl: 'https://img/2.jpg', extendedData: [] },
] }
const PRICES = { results: [
  { productId: 10, subTypeName: 'Normal', marketPrice: 10 },
  { productId: 11, subTypeName: 'Normal', marketPrice: 100 },
] }

function stubApis() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('frankfurter')) return json({ rates: { EUR: 0.5 } })   // easy maths
    if (url.includes('tcgdex')) return json([{ id: 'swsh1', name: 'Spada e Scudo' }])
    if (url.includes('/groups')) return json(GROUPS)
    if (url.includes('/products')) return json(PRODUCTS)
    if (url.includes('/prices')) return json(PRICES)
    return json({})
  }))
}

afterEach(() => { vi.unstubAllGlobals(); __resetFxCache() })

describe('searchSealedProducts', () => {
  it('finds an English product from an Italian query via the glossary', async () => {
    stubApis()
    const out = await searchSealedProducts("Primi compagni d'avventura")
    expect(out.map((r) => r.name)).toContain('First Partner Pack')
  })

  it('converts USD prices with the live rate, not the old hardcoded 0.92', async () => {
    stubApis()
    const out = await searchSealedProducts('First Partner Pack')
    const fp = out.find((r) => r.name === 'First Partner Pack')
    expect(fp?.priceEur).toBe(5) // 10 USD * 0.5, not 10 * 0.92
  })

  it('returns an empty list rather than unrelated products for a nonsense query', async () => {
    stubApis()
    expect(await searchSealedProducts('zzzzqqqq')).toEqual([])
  })
})
