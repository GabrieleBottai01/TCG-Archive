import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/session'
import { liveEbayEstimate } from '@/lib/pricing/ebayEstimate'

// Live European price estimate for a sealed product: the median of current eBay
// IT+DE listings that pass the observatory's gates. Auth-gated because it spends
// eBay Browse API calls.
export async function GET(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') ?? ''
  const lang = req.nextUrl.searchParams.get('lang') ?? 'IT'
  if (!name.trim()) return NextResponse.json({ eur: null, sampleSize: 0 })

  try {
    const estimate = await liveEbayEstimate(name, lang)
    return NextResponse.json(estimate)
  } catch {
    return NextResponse.json({ eur: null, sampleSize: 0 }, { status: 502 })
  }
}
