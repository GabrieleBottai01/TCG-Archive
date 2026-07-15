import { NextRequest, NextResponse } from 'next/server'
import { fetchTcgdexPriceEur } from '@/lib/pricing/tcgdex'
import { requireUserId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 })
  const priceEur = await fetchTcgdexPriceEur(id)
  return NextResponse.json({ priceEur })
}
