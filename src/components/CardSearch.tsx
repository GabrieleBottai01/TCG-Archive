'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n'

export type CardSearchResult = {
  externalId: string
  name: string
  setName: string
  cardNumber: string
  imageUrl: string | null
}

interface CardSearchProps {
  onPick: (result: CardSearchResult) => void
}

export function CardSearch({ onPick }: CardSearchProps) {
  const t = useT()
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
        placeholder={t('m_searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {loading && (
        <p className="text-xs text-muted">Ricerca in corso...</p>
      )}
      {!loading && results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
          {results.map((r) => (
            <li key={r.externalId}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-primary-soft transition-colors"
                onClick={() => {
                  onPick(r)
                  setQuery('')
                  setResults([])
                }}
              >
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt={r.name} className="h-16 w-12 object-contain rounded shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium text-fg truncate">{r.name}</span>
                  <span className="block text-xs text-muted truncate">
                    {r.setName} {r.cardNumber ? `· #${r.cardNumber}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim() && results.length === 0 && (
        <p className="text-xs text-muted">{t('m_noResults')}</p>
      )}
    </div>
  )
}
