'use client'

import Image from 'next/image'
import { useT } from '@/lib/i18n'

export function SiteFooter() {
  const t = useT()
  return (
    // Stays dark in both light and dark themes by design.
    <footer className="relative z-10 mt-16">
      {/* Fancy neon hairline across the top of the band. */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#9d5cf5] to-transparent opacity-70" />
      <div className="bg-gradient-to-br from-[#14102b] via-[#1b1240] to-[#2c1a60]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 shadow-[0_0_28px_-8px_rgba(157,92,245,0.7)]">
              <Image
                src="/logo-mark-dark.jpg"
                alt="TCG Archive"
                fill
                sizes="56px"
                className="object-cover object-center"
              />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-bold text-white">
                TCG<span className="text-[#b98cf8]"> Archive</span>
              </p>
              <p className="text-sm text-white/55">{t('footer_tagline')}</p>
            </div>
          </div>
          <p className="text-xs text-white/40 shrink-0">© 2026 TCG Archive</p>
        </div>
      </div>
    </footer>
  )
}
