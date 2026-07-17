import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchSealed, __resetEbayCache } from '@/lib/observatory/ebay'

const OAUTH = 'https://api.ebay.com/identity/v1/oauth2/token'
const SEARCH = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response

const token = (expiresIn = 7200) =>
  json({ access_token: 'v^1.1#tok', expires_in: expiresIn, token_type: 'Application Access Token' })

// Copied verbatim from docs/reference/ebay-browse-sample.json — the three real
// itemSummaries a single `Elite Trainer Box` query returned on EBAY_IT. The
// third (conditionId 3000, USED) is the one whose title says "Sealed OVP" — kept
// here on purpose so the parser's fidelity to the real shape can be asserted.
const REAL_RESPONSE = {
  href: `${SEARCH}?q=Elite+Trainer+Box&limit=3&offset=0`,
  total: 16377,
  itemSummaries: [
    {
      itemId: 'v1|398166192339|0',
      title: '✅🇬🇧Pokémon 30th Celebration Elite Trainer Box ETB English🇬🇧 Sealed Preorder✅',
      price: { value: '299.90', currency: 'EUR' },
      seller: { username: 'bodur_34', sellerAccountType: 'INDIVIDUAL' },
      condition: 'Sigillato/Nuovo',
      conditionId: '1000',
      buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
      listingMarketplaceId: 'EBAY_IT',
    },
    {
      itemId: 'v1|318593015629|0',
      title: 'Pokémon 30th Anniversary Celebration Elite Trainer Box ETB Ships 10/23 preorder.',
      price: { value: '199.00', currency: 'EUR' },
      seller: { username: 'simspec-56', sellerAccountType: 'INDIVIDUAL' },
      condition: 'Sigillato/Nuovo',
      conditionId: '1000',
      buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
      listingMarketplaceId: 'EBAY_IT',
    },
    {
      itemId: 'v1|168540238269|0',
      title: 'Pokemon TCG ME05 Pitch Black Elite Trainer Box ETB Sealed OVP English Card PSA',
      price: { value: '94.90', currency: 'EUR' },
      seller: { username: 'cards4kidz', sellerAccountType: 'BUSINESS' },
      condition: 'Non Sigillato/Usato',
      conditionId: '3000',
      buyingOptions: ['FIXED_PRICE'],
      listingMarketplaceId: 'EBAY_IT',
    },
  ],
}

/** Stub fetch, routing the OAuth and the search endpoints separately. */
function stubEbay(searchResponse: unknown, tokenResponse: Response = token()) {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).startsWith(OAUTH) ? tokenResponse : json(searchResponse),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The (url, init) pairs fetch was called with — `init` is the second real arg. */
function fetchCalls(mock: ReturnType<typeof stubEbay>): Array<[string, RequestInit]> {
  return mock.mock.calls as unknown as Array<[string, RequestInit]>
}

