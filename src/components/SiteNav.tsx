'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useT } from '@/lib/i18n'
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        <Link href="/" className="font-display text-lg font-bold text-fg shrink-0">
          TCG<span className="text-primary"> Archive</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {link('/', t('nav_dashboard'))}
          {link('/collezione', t('nav_collection'))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <LanguageToggle />
          <ThemeToggle />
          {userEmail ? (
            <div className="flex items-center gap-3">
              <span className="max-w-[12rem] truncate text-sm text-muted">
                {userName ?? userEmail}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="rounded border border-border px-3 py-1 text-sm text-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('auth_logout')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/login" className="text-muted transition-colors hover:text-fg">
                {t('auth_login')}
              </Link>
              <Link
                href="/register"
                className="rounded bg-primary px-3 py-1 font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
