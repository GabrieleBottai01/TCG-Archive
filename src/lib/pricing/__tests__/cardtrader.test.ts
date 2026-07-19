import { describe, it, expect, vi } from 'vitest'
import { lowestSealedEur, getPokemonGameId, __resetCardtraderCache, type CtProduct } from '@/lib/pricing/cardtrader'
import { resolveBlueprint, type CtExpansion, type CtBlueprint } from '@/lib/pricing/cardtrader'

// Real single listings have bundle_size === null (confirmed in the Task-1 sample);
// pokemon_language distinguishes markets whose prices differ.
const p = (over: Partial<CtProduct> = {}): CtProduct => ({
  price: { cents: 14000, currency: 'EUR' },
  quantity: 1, bundle_size: null, graded: false, on_vacation: false,
  properties_hash: { pokemon_language: 'it' },
  ...over,
})

describe('lowestSealedEur', () => {
  it('is the minimum EUR price of the qualifying products', () => {
    expect(lowestSealedEur([
      p({ price: { cents: 15000, currency: 'EUR' } }),
      p({ price: { cents: 13500, currency: 'EUR' } }),
      p({ price: { cents: 14200, currency: 'EUR' } }),
    ])).toEqual({ eur: 135, sampleSize: 3 })
  })

  it('drops non-EUR, multi-item lots (bundle_size > 1), graded slabs and vacation sellers', () => {
    expect(lowestSealedEur([
      p({ price: { cents: 9000, currency: 'USD' } }),   // not EUR
      p({ price: { cents: 8000, currency: 'EUR' }, bundle_size: 6 }), // a 6-copy lot, not one unit
      p({ price: { cents: 7000, currency: 'EUR' }, graded: true }),   // graded
      p({ price: { cents: 6000, currency: 'EUR' }, on_vacation: true }), // unbuyable
      p({ price: { cents: 13000, currency: 'EUR' } }), // the only qualifying one (bundle_size null)
    ])).toEqual({ eur: 130, sampleSize: 1 })
  })

  it('filters by pokemon_language when a language is given', () => {
    const products = [
      p({ price: { cents: 5000, currency: 'EUR' }, properties_hash: { pokemon_language: 'en' } }),
      p({ price: { cents: 9000, currency: 'EUR' }, properties_hash: { pokemon_language: 'it' } }),
    ]
    expect(lowestSealedEur(products, 'it')).toEqual({ eur: 90, sampleSize: 1 }) // ignores the cheaper EN listing
    expect(lowestSealedEur(products)).toEqual({ eur: 50, sampleSize: 2 })       // no language filter → both
  })

  it('returns null when nothing qualifies', () => {
    expect(lowestSealedEur([p({ price: { cents: 9000, currency: 'USD' } })])).toEqual({ eur: null, sampleSize: 0 })
  })
})

describe('getPokemonGameId', () => {
  it('reads the { array: [...] } envelope from /games', async () => {
    __resetCardtraderCache()
    const prev = process.env.CARDTRADER_JWT
    process.env.CARDTRADER_JWT = 'test'
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ array: [{ id: 3, name: 'Magic' }, { id: 5, name: 'Pokémon' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      expect(await getPokemonGameId()).toBe(5)
    } finally {
      vi.unstubAllGlobals()
      __resetCardtraderCache()
      process.env.CARDTRADER_JWT = prev
    }
  })
})

const EXPS: CtExpansion[] = [
  { id: 10, game_id: 1, code: 'PAF', name: 'Paldean Fates' },
  { id: 11, game_id: 1, code: 'PAR', name: 'Paradox Rift' },
]
const BLUEPRINTS: Record<number, CtBlueprint[]> = {
  10: [
    { id: 100, name: 'Paldean Fates Elite Trainer Box', expansion_id: 10 },
    { id: 101, name: 'Paldean Fates Booster Bundle', expansion_id: 10 },
    { id: 102, name: 'Paldean Fates Booster Box', expansion_id: 10 },
  ],
  11: [{ id: 110, name: 'Paradox Rift Elite Trainer Box', expansion_id: 11 }],
}
const lookup = (id: number) => BLUEPRINTS[id] ?? []

describe('resolveBlueprint', () => {
  it('maps an English catalogue name to the right expansion + product-type blueprint', () => {
    expect(resolveBlueprint('Paldean Fates Elite Trainer Box', EXPS, lookup)).toBe(100)
  })
  it('distinguishes product types within the same expansion', () => {
    expect(resolveBlueprint('Paldean Fates Booster Box', EXPS, lookup)).toBe(102)
  })
  it('returns null when no expansion name is contained in the product name', () => {
    expect(resolveBlueprint('Surging Sparks Elite Trainer Box', EXPS, lookup)).toBeNull()
  })
})
