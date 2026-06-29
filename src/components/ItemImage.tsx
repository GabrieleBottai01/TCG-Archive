'use client'

// Shows an item's image (any URL) or a stylized placeholder by item type + game.
// Uses a plain <img> (arbitrary remote domains) rather than next/image to avoid
// per-domain remotePatterns config.

const GAME_ACCENT: Record<string, string> = {
  POKEMON: '#eab308',
  MAGIC: '#ea7317',
  YUGIOH: '#a67c00',
  ONEPIECE: '#e0334b',
  OTHER: '#9d5cf5',
}

type ItemLike = {
  imageUrl: string | null
  itemType: string
  game: string
  name: string
}

function PlaceholderGlyph({ type }: { type: string }) {
  if (type === 'SEALED') {
    // Booster box
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2/5 w-2/5" aria-hidden="true">
        <path d="M3 8l9-4 9 4-9 4-9-4z" />
        <path d="M3 8v8l9 4 9-4V8" />
        <path d="M12 12v8" />
      </svg>
    )
  }
  if (type === 'GRADED') {
    // Slabbed card
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2/5 w-2/5" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <rect x="8" y="7" width="8" height="8" rx="1" />
        <path d="M9 18h6" />
      </svg>
    )
  }
  // RAW card (stacked)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2/5 w-2/5" aria-hidden="true">
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  )
}

export function ItemImage({ item, className = '' }: { item: ItemLike; className?: string }) {
  const accent = GAME_ACCENT[item.game] ?? GAME_ACCENT.OTHER

  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt={item.name}
        loading="lazy"
        className={`object-contain ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `radial-gradient(120% 120% at 50% 0%, ${accent}26, transparent 70%), var(--card)`,
        color: accent,
      }}
      aria-hidden="true"
    >
      <PlaceholderGlyph type={item.itemType} />
    </div>
  )
}
