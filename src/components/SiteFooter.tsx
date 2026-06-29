'use client'

import Image from 'next/image'
import { useT } from '@/lib/i18n'

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="relative z-10 mt-16 border-t border-border">
      <div className="bg-gradient-to-br from-[#14102b] via-[#1b1240] to-[#2c1a60]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
              <Image
                src="/logo-dark.jpg"
                alt="TCG Archive"
                fill
                sizes="64px"
                className="object-cover"
              />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-white">
                TCG<span className="text-[#b98cf8]"> Archive</span>
              </p>
              <p className="mt-0.5 text-sm text-white/55">{t('footer_tagline')}</p>
            </div>
          </div>
          <p className="text-xs text-white/40">© 2026 TCG Archive</p>
        </div>
      </div>
    </footer>
  )
}
