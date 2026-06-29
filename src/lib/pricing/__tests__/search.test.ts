import { it, expect, vi, afterEach } from 'vitest'
import { searchPokemonCards, searchPokemonSets } from '@/lib/pricing/search'
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

it('maps API sets to set search results (logo as image)', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    data: [{ id: 'sv3pt5', name: '151', series: 'Scarlet & Violet',
      images: { logo: 'http://img/logo.png', symbol: 'http://img/sym.png' } }]
  }), { status: 200 }))
  const r = await searchPokemonSets('151', 'key')
  expect(r).toEqual([{ setId: 'sv3pt5', name: '151', series: 'Scarlet & Violet', imageUrl: 'http://img/logo.png' }])
})

it('set search returns [] for blank query', async () => {
  expect(await searchPokemonSets('  ')).toEqual([])
})
