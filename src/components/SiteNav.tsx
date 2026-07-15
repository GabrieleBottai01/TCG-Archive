'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useT } from '@/lib/i18n'
import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'

export function SiteNav({
  userEmail,
  userName,
}: {
  userEmail?: string | null
  userName?: string | null
}) {
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
      {/* Wraps rather than overflowing: the bar's contents (brand + links +
          toggles + account) are far wider than a phone, and a fixed h-16 row
          pushed the whole page into horizontal scroll at 390px. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6">
        <Link href="/" className="flex items-center gap-2 font-display text-base sm:text-lg font-bold text-fg shrink-0">
          <BrandMark size={32} />
          TCG<span className="text-primary"> Archive</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-5 text-sm">
          {link('/', t('nav_dashboard'))}
          {link('/collezione', t('nav_collection'))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <ThemeToggle />
          {userEmail ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* The address is the least useful thing here on a narrow screen. */}
              <span className="hidden md:inline max-w-[12rem] truncate text-sm text-muted">
                {userName ?? userEmail}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="rounded border border-border px-2 sm:px-3 py-1 text-sm text-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
              >
                {t('auth_logout')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3 text-sm">
              <Link href="/login" className="text-muted transition-colors hover:text-fg whitespace-nowrap">
                {t('auth_login')}
              </Link>
              <Link
                href="/register"
                className="rounded bg-primary px-2 sm:px-3 py-1 font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
              >
                {t('auth_register')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
