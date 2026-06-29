import { it, expect, vi, afterEach } from 'vitest'
import { searchPokemonCards } from '@/lib/pricing/search'
afterEach(() => vi.restoreAllMocks())

it('maps API cards to search results', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    data: [{ id: 'xy1-1', name: 'Venusaur', number: '1', set: { name: 'XY' },
      images: { small: 'http://img/1.png' }, cardmarket: { prices: { lowPrice: 2.2 } } }]
  }), { status: 200 }))
  const r = await searchPokemonCards('venu', 'key')
  expect(r).toEqual([{ externalId: 'xy1-1', name: 'Venusaur', setName: 'XY', cardNumber: '1', imageUrl: 'http://img/1.png', lowPrice: 2.2 }])
})

it('returns [] for blank query', async () => {
  expect(await searchPokemonCards('  ')).toEqual([])
})
