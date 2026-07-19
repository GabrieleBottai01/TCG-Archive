import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/session'
import { sealedPrice } from '@/lib/pricing/sealedPrice'
import { liveEbayEstimate } from '@/lib/pricing/ebayEstimate'

// Live sealed estimate for the add/edit modal. Primary value is Cardtrader-first
// (see sealedPrice); the eBay median is always returned too, for the modal's
// comparison line. Auth-gated because it spends external API calls.
export async function GET(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') ?? ''
  const priceQuery = req.nextUrl.searchParams.get('priceQuery') ?? ''
  const lang = req.nextUrl.searchParams.get('lang') ?? 'IT'
  const blueprintParam = req.nextUrl.searchParams.get('blueprintId')
  const cardtraderBlueprintId = blueprintParam ? Number(blueprintParam) : null

  if (!name.trim() && !priceQuery.trim()) {
    return NextResponse.json({ eur: null, sampleSize: 0, source: null, cardtraderBlueprintId: null, ebay: { eur: null, sampleSize: 0 } })
  }

  try {
    const [primary, ebay] = await Promise.all([
      sealedPrice({ game: 'POKEMON', itemType: 'SEALED', externalId: 'tcgcsv:x', name, priceQuery, language: lang, cardtraderBlueprintId }),
      liveEbayEstimate(priceQuery || name, lang),
    ])
    return NextResponse.json({
      eur: primary?.value ?? null,
      sampleSize: ebay.sampleSize, // (see note) modal shows offers/annunci per source below
      source: primary?.origin ?? null,
      cardtraderBlueprintId: primary?.cardtraderBlueprintId ?? cardtraderBlueprintId,
      ebay: { eur: ebay.eur, sampleSize: ebay.sampleSize },
    })
  } catch {
    return NextResponse.json({ eur: null, sampleSize: 0, source: null, cardtraderBlueprintId, ebay: { eur: null, sampleSize: 0 } }, { status: 502 })
  }
}