describe('searchSealed', () => {
  beforeEach(() => {
    __resetEbayCache()
    vi.stubEnv('EBAY_APP_ID', 'app-id')
    vi.stubEnv('EBAY_CERT_ID', 'cert-id')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('maps the real itemSummary shape onto EbayListing', async () => {
    stubEbay(REAL_RESPONSE)
    const listings = await searchSealed('Elite Trainer Box', 'EBAY_IT')

    expect(listings).toHaveLength(3)
    expect(listings[0]).toEqual({
      ebayItemId: 'v1|398166192339|0',
      title: '✅🇬🇧Pokémon 30th Celebration Elite Trainer Box ETB English🇬🇧 Sealed Preorder✅',
      priceEur: 299.9,
      conditionId: '1000',
      buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
      sellerAccountType: 'INDIVIDUAL',
    })
    // The used listing is parsed faithfully, NOT gated here — gating is Task 6.
    expect(listings[2].conditionId).toBe('3000')
    expect(listings[2].sellerAccountType).toBe('BUSINESS')
    expect(listings[2].priceEur).toBe(94.9)
  })

  it('sends the marketplace header and a bearer token to the search endpoint', async () => {
    const fetchMock = stubEbay(REAL_RESPONSE)
    await searchSealed('Elite Trainer Box', 'EBAY_DE')

    const [url, init] = fetchCalls(fetchMock).find(([u]) => u.startsWith(SEARCH))!
    expect(url).toContain('q=Elite+Trainer+Box')
    const headers = init.headers as Record<string, string>
    expect(headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_DE')
    expect(headers['Authorization']).toBe('Bearer v^1.1#tok')
  })

  it('requests a client_credentials token with Basic auth from the env credentials', async () => {
    const fetchMock = stubEbay(REAL_RESPONSE)
    await searchSealed('Elite Trainer Box', 'EBAY_IT')

    const [, init] = fetchCalls(fetchMock).find(([u]) => u.startsWith(OAUTH))!
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${btoa('app-id:cert-id')}`)
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(String(init.body)).toContain('grant_type=client_credentials')
    expect(String(init.body)).toContain('scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope')
  })

  it('caches the token across searches — one token fetch, two searches', async () => {
    const fetchMock = stubEbay(REAL_RESPONSE)
    await searchSealed('Elite Trainer Box', 'EBAY_IT')
    await searchSealed('Booster Bundle', 'EBAY_IT')

    const tokenFetches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith(OAUTH)).length
    expect(tokenFetches).toBe(1)
  })

  it('refreshes the token once it has expired', async () => {
    vi.useFakeTimers()
    const fetchMock = stubEbay(REAL_RESPONSE, token(7200))
    await searchSealed('Elite Trainer Box', 'EBAY_IT')
    vi.advanceTimersByTime(7201 * 1000) // past expires_in
    await searchSealed('Elite Trainer Box', 'EBAY_IT')

    const tokenFetches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith(OAUTH)).length
    expect(tokenFetches).toBe(2)
  })

  it('returns [] without any fetch for a blank query', async () => {
    const fetchMock = stubEbay(REAL_RESPONSE)
    expect(await searchSealed('   ', 'EBAY_IT')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns [] when the credentials are missing', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('EBAY_APP_ID', '')
    vi.stubEnv('EBAY_CERT_ID', '')
    const fetchMock = stubEbay(REAL_RESPONSE)
    expect(await searchSealed('Elite Trainer Box', 'EBAY_IT')).toEqual([])
    // No point calling eBay with no credentials.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns [] when the token request fails', async () => {
    stubEbay(REAL_RESPONSE, { ok: false, status: 401 } as Response)
    expect(await searchSealed('Elite Trainer Box', 'EBAY_IT')).toEqual([])
  })

  it('returns [] when the search request fails', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).startsWith(OAUTH) ? token() : ({ ok: false, status: 500 }) as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchSealed('Elite Trainer Box', 'EBAY_IT')).toEqual([])
  })

  it('returns [] when the response carries no itemSummaries', async () => {
    stubEbay({ total: 0 })
    expect(await searchSealed('Nonexistent Product', 'EBAY_IT')).toEqual([])
  })

  it('drops a listing whose price is not EUR — priceEur must not lie about the currency', async () => {
    stubEbay({
      itemSummaries: [
        { itemId: 'gbp|1', title: 'ETB', price: { value: '80.00', currency: 'GBP' }, conditionId: '1000', buyingOptions: ['FIXED_PRICE'], seller: { sellerAccountType: 'INDIVIDUAL' } },
        { itemId: 'eur|2', title: 'ETB', price: { value: '90.00', currency: 'EUR' }, conditionId: '1000', buyingOptions: ['FIXED_PRICE'], seller: { sellerAccountType: 'INDIVIDUAL' } },
      ],
    })
    const listings = await searchSealed('Elite Trainer Box', 'EBAY_IT')
    expect(listings).toHaveLength(1)
    expect(listings[0].ebayItemId).toBe('eur|2')
  })

  it('drops a listing with no parseable price rather than emitting NaN', async () => {
    stubEbay({
      itemSummaries: [
        { itemId: 'noprice|1', title: 'ETB', conditionId: '1000', buyingOptions: ['FIXED_PRICE'], seller: { sellerAccountType: 'INDIVIDUAL' } },
        { itemId: 'ok|2', title: 'ETB', price: { value: '90.00', currency: 'EUR' }, conditionId: '1000', buyingOptions: ['FIXED_PRICE'], seller: { sellerAccountType: 'INDIVIDUAL' } },
      ],
    })
    const listings = await searchSealed('Elite Trainer Box', 'EBAY_IT')
    expect(listings.map((l) => l.ebayItemId)).toEqual(['ok|2'])
  })
})
