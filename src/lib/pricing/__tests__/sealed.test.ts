import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchSealedProducts, __resetSealedStaticCache } from '@/lib/pricing/sealed'
import { __resetFxCache } from '@/lib/fx'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

// Group names and ids are the REAL ones tcgcsv serves (verified against
// https://tcgcsv.com/tcgplayer/3/groups). Two properties of the real data that
// a fixture MUST mirror, because flattening either of them has hidden live bugs
// in this module before:
//  1. most groups carry an era prefix — 'SWSH01: Sword & Shield Base Set', not
//     a bare 'Sword & Shield' — while a few (2776 'First Partner Pack') do not;
//  2. 20 of the ~217 live groups contain '&'. A fixture without one let a
//     normalizer mismatch (group side kept '&', query side stripped it) ship
//     green while EVERY '&' set returned zero results live.
const GROUPS = { results: [
  { groupId: 2776, name: 'First Partner Pack' },
  { groupId: 2585, name: 'SWSH01: Sword & Shield Base Set' },
] }
const PRODUCTS_BY_GROUP: Record<number, { results: unknown[] }> = {
  2776: { results: [
    { productId: 10, name: 'First Partner Pack', imageUrl: 'https://img/1.jpg', extendedData: [] },
  ] },
  2585: { results: [
    { productId: 11, name: 'Sword & Shield Elite Trainer Box', imageUrl: 'https://img/2.jpg', extendedData: [] },
    { productId: 12, name: 'Sword & Shield Booster Bundle', imageUrl: 'https://img/3.jpg', extendedData: [] },
  ] },
}
const PRICES_BY_GROUP: Record<number, { results: unknown[] }> = {
  2776: { results: [{ productId: 10, subTypeName: 'Normal', marketPrice: 10 }] },
  2585: { results: [
    { productId: 11, subTypeName: 'Normal', marketPrice: 100 },
    { productId: 12, subTypeName: 'Normal', marketPrice: 60 },
  ] },
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

  // Regression: an '&' in the English set name used to make the set unfindable.
  // Group names were normalized with a local `norm` that kept '&' while queries
  // went through `normalizeQuery`, which strips it — so 'sword shield' could
  // never be found inside 'swsh01 sword & shield base set'. Live, this zeroed
  // out both eras the user actually collects (Spada e Scudo, Scarlatto e
  // Violetto). Both sides now share one normalizer.
  it('finds a set whose English name contains "&" from its Italian name', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    const out = await searchSealedProducts('Spada e Scudo')
    expect(out.length).toBeGreaterThan(0)
    expect(out.map((r) => r.name)).toContain('Sword & Shield Elite Trainer Box')
    expect(out.map((r) => r.name)).toContain('Sword & Shield Booster Bundle')
  })

  it('resolves set + product type across an "&" set name', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    const out = await searchSealedProducts('Collezione Allenatore Elite Spada e Scudo')
    expect(out.map((r) => r.name)).toEqual(['Sword & Shield Elite Trainer Box'])
    expect(out[0].matchLevel).toBe('exact')
  })

  it('returns an empty list rather than unrelated products for a nonsense query', async () => {
    stubApis({ groups: GROUPS, productsByGroup: PRODUCTS_BY_GROUP, pricesByGroup: PRICES_BY_GROUP, itSets: IT_SETS, enSets: EN_SETS })
    expect(await searchSealedProducts('zzzzqqqq')).toEqual([])
  })

  describe('set + product-type decomposition (regression: "Collezione Allenatore Elite Rivali")', () => {
    // Realistic tcgcsv shape: products carry `extendedData`; a card has an
    // entry named 'Number' there, sealed products do not. Group 1536 is a real
    // decoy — its name shares the literal token "Trainer" with the translated
    // product type ("elite trainer box") but it is a Trainer Kit, not a set, so
    // it must never be chosen just because a product-type word overlaps it.
    // (It also carries an '&', like 20 of the ~217 live groups.)
    const REGRESSION_GROUPS = { results: [
      { groupId: 24269, name: 'SV10: Destined Rivals' },
      { groupId: 1536, name: 'XY Trainer Kit: Latias & Latios' },
    ] }
    const REGRESSION_PRODUCTS: Record<number, { results: unknown[] }> = {
      24269: { results: [
        { productId: 1001, name: 'Destined Rivals Elite Trainer Box', imageUrl: 'https://img/etb.jpg', extendedData: [] },
        { productId: 1002, name: 'Destined Rivals Booster Bundle', imageUrl: 'https://img/bb.jpg', extendedData: [] },
      ] },
      1536: { results: [
        { productId: 2001, name: 'Latias EX', imageUrl: 'https://img/card.jpg', extendedData: [{ name: 'Number', value: '2' }] },
      ] },
    }
    const REGRESSION_PRICES: Record<number, { results: unknown[] }> = {
      24269: { results: [
        { productId: 1001, subTypeName: 'Normal', marketPrice: 40 },
        { productId: 1002, subTypeName: 'Normal', marketPrice: 20 },
      ] },
      1536: { results: [{ productId: 2001, subTypeName: 'Normal', marketPrice: 1 }] },
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
      expect(out.some((r) => r.externalId.startsWith('tcgcsv:1536:'))).toBe(false)
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
      { groupId: 24655, name: 'ME04: Chaos Rising' }, // decoy: newest set, listed first
      { groupId: 24269, name: 'SV10: Destined Rivals' },
      { groupId: 1367, name: 'Rising Rivals' },
    ] }
    const DISAMBIG_PRODUCTS: Record<number, { results: unknown[] }> = {
      24655: { results: [
        { productId: 3001, name: 'Chaos Rising Booster Bundle', imageUrl: 'https://img/cr.jpg', extendedData: [] },
      ] },
      24269: { results: [
        { productId: 1001, name: 'Destined Rivals Elite Trainer Box', imageUrl: 'https://img/etb.jpg', extendedData: [] },
        { productId: 1002, name: 'Destined Rivals Booster Bundle', imageUrl: 'https://img/bb.jpg', extendedData: [] },
      ] },
      1367: { results: [
        { productId: 4001, name: 'Rising Rivals Booster Pack', imageUrl: 'https://img/rr.jpg', extendedData: [] },
      ] },
    }
    const DISAMBIG_PRICES: Record<number, { results: unknown[] }> = {
      24655: { results: [{ productId: 3001, subTypeName: 'Normal', marketPrice: 15 }] },
      24269: { results: [
        { productId: 1001, subTypeName: 'Normal', marketPrice: 40 },
        { productId: 1002, subTypeName: 'Normal', marketPrice: 20 },
      ] },
      1367: { results: [{ productId: 4001, subTypeName: 'Normal', marketPrice: 5 }] },
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
      expect(out.some((r) => r.externalId.startsWith('tcgcsv:24655:'))).toBe(false)
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
