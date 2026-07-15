import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchSealedProducts, __resetSealedStaticCache } from '@/lib/pricing/sealed'
import { __resetFxCache } from '@/lib/fx'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

// Groups as tcgcsv really has them: "First Partner Pack" is its own group
// (groupId 2776 in production), not a product buried inside "Sword & Shield".
const GROUPS = { results: [
  { groupId: 2776, name: 'First Partner Pack' },
  { groupId: 1, name: 'Sword & Shield' },
] }
const PRODUCTS_BY_GROUP: Record<number, { results: unknown[] }> = {
  2776: { results: [
    { productId: 10, name: 'First Partner Pack', imageUrl: 'https://img/1.jpg', extendedData: [] },
  ] },
  1: { results: [
    { productId: 11, name: 'Sword & Shield Elite Trainer Box', imageUrl: 'https://img/2.jpg', extendedData: [] },
  ] },
}
const PRICES_BY_GROUP: Record<number, { results: unknown[] }> = {
  2776: { results: [{ productId: 10, subTypeName: 'Normal', marketPrice: 10 }] },
  1: { results: [{ productId: 11, subTypeName: 'Normal', marketPrice: 100 }] },
}
const IT_SETS = [{ id: 'swsh1', name: 'Spada e Scudo' }]
const EN_SETS = [{ id: 'swsh1', name: 'Sword & Shield' }]

type Fixtures = {
  groups: { results: unknown[] }
  productsByGroup: Record<number, { results: unknown[] }>
  pricesByGroup: Record<number, { results: unknown[] }>
  itSets: unknown[]
  enSets: unknown[]
}

function stubApis(fx: Fixtures) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('frankfurter')) return json({ rates: { EUR: 0.5 } })   // easy maths
    if (url.includes('/v2/it/sets')) return json(fx.itSets)
    if (url.includes('/v2/en/sets')) return json(fx.enSets)
    if (url.includes('/groups')) return json(fx.groups)
    const groupMatch = /\/(\d+)\/(products|prices)/.exec(url)
    if (groupMatch) {
      const groupId = Number(groupMatch[1])
      const kind = groupMatch[2]
      const table = kind === 'products' ? fx.productsByGroup : fx.pricesByGroup
      return json(table[groupId] ?? { results: [] })
    }
    return json({})
  }))
}

afterEach(() => { vi.unstubAllGlobals(); __resetFxCache(); __resetSealedStaticCache() })

