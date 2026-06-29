import { NextRequest, NextResponse } from 'next/server'
import { searchSealedProducts } from '@/lib/pricing/sealed'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchSealedProducts(q)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Ricerca non disponibile' }, { status: 502 })
  }
}
