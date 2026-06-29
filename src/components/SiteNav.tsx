'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'

export function SiteNav() {
  const t = useT()
  const pathname = usePathname()

  const link = (href: string, label: string) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`transition-colors ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
        <Link href="/" className="font-display text-lg font-bold text-fg shrink-0">
          TCG<span className="text-primary"> Archive</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {link('/', t('nav_dashboard'))}
          {link('/collezione', t('nav_collection'))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
