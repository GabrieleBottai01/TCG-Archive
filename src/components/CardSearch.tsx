'use client'

import { useState, useEffect } from 'react'
import { formatEUR } from '@/lib/format'

export type CardSearchResult = {
  externalId: string
  name: string
  setName: string
  cardNumber: string
  imageUrl: string | null
  lowPrice: number | null
}

interface CardSearchProps {
  onPick: (result: CardSearchResult) => void
}

export function CardSearch({ onPick }: CardSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CardSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const delay = query.trim() ? 300 : 0
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`)
        const data = (await res.json()) as { results: CardSearchResult[] }
        setResults(data.results ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Cerca carta Pokémon..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {loading && (
        <p className="text-xs text-gray-500">Ricerca in corso...</p>
      )}
      {!loading && results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {results.map((r) => (
            <li key={r.externalId}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                onClick={() => {
                  onPick(r)
                  setQuery('')
                  setResults([])
                }}
              >
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt={r.name} className="h-10 w-7 object-contain rounded shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 truncate">{r.name}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {r.setName} {r.cardNumber ? `· #${r.cardNumber}` : ''}
                    {r.lowPrice != null ? ` · ${formatEUR(r.lowPrice)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-xs text-gray-500">Nessun risultato trovato.</p>
      )}
    </div>
  )
}
