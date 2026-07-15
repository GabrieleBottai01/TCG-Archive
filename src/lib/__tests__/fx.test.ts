import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getUsdToEurRate, FALLBACK_USD_EUR, __resetFxCache } from '@/lib/fx'

const okResponse = (rate: number) =>
  ({ ok: true, json: async () => ({ amount: 1, base: 'USD', date: '2026-07-14', rates: { EUR: rate } }) }) as Response

describe('getUsdToEurRate', () => {
  beforeEach(() => __resetFxCache())
  afterEach(() => vi.unstubAllGlobals())

  it('returns the live rate from the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(0.87681)))
    expect(await getUsdToEurRate()).toBe(0.87681)
  })

  it('caches the rate so a second call does not refetch', async () => {
    const spy = vi.fn(async () => okResponse(0.9))
    vi.stubGlobal('fetch', spy)
    await getUsdToEurRate()
    await getUsdToEurRate()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    expect(await getUsdToEurRate()).toBe(FALLBACK_USD_EUR)
  })

  it('falls back when the payload has no EUR rate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ rates: {} }) }) as Response))
    expect(await getUsdToEurRate()).toBe(FALLBACK_USD_EUR)
  })
})
