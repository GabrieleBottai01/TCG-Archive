'use client'

import { useT } from '@/lib/i18n'
import { formatEUR } from '@/lib/format'
import { priceSourceOf, PRICE_SOURCE_KEY, type PriceSourceInput } from '@/lib/priceSource'

// €810 and €810 are not the same claim, so the border says which:
//   solid   = a real European market price (Cardtrader, or Cardmarket via TCGdex)
//   dashed  = an eBay EU estimate (median of asking listings)
//   dotted  = a number the collector typed
// (The eBay observatory shows only as a muted secondary line, never as the value.)
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
      {item.euReference?.displayValue != null && item.euReference.strength !== 'NONE' && (
        <span className="text-[0.65rem] leading-tight text-muted">
          {t('src_euReference')} ~{formatEUR(item.euReference.displayValue)}
        </span>
      )}
    </span>
  )
}
