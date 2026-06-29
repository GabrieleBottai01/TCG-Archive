'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n'

export type SetSearchResult = {
  setId: string
  name: string
  series: string
  imageUrl: string | null
}

export function SetSearch({ onPick }: { onPick: (r: SetSearchResult) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SetSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = query.trim()
    const delay = term ? 300 : 0
    const id = setTimeout(async () => {
      if (!term) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/sets/search?q=${encodeURIComponent(term)}`)
        const data = (await res.json()) as { results?: SetSearchResult[] }
        setResults(data.results ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, delay)
    return () => clearTimeout(id)
  }, [query])

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('m_searchSetPlaceholder')}
        className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
          {results.map((r) => (
            <li key={r.setId}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-primary-soft transition-colors"
              >
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt={r.name} className="h-10 w-16 object-contain shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium text-fg truncate">{r.name}</span>
                  <span className="block text-xs text-muted truncate">{r.series}</span>
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
