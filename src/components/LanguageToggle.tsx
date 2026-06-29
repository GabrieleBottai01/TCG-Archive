'use client'

import { useLang, setLang, type Lang } from '@/lib/i18n'

const LANGS: Lang[] = ['it', 'en']

export function LanguageToggle() {
  const lang = useLang()
  return (
    <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-semibold">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === 'it' ? 'Italiano' : 'English'}
          className={`rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            lang === l ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
