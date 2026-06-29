import { NextRequest, NextResponse } from 'next/server'
import { searchPokemonSets } from '@/lib/pricing/search'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const results = await searchPokemonSets(q, process.env.POKEMONTCGIO_API_KEY)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Ricerca non disponibile' }, { status: 502 })
  }
}
