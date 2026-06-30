'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useT } from '@/lib/i18n'

const fieldClass =
  'w-full rounded border border-border bg-card px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function RegisterPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || null, email, password }),
    })
    if (res.status === 409) {
      setError(t('auth_emailTaken'))
      setPending(false)
      return
    }
    if (!res.ok) {
      setError(t('auth_genericErr'))
      setPending(false)
      return
    }
    await signIn('credentials', { email, password, redirect: false })
    window.location.href = '/'
  }

  return (
    <div className="max-w-sm mx-auto mt-16 rounded-xl border border-border bg-card p-6">
      <h1 className="font-display text-xl font-bold text-fg">{t('auth_registerTitle')}</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t('auth_name')}</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t('auth_email')}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t('auth_password')}</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? t('auth_submitting') : t('auth_register')}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t('auth_or')}
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className="w-full rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth_googleBtn')}
      </button>

      <p className="mt-6 text-center text-sm text-muted">
        {t('auth_haveAccount')}{' '}
        <Link href="/login" className="text-primary hover:underline">
          {t('auth_login')}
        </Link>
      </p>
    </div>
  )
}
