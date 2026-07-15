import { it, expect, vi, afterEach } from 'vitest'
import { searchPokemonCards } from '@/lib/pricing/search'
import * as tcgdex from '@/lib/pricing/tcgdex'

afterEach(() => vi.restoreAllMocks())

it('delegates to TCGdex and carries no price (the list endpoint has none — it is fetched on pick)', async () => {
  vi.spyOn(tcgdex, 'searchTcgdexCards').mockResolvedValue([
    { externalId: 'sv10-165', name: 'Venusaur', setName: 'Scarlet & Violet', cardNumber: '165', imageUrl: 'http://img/1.png' },
  ])
  const r = await searchPokemonCards('venu')
  expect(r).toEqual([
    { externalId: 'sv10-165', name: 'Venusaur', setName: 'Scarlet & Violet', cardNumber: '165', imageUrl: 'http://img/1.png' },
  ])
})

it('returns [] when TCGdex returns no results', async () => {
  vi.spyOn(tcgdex, 'searchTcgdexCards').mockResolvedValue([])
  expect(await searchPokemonCards('  ')).toEqual([])
})