describe('searchSealedProducts', () => {
  it('finds an English product from an Italian query via the glossary', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    const out = await searchSealedProducts("Primi compagni d'avventura")
    expect(out.map((r) => r.name)).toContain('First Partner Pack')
  })

  it('converts USD prices with the live rate, not the old hardcoded 0.92', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    const out = await searchSealedProducts('First Partner Pack')
    const fp = out.find((r) => r.name === 'First Partner Pack')
    expect(fp?.priceEur).toBe(5) // 10 USD * 0.5, not 10 * 0.92
  })

  it('returns an empty list rather than unrelated products for a nonsense query', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    expect(await searchSealedProducts('zzzzqqqq')).toEqual([])
  })

  describe('set + product-type decomposition (regression: "Collezione Allenatore Elite Rivali")', () => {
    // Realistic tcgcsv shape: products carry `extendedData`; a card has an
    // entry named 'Number' there, sealed products do not. "No. 2 Trainer" is
    // a decoy group whose name shares the literal token "Trainer" with the
    // translated product type ("elite trainer box") but is not a set — it
    // must never be chosen just because a product-type word overlaps it.
    const REGRESSION_GROUPS = { results: [
      { groupId: 100, name: 'Destined Rivals' },
      { groupId: 200, name: 'No. 2 Trainer' },
    ] }
    const REGRESSION_PRODUCTS: Record<number, { results: unknown[] }> = {
      100: { results: [
        { productId: 1001, name: 'Destined Rivals Elite Trainer Box', imageUrl: 'https://img/etb.jpg', extendedData: [] },
        { productId: 1002, name: 'Destined Rivals Booster Bundle', imageUrl: 'https://img/bb.jpg', extendedData: [] },
      ] },
      200: { results: [
        { productId: 2001, name: 'Sabrina\'s No. 2 Trainer', imageUrl: 'https://img/card.jpg', extendedData: [{ name: 'Number', value: '2' }] },
      ] },
    }
    const REGRESSION_PRICES: Record<number, { results: unknown[] }> = {
      100: { results: [
        { productId: 1001, subTypeName: 'Normal', marketPrice: 40 },
        { productId: 1002, subTypeName: 'Normal', marketPrice: 20 },
      ] },
      200: { results: [{ productId: 2001, subTypeName: 'Normal', marketPrice: 1 }] },
    }
    const REGRESSION_IT_SETS = [{ id: 'sv10', name: 'Rivali Predestinati' }]
    const REGRESSION_EN_SETS = [{ id: 'sv10', name: 'Destined Rivals' }]

    it('resolves "set + product type" and never returns the decoy group', async () => {
      stubApis({
        groups: REGRESSION_GROUPS,
        productsByGroup: REGRESSION_PRODUCTS,
        pricesByGroup: REGRESSION_PRICES,
        itSets: REGRESSION_IT_SETS,
        enSets: REGRESSION_EN_SETS,
      })
      const out = await searchSealedProducts('Collezione Allenatore Elite Rivali')
      expect(out.map((r) => r.name)).toContain('Destined Rivals Elite Trainer Box')
      expect(out.every((r) => !r.name.includes('Trainer') || r.name.startsWith('Destined Rivals'))).toBe(true)
      expect(out.some((r) => r.externalId.startsWith('tcgcsv:200:'))).toBe(false)
      const etb = out.find((r) => r.name === 'Destined Rivals Elite Trainer Box')
      expect(etb?.matchLevel).toBe('exact')
    })
  })

  describe('set-hint disambiguation (regression: "Rivali Predestinati" leaking Chaos Rising)', () => {
    // Real-world collision: the set-hint token "rivali" appears in TWO
    // TCGdex sets — pl2 "L'Ascesa dei Rivali"/"Rising Rivals" (partial match,
    // only "rivali") and sv10 "Rivali Predestinati"/"Destined Rivals" (full
    // match, both "rivali" and "predestinati"). Tokenizing the resolved
    // English name(s) used to let the spurious "rising" token from the
    // wrong set select an unrelated, newer group ("Chaos Rising") via
    // .slice(0, 4) publish-date ordering. Only sv10 must survive 4a, and 4b
    // must match "destined rivals" as a whole phrase so "Chaos Rising" (which
    // does not contain that phrase) can never be selected.
    const DISAMBIG_GROUPS = { results: [
      { groupId: 300, name: 'Chaos Rising' }, // decoy: newest set, listed first
      { groupId: 100, name: 'Destined Rivals' },
    ] }
    const DISAMBIG_PRODUCTS: Record<number, { results: unknown[] }> = {
      300: { results: [
        { productId: 3001, name: 'Chaos Rising Booster Bundle', imageUrl: 'https://img/cr.jpg', extendedData: [] },
      ] },
      100: { results: [
        { productId: 1001, name: 'Destined Rivals Elite Trainer Box', imageUrl: 'https://img/etb.jpg', extendedData: [] },
        { productId: 1002, name: 'Destined Rivals Booster Bundle', imageUrl: 'https://img/bb.jpg', extendedData: [] },
      ] },
    }
    const DISAMBIG_PRICES: Record<number, { results: unknown[] }> = {
      300: { results: [{ productId: 3001, subTypeName: 'Normal', marketPrice: 15 }] },
      100: { results: [
        { productId: 1001, subTypeName: 'Normal', marketPrice: 40 },
        { productId: 1002, subTypeName: 'Normal', marketPrice: 20 },
      ] },
    }
    const DISAMBIG_IT_SETS = [
      { id: 'pl2', name: "L'Ascesa dei Rivali" },
      { id: 'sv10', name: 'Rivali Predestinati' },
    ]
    const DISAMBIG_EN_SETS = [
      { id: 'pl2', name: 'Rising Rivals' },
      { id: 'sv10', name: 'Destined Rivals' },
    ]

    it('resolves "Rivali Predestinati" to Destined Rivals only, never Chaos Rising', async () => {
      stubApis({
        groups: DISAMBIG_GROUPS,
        productsByGroup: DISAMBIG_PRODUCTS,
        pricesByGroup: DISAMBIG_PRICES,
        itSets: DISAMBIG_IT_SETS,
        enSets: DISAMBIG_EN_SETS,
      })
      const out = await searchSealedProducts('Rivali Predestinati')
      expect(out.length).toBeGreaterThan(0)
      expect(out.every((r) => r.name.startsWith('Destined Rivals'))).toBe(true)
      expect(out.some((r) => r.name.includes('Chaos Rising'))).toBe(false)
      expect(out.some((r) => r.externalId.startsWith('tcgcsv:300:'))).toBe(false)
    })

    it('resolves "Collezione Allenatore Elite Rivali Predestinati" to the Destined Rivals ETB only', async () => {
      stubApis({
        groups: DISAMBIG_GROUPS,
        productsByGroup: DISAMBIG_PRODUCTS,
        pricesByGroup: DISAMBIG_PRICES,
        itSets: DISAMBIG_IT_SETS,
        enSets: DISAMBIG_EN_SETS,
      })
      const out = await searchSealedProducts('Collezione Allenatore Elite Rivali Predestinati')
      expect(out.map((r) => r.name)).toContain('Destined Rivals Elite Trainer Box')
      expect(out.some((r) => r.name.includes('Chaos Rising'))).toBe(false)
      expect(out.every((r) => r.name === 'Destined Rivals Elite Trainer Box')).toBe(true)
    })
  })
})
