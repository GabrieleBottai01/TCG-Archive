'use client'

import Image from 'next/image'
import { useT } from '@/lib/i18n'

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="relative z-10 mt-16">
      {/* Fancy neon hairline across the top of the band. */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />
      {/* Violet-tinted band that follows the active theme (light or dark). */}
      <div className="border-t border-border bg-gradient-to-br from-surface via-surface to-primary-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-border shadow-[0_0_28px_-8px_var(--glow)]">
              <Image
                src="/logo-mark-light.jpg"
                alt="TCG Archive"
                fill
                sizes="56px"
                className="object-cover object-center dark:hidden"
              />
              <Image
                src="/logo-mark-dark.jpg"
                alt="TCG Archive"
                fill
                sizes="56px"
                className="hidden object-cover object-center dark:block"
              />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-bold text-fg">
                TCG<span className="text-primary"> Archive</span>
              </p>
              <p className="text-sm text-muted">{t('footer_tagline')}</p>
            </div>
          </div>
          <p className="text-xs text-muted shrink-0">© 2026 Gabriele Bottai</p>
        </div>
      </div>
    </footer>
  )
}
