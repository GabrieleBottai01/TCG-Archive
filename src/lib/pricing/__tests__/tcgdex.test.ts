import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchTcgdexCards, fetchTcgdexPriceEur, __resetTcgdexCache } from '@/lib/pricing/tcgdex'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

const SETS = [{ id: 'sv10', name: 'Rivali Predestinati' }, { id: 'sm8', name: 'Anime Folgoranti' }]
const CARDS = [
  { id: 'sv10-165', localId: '165', name: 'Avventura di Armonio', image: 'https://assets.tcgdex.net/it/sv/sv10/165' },
]

describe('searchTcgdexCards', () => {
  beforeEach(() => __resetTcgdexCache())
  afterEach(() => vi.unstubAllGlobals())

  it('returns Italian cards with set name and a usable image URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/sets') ? json(SETS) : json(CARDS)))
    const [r] = await searchTcgdexCards('Avventura')
    expect(r.externalId).toBe('sv10-165')
    expect(r.name).toBe('Avventura di Armonio')
    expect(r.setName).toBe('Rivali Predestinati')   // resolved from the id prefix
    expect(r.cardNumber).toBe('165')
    expect(r.imageUrl).toBe('https://assets.tcgdex.net/it/sv/sv10/165/high.webp') // suffix required
  })

  it('returns [] for a blank query without calling the API', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await searchTcgdexCards('  ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns [] when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    expect(await searchTcgdexCards('Avventura')).toEqual([])
  })
})

describe('fetchTcgdexPriceEur', () => {
  beforeEach(() => __resetTcgdexCache())
  afterEach(() => vi.unstubAllGlobals())

  it('reads pricing.cardmarket.low', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'sv10-165', pricing: { cardmarket: { unit: 'EUR', low: 0.02, avg: 0.08 } } })))
    expect(await fetchTcgdexPriceEur('sv10-165')).toBe(0.02)
  })

  it('returns null when the card has no cardmarket pricing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'x-1', pricing: { tcgplayer: { unit: 'USD' } } })))
    expect(await fetchTcgdexPriceEur('x-1')).toBeNull()
  })

  it('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as Response))
    expect(await fetchTcgdexPriceEur('nope-1')).toBeNull()
  })
})
