'use client'

import { useT } from '@/lib/i18n'

// Brand-associated accent colors (colors/names, not copyrighted logo artwork).
const GAME_COLOR: Record<string, string> = {
  POKEMON: '#eab308',
  MAGIC: '#ea7317',
  YUGIOH: '#a67c00',
  ONEPIECE: '#e0334b',
  OTHER: '#9d5cf5',
}

export function GameBadge({ game }: { game: string }) {
  const t = useT()
  const color = GAME_COLOR[game] ?? GAME_COLOR.OTHER
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-fg"
      style={{ backgroundColor: `${color}1a`, borderColor: `${color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {t(`game_${game}`)}
    </span>
  )
}
