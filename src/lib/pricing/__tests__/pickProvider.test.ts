import { describe, it, expect } from 'vitest'
import { pickProvider } from '@/lib/pricing'

describe('pickProvider', () => {
  it('routes a sealed tcgcsv id to the tcgcsv provider', () => {
    const i = { game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:1:2' }
    expect(pickProvider(i).supports(i)).toBe(true)
  })
  it('routes a Pokémon card id to the TCGdex provider', () => {
    const i = { game: 'POKEMON', itemType: 'RAW', externalId: 'sv10-165' }
    expect(pickProvider(i).supports(i)).toBe(true)
  })
  it('falls back to manual when there is no externalId', async () => {
    const i = { game: 'POKEMON', itemType: 'RAW', externalId: null }
    expect(await pickProvider(i).fetchPrice(i)).toBeNull()
  })
  it('falls back to manual for a graded slab (its value diverges from the raw card)', async () => {
    const i = { game: 'POKEMON', itemType: 'GRADED', externalId: 'sv10-165' }
    expect(await pickProvider(i).fetchPrice(i)).toBeNull()
  })
})
