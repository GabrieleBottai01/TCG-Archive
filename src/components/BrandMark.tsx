// The TCGArchive medallion, redrawn from loghi/TCGArchive_{Dark,Light}.jpg:
// a brushed-silver ring around a neon-violet stack of cards under a Poké Ball.
// Drawn rather than shipped as the source JPGs — those bake in their own
// background and do not scale. The ring is also where the app's brushed-metal
// treatment (see `.slab` in globals.css) comes from.
//
// Below ~32px the Poké Ball and the stack's edges collapse into a smudge, so
// `size` should stay at or above that.

export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="TCGArchive"
    >
      <defs>
        {/* Brushed metal: alternating light/dark stops read as machined striations. */}
        <linearGradient id="bm-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8d89a6" />
          <stop offset=".10" stopColor="#f4f2fb" />
          <stop offset=".22" stopColor="#9d99b4" />
          <stop offset=".34" stopColor="#e9e7f3" />
          <stop offset=".47" stopColor="#77738f" />
          <stop offset=".60" stopColor="#efedf7" />
          <stop offset=".74" stopColor="#8b87a4" />
          <stop offset=".88" stopColor="#e4e2ef" />
          <stop offset="1" stopColor="#6f6a8c" />
        </linearGradient>
        {/* The neon burns brightest at the Poké Ball and cools down the stack. */}
        <linearGradient id="bm-neon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdf7ff" />
          <stop offset=".28" stopColor="#e6c8ff" />
          <stop offset=".62" stopColor="#a855f7" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="bm-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="50" cy="50" r="49" fill="url(#bm-ring)" />
      {/* Interior follows the theme — see --medallion-* in globals.css. */}
      <circle cx="50" cy="50" r="42.5" fill="var(--medallion-step)" />
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="url(#bm-ring)" strokeWidth="3" />
      <circle cx="50" cy="50" r="36" fill="var(--medallion-face)" />

      <g
        filter="url(#bm-glow)"
        fill="none"
        stroke="url(#bm-neon)"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M50 57 74 68 50 79 26 68z" />
        <path d="M50 49 74 60 50 71 26 60z" />
        <path d="M50 41 74 52 50 63 26 52z" />
        <circle cx="50" cy="38" r="13.5" />
        <path d="M36.5 38h27" />
        <circle cx="50" cy="38" r="4.4" />
      </g>
    </svg>
  )
}
