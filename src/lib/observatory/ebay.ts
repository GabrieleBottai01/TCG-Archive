// The eBay Browse API client for the price observatory.
//
// Built from ONE real response saved to docs/reference/ebay-browse-sample.json
// (Task 1 verification, 2026-07-17) — every field name and shape below was read
// off that document, not guessed. The three things the real response settled:
//  - Prices are native EUR on EBAY_IT (`price.currency === 'EUR'`) — no FX here.
//  - There is NO availability/quantity field in the search response, so this
//    client carries no `quantity`: the confirmed-sale-by-quantity-drop signal is
//    deferred (see the plan's "Task 1 verification — RESULT").
//  - `conditionId` / `buyingOptions` / `sellerAccountType` ARE present, and are
//    what Task 6 gates on. This client only PARSES them; it does not gate.
//
// Shaped like src/lib/pricing/tcgdex.ts on purpose: a `getJson` that swallows
// errors to null, a module-scope cache, and a `__reset*` export for tests.

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
const SCOPE = 'https://api.ebay.com/oauth/api_scope'
const SEARCH_LIMIT = 50
// Refresh a little before the real expiry so an in-flight request never races a
// just-expired token.
const EXPIRY_MARGIN_MS = 60 * 1000

export type Marketplace = 'EBAY_IT' | 'EBAY_DE'

/**
 * A sealed-product listing, reduced to what the observatory needs. The structured
 * fields (`conditionId`, `buyingOptions`, `sellerAccountType`) are the primary
 * gate in Task 6; the daily job decides on them, this client only reports them.
 * `priceEur` is asserted EUR at parse time — a listing in another currency is
 * dropped rather than mislabelled.
 */
export type EbayListing = {
  ebayItemId: string
  title: string
  priceEur: number
  conditionId: string | null
  buyingOptions: string[]
  sellerAccountType: string | null
}

// --- raw response shapes, exactly as they appear in the real sample ----------
type RawPrice = { value?: string; currency?: string }
type RawSeller = { sellerAccountType?: string }
type RawItemSummary = {
  itemId?: string
  title?: string
  price?: RawPrice
  conditionId?: string
  buyingOptions?: string[]
  seller?: RawSeller
}
type RawSearchResponse = { itemSummaries?: RawItemSummary[] }
type RawToken = { access_token?: string; expires_in?: number }

let tokenCache: { token: string; expiresAt: number } | null = null

/** Test-only: clear the module-scope OAuth token cache between cases. */
export function __resetEbayCache(): void {
  tokenCache = null
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * A client-credentials OAuth token, cached until (just before) it expires.
 * Returns null when credentials are absent or the grant fails — the caller then
 * simply returns no listings, exactly like a failed fetch.
 */
async function getToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  if (!appId || !certId) return null

  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE })
  const grant = await getJson<RawToken>(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${appId}:${certId}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const token = grant?.access_token
  if (!token) return null
  const ttlMs = (typeof grant?.expires_in === 'number' ? grant.expires_in : 0) * 1000
  tokenCache = { token, expiresAt: Date.now() + Math.max(0, ttlMs - EXPIRY_MARGIN_MS) }
  return token
}

/** One raw itemSummary → an EbayListing, or null if it is unusable. */
function toListing(item: RawItemSummary): EbayListing | null {
  if (!item.itemId || !item.title) return null
  // priceEur must never lie about the currency: only assert it for a real EUR
  // price, and drop anything else rather than emit a wrong or NaN value.
  if (item.price?.currency !== 'EUR') return null
  const priceEur = Number(item.price?.value)
  if (!Number.isFinite(priceEur)) return null

  return {
    ebayItemId: item.itemId,
    title: item.title,
    priceEur,
    conditionId: item.conditionId ?? null,
    buyingOptions: item.buyingOptions ?? [],
    sellerAccountType: item.seller?.sellerAccountType ?? null,
  }
}

/**
 * Search one marketplace for sealed listings matching `query`. Returns [] on a
 * blank query, missing credentials, or any failure — the observatory treats "no
 * data today" and "the call failed" identically, so nothing here throws.
 */
export async function searchSealed(query: string, marketplace: Marketplace): Promise<EbayListing[]> {
  const q = query.trim()
  if (!q) return []

  const token = await getToken()
  if (!token) return []

  // URLSearchParams encodes spaces as `+`, matching the real sample's query
  // string (`q=Elite+Trainer+Box`); eBay accepts `+` and `%20` interchangeably.
  const params = new URLSearchParams({ q, limit: String(SEARCH_LIMIT) })
  const url = `${SEARCH_URL}?${params.toString()}`
  const res = await getJson<RawSearchResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplace,
    },
  })

  const items = res?.itemSummaries
  if (!items || items.length === 0) return []
  return items.map(toListing).filter((l): l is EbayListing => l !== null)
}
