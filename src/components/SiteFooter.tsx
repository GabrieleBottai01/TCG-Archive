'use client'

import Image from 'next/image'
import { useT } from '@/lib/i18n'

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="relative z-10 mt-16 border-t border-border">
      {/* Stays dark in both light and dark themes by design. */}
      <div className="bg-gradient-to-br from-[#14102b] via-[#1b1240] to-[#2c1a60]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 shadow-[0_0_40px_-8px_rgba(157,92,245,0.6)]">
              <Image
                src="/logo-mark-dark.jpg"
                alt="TCG Archive"
                fill
                sizes="96px"
                className="object-cover scale-105"
              />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-white">
                TCG<span className="text-[#b98cf8]"> Archive</span>
              </p>
              <p className="mt-1 text-base text-white/60">{t('footer_tagline')}</p>
            </div>
          </div>
          <p className="text-sm text-white/40">© 2026 TCG Archive</p>
        </div>
      </div>
    </footer>
  )
}
