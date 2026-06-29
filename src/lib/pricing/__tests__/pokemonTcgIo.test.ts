import { describe, it, expect, vi, afterEach } from 'vitest'
import { PokemonTcgIoProvider } from '@/lib/pricing/pokemonTcgIo'
import { pickProvider } from '@/lib/pricing'

afterEach(() => vi.restoreAllMocks())

describe('PokemonTcgIoProvider', () => {
  const p = new PokemonTcgIoProvider('key')
  it('supports only Pokémon raw with externalId', () => {
    expect(p.supports({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' })).toBe(true)
    expect(p.supports({ game: 'POKEMON', itemType: 'RAW', externalId: null })).toBe(false)
    expect(p.supports({ game: 'MAGIC', itemType: 'RAW', externalId: 'x' })).toBe(false)
  })
  it('returns lowPrice as AUTO', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { cardmarket: { prices: { lowPrice: 3.5, trendPrice: 4 } } }
    }), { status: 200 }))
    expect(await p.fetchPrice({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' }))
      .toEqual({ value: 3.5, source: 'AUTO' })
  })
  it('returns null when no cardmarket price', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { cardmarket: null } }), { status: 200 }))
    expect(await p.fetchPrice({ game: 'POKEMON', itemType: 'RAW', externalId: 'xy1-1' })).toBeNull()
  })
})

describe('pickProvider', () => {
  it('returns manual for non-Pokémon-raw', () => {
    const r = pickProvider({ game: 'MAGIC', itemType: 'SEALED', externalId: null })
    expect(r.supports({ game: 'MAGIC', itemType: 'SEALED', externalId: null })).toBe(false)
  })
})
