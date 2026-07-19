'use client'

import { useT } from '@/lib/i18n'
import { formatEUR } from '@/lib/format'
import { priceSourceOf, PRICE_SOURCE_KEY, type PriceSourceInput } from '@/lib/priceSource'

// €810 and €810 are not the same claim, so the border says which:
//   solid   = a real European market price (Cardmarket via TCGdex, or a STRONG
//             observatory reference)
//   dashed  = a US price we converted (estimate), or a WEAK observatory reference
//   dotted  = a number the collector typed
// This is the only thing telling the reader how much to trust the figure
// beside it, which is why it is structure and not decoration.

const STYLE: Record<string, string> = {
  euReferenceStrong: 'border-solid border-success text-success',
  euReferenceWeak: 'border-dashed border-warning text-warning',
  cardmarket: 'border-solid border-success text-success',
  cardtrader: 'border-solid border-success text-success',
  estimate: 'border-dashed border-warning text-warning',
  manual: 'border-dotted border-muted text-muted',
  none: 'border-dotted border-muted text-muted',
}

export function PriceSourceChip({ item, className = '' }: { item: PriceSourceInput; className?: string }) {
  const t = useT()
  const source = priceSourceOf(item)

  // The EU reference chip states its own footing: STRONG shows the plain number
  // and its evidence; WEAK is tilde'd and tagged "weak data" so it is never read
  // as settled — the value beside it is still the US estimate until STRONG.
  if (source.kind === 'euReference' && item.euReference) {
    const strong = source.strength === 'STRONG'
    const { displayValue, sampleSize, sales } = item.euReference
    const obs = `${sampleSize} ${sampleSize === 1 ? t('src_euObs1') : t('src_euObs')}`
    const value = displayValue !== null ? `${strong ? '' : '~'}${formatEUR(displayValue)}` : ''
    const detail = strong
      ? `${obs} · ${sales} ${t('src_euSales')}`
      : `${obs}, ${t('src_euNoSales')} — ${t('src_euWeak')}`

    return (
      <span className={`inline-flex flex-col gap-0.5 ${className}`}>
        <span
          className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem] leading-tight ${
            STYLE[strong ? 'euReferenceStrong' : 'euReferenceWeak']
          }`}
        >
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current" />
          {t('src_euReference')} {value}
        </span>
        <span className={`text-[0.65rem] leading-tight ${strong ? 'text-muted' : 'text-warning'}`}>{detail}</span>
      </span>
    )
  }

  const { kind, langMismatch } = source
  return (
    <span className={`inline-flex flex-col gap-0.5 ${className}`}>
      <span
        className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem] leading-tight ${STYLE[kind]}`}
      >
        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current" />
        {t(PRICE_SOURCE_KEY[kind])}
      </span>
      {langMismatch && (
        <span className="text-[0.65rem] leading-tight text-warning">{t('src_langWarn')}</span>
      )}
    </span>
  )
}
