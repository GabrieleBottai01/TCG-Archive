'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CardSearch, type CardSearchResult } from '@/components/CardSearch'
import { SealedSearch, type SealedSearchResult } from '@/components/SealedSearch'
import { useT, useLang, CONDITION_LABELS } from '@/lib/i18n'
import { priceSourceOf } from '@/lib/priceSource'
import { ItemImage } from '@/components/ItemImage'
import type { PlainItem } from '@/components/CollectionView'

interface ItemFormModalProps {
  item?: PlainItem
  onClose: () => void
  onSaved: (item: PlainItem) => void
}

type FormState = {
  game: string
  itemType: string
  name: string
  setName: string
  cardNumber: string
  language: string
  externalId: string
  imageUrl: string
  condition: string
  gradingCompany: string
  grade: string
  quantity: number
  purchasePrice: number
  marketValue: number
  marketValueSource: string
  notes: string
}

// The collection is Pokémon-only: the game selector is gone, but `game` stays in
// the form state and in the payload (the API contract is unchanged).
const GAME = 'POKEMON'

const LANG_CODES = ['IT', 'EN', 'JA'] as const

// Language used to be a free-text field, so stored values may read "Italiano",
// "ENG", … Map the well-known spellings onto the new codes; anything else is
// preserved verbatim and offered as an extra <option> so editing an old item
// never silently drops its language.
function normalizeLang(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  const upper = v.toUpperCase()
  if ((LANG_CODES as readonly string[]).includes(upper)) return upper
  if (/^(ita|italiano|italian)$/i.test(v)) return 'IT'
  if (/^(eng|english|inglese)$/i.test(v)) return 'EN'
  if (/^(jp|jap|jpn|japanese|giapponese)$/i.test(v)) return 'JA'
  return v
}

function seedForm(item?: PlainItem): FormState {
  if (item) {
    return {
      game: item.game,
      itemType: item.itemType,
      name: item.name,
      setName: item.setName ?? '',
      cardNumber: item.cardNumber ?? '',
      language: normalizeLang(item.language),
      externalId: item.externalId ?? '',
      imageUrl: item.imageUrl ?? '',
      condition: item.condition ?? '',
      gradingCompany: item.gradingCompany ?? '',
      grade: item.grade ?? '',
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      marketValue: item.marketValue,
      marketValueSource: item.marketValueSource ?? 'MANUAL',
      notes: item.notes ?? '',
    }
  }
  return {
    game: GAME,
    itemType: 'SEALED',
    name: '',
    setName: '',
    cardNumber: '',
    language: 'IT',
    externalId: '',
    imageUrl: '',
    condition: '',
    gradingCompany: '',
    grade: '',
    quantity: 1,
    purchasePrice: 0,
    marketValue: 0,
    marketValueSource: 'MANUAL',
    notes: '',
  }
}

type ApiItemResponse = { item: PlainItem }

const fieldClass = 'w-full rounded border border-border bg-card px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ItemFormModal({ item, onClose, onSaved }: ItemFormModalProps) {
  const t = useT()
  const lang = useLang()
  const [form, setForm] = useState<FormState>(() => seedForm(item))
  // The search is replaced by a summary card once a product/card is picked.
  // Editing an existing item starts in the "picked" state.
  const [picked, setPicked] = useState(() => !!item)
  // The auto price we last obtained, kept so `f_backToAuto` can restore it after
  // a manual edit. Seeded from an item that is already AUTO-priced.
  const [autoPrice, setAutoPrice] = useState<number | null>(() =>
    item && item.marketValueSource === 'AUTO' ? item.marketValue : null
  )
  // ISO date the auto price refers to: the item's stored timestamp when editing,
  // "now" for a price just fetched on pick.
  const [priceDate, setPriceDate] = useState<string | null>(() => item?.marketValueUpdatedAt ?? null)
  const [priceLoading, setPriceLoading] = useState(false)
  // How many eBay listings backed the current sealed estimate (null = not an eBay
  // estimate, e.g. the tcgcsv fallback or a card). Drives the "· N annunci" tag.
  const [ebaySample, setEbaySample] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // `name` lives inside the collapsed <details>; a failed validation has to open
  // it, otherwise the error banner points at a field the user cannot see.
  const detailsRef = useRef<HTMLDetailsElement>(null)

  // Guards the price fetch against a stale response overwriting a newer pick.
  // Every pick/clear bumps the id and aborts the previous request; a response
  // may only touch the form (and the spinner) while its id is still current.
  const priceReqIdRef = useRef(0)
  const priceAbortRef = useRef<AbortController | null>(null)

  // Invalidates any in-flight price fetch and returns the id of the new request
  // slot. Callers that are not starting a fetch can ignore the return value.
  const invalidatePriceFetch = () => {
    priceReqIdRef.current += 1
    priceAbortRef.current?.abort()
    priceAbortRef.current = null
    return priceReqIdRef.current
  }

  // Accessibility: close on Escape, move focus into the dialog on open,
  // and lock background scroll while the modal is mounted.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Drop any in-flight price fetch when the modal unmounts.
  useEffect(() => {
    return () => {
      priceReqIdRef.current += 1
      priceAbortRef.current?.abort()
      priceAbortRef.current = null
    }
  }, [])

  const set = (field: keyof FormState, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const isGraded = form.itemType === 'GRADED'
  const isRaw = form.itemType === 'RAW'
  const isCard = isRaw || isGraded
  const isSealed = form.itemType === 'SEALED'

  // Switching type invalidates any pick: the external id, the image and the
  // auto price all belong to the previous type's catalogue.
  const clearPick = (nextType?: string) => {
    // A price fetch still in flight belongs to the pick being dropped: invalidate
    // it so its response cannot land on whatever is picked next.
    invalidatePriceFetch()
    setPriceLoading(false)
    setForm((prev) => ({
      ...prev,
      itemType: nextType ?? prev.itemType,
      name: '',
      setName: '',
      cardNumber: '',
      externalId: '',
      imageUrl: '',
      // The value belongs to the pick being dropped: carrying it over would
      // silently price the next item at the previous one's figure.
      marketValue: 0,
      marketValueSource: 'MANUAL',
    }))
    setPicked(false)
    setAutoPrice(null)
    setPriceDate(null)
  }

  const selectType = (next: 'SEALED' | 'RAW') => {
    // "Carta" covers RAW and GRADED — don't reset a graded item back to raw.
    if (next === 'SEALED' ? isSealed : isCard) return
    clearPick(next)
  }

  const toggleGraded = (checked: boolean) => {
    // A slab's value diverges from the raw card price, so a graded item never
    // keeps an auto price.
    setForm((prev) => ({
      ...prev,
      itemType: checked ? 'GRADED' : 'RAW',
      marketValueSource: 'MANUAL',
      // Clearing the source but keeping the figure would leave the raw card's
      // auto price sitting in a MANUAL field — saved, invisible inside the
      // collapsed <details>, and labelled `f_priceManual` ("entered manually")
      // for a number the user never typed. Same reset as clearPick/handlePick.
      ...(checked ? { marketValue: 0 } : {}),
    }))
    if (checked) {
      // Drop the auto price entirely, not just the source: leaving it set would
      // offer `f_backToAuto` on a slab that must stay MANUAL. A price fetch for
      // the raw card may still be in flight — it must not land either.
      invalidatePriceFetch()
      setPriceLoading(false)
      setAutoPrice(null)
      setPriceDate(null)
    }
  }

  const handlePick = async (r: CardSearchResult) => {
    const graded = isGraded
    // Supersede any pick still fetching: from here on only this request's
    // response may touch the form.
    const reqId = invalidatePriceFetch()
    setForm((prev) => ({
      ...prev,
      name: r.name,
      setName: r.setName,
      cardNumber: r.cardNumber,
      imageUrl: r.imageUrl ?? '',
      externalId: r.externalId,
      // The previous pick's price must not survive into this one; the fetch
      // below fills it in if Cardmarket has a figure.
      marketValue: 0,
      // Stays MANUAL until (and unless) /api/cards/price returns a price.
      marketValueSource: 'MANUAL',
    }))
    setPicked(true)
    setAutoPrice(null)
    setPriceDate(null)
    // A graded slab keeps the value MANUAL: its real value diverges from the
    // raw card price, so don't fetch one.
    if (graded) {
      setPriceLoading(false)
      return
    }

    // TCGdex's card list endpoint carries no prices — the Cardmarket price is
    // fetched for the picked card only.
    const controller = new AbortController()
    priceAbortRef.current = controller
    setPriceLoading(true)
    try {
      const res = await fetch(`/api/cards/price?id=${encodeURIComponent(r.externalId)}`, {
        signal: controller.signal,
      })
      if (!res.ok) return
      const data = (await res.json()) as { priceEur: number | null }
      const price = data.priceEur
      if (price == null) return
      // A newer pick (or a clear) landed while this was in flight: its form
      // state wins, so drop this response rather than overwrite the price.
      if (priceReqIdRef.current !== reqId) return
      setForm((prev) => ({ ...prev, marketValue: price, marketValueSource: 'AUTO' }))
      setAutoPrice(price)
      setPriceDate(new Date().toISOString())
    } catch {
      // Aborted, or the network failed. Either way leave the value MANUAL —
      // the user can type one.
    } finally {
      // Only the live request owns the spinner: a superseded one clearing it
      // would hide a fetch that is still running.
      if (priceReqIdRef.current === reqId) {
        setPriceLoading(false)
        priceAbortRef.current = null
      }
    }
  }

  const handlePickSealed = async (r: SealedSearchResult, query: string) => {
    const reqId = invalidatePriceFetch()
    // Keep the Italian "type + set" the user typed as the name, NOT the English
    // catalogue name: eBay IT recall (for the estimate now, and the refresh /
    // observatory later) depends on the Italian term.
    const searchName = query || r.name
    const lang = form.language || 'IT'
    setForm((prev) => ({
      ...prev,
      name: searchName,
      imageUrl: r.imageUrl ?? '',
      externalId: r.externalId,
      // Start MANUAL at 0; the eBay estimate below promotes it to AUTO.
      marketValue: 0,
      marketValueSource: 'MANUAL',
    }))
    setPicked(true)
    setAutoPrice(null)
    setPriceDate(null)
    setEbaySample(null)

    // The real value is the live median of current eBay IT+DE listings — the
    // European market, not the tcgcsv US figure. tcgcsv is only the fallback.
    const controller = new AbortController()
    priceAbortRef.current = controller
    setPriceLoading(true)
    try {
      const res = await fetch(
        `/api/sealed/estimate?name=${encodeURIComponent(searchName)}&lang=${encodeURIComponent(lang)}`,
        { signal: controller.signal },
      )
      let eur: number | null = null
      let sample = 0
      if (res.ok) {
        const data = (await res.json()) as { eur: number | null; sampleSize: number }
        eur = data.eur
        sample = data.sampleSize
      }
      if (eur == null) eur = r.priceEur // eBay found nothing → tcgcsv fallback
      // A newer pick (or a clear) landed while this was in flight: it wins.
      if (priceReqIdRef.current !== reqId) return
      if (eur != null) {
        const price = eur
        setForm((prev) => ({ ...prev, marketValue: price, marketValueSource: 'AUTO' }))
        setAutoPrice(price)
        setPriceDate(new Date().toISOString())
        setEbaySample(sample > 0 ? sample : null)
      }
    } catch {
      // Aborted or network error: leave the value MANUAL at 0, the user can type.
    } finally {
      if (priceReqIdRef.current === reqId) {
        setPriceLoading(false)
        priceAbortRef.current = null
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // The name lives inside the collapsed <details>, so it cannot carry
    // `required`: a browser cannot focus a hidden invalid control and would
    // refuse to submit with no visible reason. Validate it here instead.
    if (!form.name.trim()) {
      setError(t('m_validationErr'))
      // The banner renders at the top of a scrollable panel while `name` sits
      // inside the collapsed section: open it and focus the field, or Salva
      // just appears to do nothing.
      if (detailsRef.current) detailsRef.current.open = true
      panelRef.current?.querySelector<HTMLInputElement>('#modal-name')?.focus()
      return
    }

    setSubmitting(true)

    // Auto-priced items: Pokémon raw cards (TCGdex/Cardmarket) and sealed
    // products picked from search (tcgcsv). They keep their externalId + AUTO
    // source so the refresh can re-price them; everything else is MANUAL.
    const autoEligible =
      (form.game === 'POKEMON' && form.itemType === 'RAW') ||
      (form.itemType === 'SEALED' && form.externalId.startsWith('tcgcsv:'))

    // Build payload with explicit nulls for cleared optional fields (Bug 1)
    // and type-specific field normalization (Bug 2)
    const payload: Record<string, unknown> = {
      game: form.game,
      itemType: form.itemType,
      name: form.name,
      quantity: Number(form.quantity),
      purchasePrice: Number(form.purchasePrice),
      marketValue: Number(form.marketValue),
      // MANUAL unless the item is auto-priced (raw card or sealed product)
      marketValueSource: autoEligible ? form.marketValueSource : 'MANUAL',
      // Bug 1: send null when empty so PUT clears the column
      setName: form.setName.trim() || null,
      cardNumber: form.cardNumber.trim() || null,
      language: form.language.trim() || null,
      notes: form.notes.trim() || null,
      // Bug 2: grading fields — null unless itemType === 'GRADED'
      gradingCompany: form.itemType === 'GRADED' ? (form.gradingCompany || null) : null,
      grade: form.itemType === 'GRADED' ? (form.grade.trim() || null) : null,
      // Bug 2: condition — null unless itemType === 'RAW'
      condition: form.itemType === 'RAW' ? (form.condition || null) : null,
      // Keep the externalId only for auto-priced items (raw card / sealed product)
      externalId: autoEligible ? (form.externalId.trim() || null) : null,
      // imageUrl is sent for ALL types — real URL or null (never '')
      imageUrl: form.imageUrl.trim() || null,
    }

    const url = item ? `/api/items/${item.id}` : '/api/items'
    const method = item ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string | object }
        const msg = typeof errData.error === 'string' ? errData.error : t('m_validationErr')
        setError(msg)
        return
      }
      const data = (await res.json()) as ApiItemResponse
      onSaved(data.item)
    } catch {
      setError(t('m_networkErr'))
    } finally {
      setSubmitting(false)
    }
  }

  const legacyLang =
    form.language && !(LANG_CODES as readonly string[]).includes(form.language) ? form.language : null

  const formattedPriceDate = priceDate
    ? new Date(priceDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'it-IT')
    : null

  const isAuto = form.marketValueSource === 'AUTO'

  // Derived by the same helper the collection list uses, so the two can never
  // disagree about where a value came from. A value the user typed reads as
  // "manual"; an empty one after a pick that yielded no price reads as "no
  // automatic price" — saying "entered manually" there would describe
  // something the user never did.
  const source = priceSourceOf({
    itemType: form.itemType,
    externalId: form.externalId || null,
    marketValue: form.marketValue,
    marketValueSource: form.marketValueSource,
    language: form.language || null,
  })
  const showCardmarket = source.kind === 'cardmarket'
  const showEstimate = source.kind === 'estimate'
  const showManual = source.kind === 'manual'
  const showNoPrice = source.kind === 'none'

  const typeButtonClass = (active: boolean) =>
    `flex-1 rounded px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? 'bg-primary text-on-primary' : 'border border-border text-fg hover:bg-surface'
    }`

  const priceLabel = (
    <div className="mt-1 space-y-1">
      {priceLoading && <p className="text-xs text-muted">…</p>}
      {!priceLoading && showCardmarket && (
        <p className="text-xs text-success">
          {t('f_priceCardmarket')}
          {formattedPriceDate ? ` ${formattedPriceDate}` : ''}
        </p>
      )}
      {!priceLoading && showEstimate && (
        <p className="text-xs text-warning">
          {t('f_priceEstimateEbay')}
          {ebaySample != null ? ` · ${ebaySample} ${t('f_estimateListings')}` : ''}
          {formattedPriceDate ? ` ${formattedPriceDate}` : ''}
        </p>
      )}
      {!priceLoading && (showManual || showNoPrice) && (
        <p className="text-xs text-muted">
          {showManual ? t('f_priceManual') : t('f_noPrice')}
          {/* Only offered when there is an auto value to go back to. */}
          {!isAuto && autoPrice != null && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, marketValue: autoPrice, marketValueSource: 'AUTO' }))
                }}
                className="underline hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('f_backToAuto')}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  )

  // Render via portal at document.body so the modal escapes the <main> stacking
  // context (z-10) and is never intercepted by the footer.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-w-lg w-full rounded-xl bg-card p-4 max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <h2 id="modal-title" className="text-lg font-semibold text-fg mb-4">
          {item ? t('m_edit') : t('m_new')}
        </h2>

        {error && (
          <div className="mb-4 rounded bg-danger/10 border border-danger/40 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle — sealed vs card. The game is always Pokémon. */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => selectType('SEALED')} className={typeButtonClass(isSealed)}>
                {t('f_typeSealed')}
              </button>
              <button type="button" onClick={() => selectType('RAW')} className={typeButtonClass(isCard)}>
                {t('f_typeCard')}
              </button>
            </div>
            {isCard && (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={isGraded}
                  onChange={(e) => toggleGraded(e.target.checked)}
                  className="rounded border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {t('f_isGraded')}
              </label>
            )}
          </div>

          {/* Search — hidden once a pick has been made (see the summary card). */}
          {!picked && (
            <div>
              <p className="text-sm font-medium text-fg mb-1">
                {isSealed ? t('f_searchSealed') : t('f_searchCard')}
              </p>
              {isSealed ? <SealedSearch onPick={handlePickSealed} /> : <CardSearch onPick={handlePick} />}
            </div>
          )}

          {/* Summary of the pick: art, name, set, price label, and a way out. */}
          {picked && (
            <div className="flex gap-3 items-start rounded-lg border border-border p-3">
              <ItemImage
                item={{
                  imageUrl: form.imageUrl.trim() || null,
                  itemType: form.itemType,
                  game: form.game,
                  name: form.name,
                }}
                className="aspect-[5/7] w-16 rounded-lg border border-border shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-fg break-words">{form.name}</p>
                {(form.setName || form.cardNumber) && (
                  <p className="text-xs text-muted truncate">
                    {form.setName} {form.cardNumber ? `· #${form.cardNumber}` : ''}
                  </p>
                )}
                {priceLabel}
              </div>
              <button
                type="button"
                onClick={() => clearPick()}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium text-fg hover:bg-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('f_change')}
              </button>
            </div>
          )}

          {/* The three fields that actually need filling in. */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-quantity">
                {t('f_quantity')}
              </label>
              <input
                id="modal-quantity"
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(e) => set('quantity', parseInt(e.target.value, 10) || 1)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-purchase-price">
                {t('f_paidPrice')}
              </label>
              <input
                id="modal-purchase-price"
                type="number"
                min={0}
                step={0.01}
                value={form.purchasePrice}
                onChange={(e) => set('purchasePrice', parseFloat(e.target.value) || 0)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-language">
                {t('f_language')}
              </label>
              <select
                id="modal-language"
                value={form.language}
                onChange={(e) => set('language', e.target.value)}
                className={fieldClass}
              >
                <option value="">{t('m_select')}</option>
                <option value="IT">{t('f_langIT')}</option>
                <option value="EN">{t('f_langEN')}</option>
                <option value="JA">{t('f_langJA')}</option>
                {/* An unrecognised legacy value stays selectable rather than being dropped. */}
                {legacyLang && <option value={legacyLang}>{legacyLang}</option>}
              </select>
            </div>
          </div>

          {/* Everything the search normally fills in, or that rarely needs touching. */}
          <details ref={detailsRef} className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg">
              {t('f_moreDetails')}
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-name">
                  {t('m_name')}
                </label>
                <input
                  id="modal-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={fieldClass}
                />
              </div>

              {/* Set / numero carta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-setname">
                    {t('m_set')}
                  </label>
                  <input
                    id="modal-setname"
                    type="text"
                    value={form.setName}
                    onChange={(e) => set('setName', e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-cardnumber">
                    {t('m_cardNumber')}
                  </label>
                  <input
                    id="modal-cardnumber"
                    type="text"
                    value={form.cardNumber}
                    onChange={(e) => set('cardNumber', e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Condizione (only for RAW) */}
              {isRaw && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-condition">
                    {t('m_condition')}
                  </label>
                  <select
                    id="modal-condition"
                    value={form.condition}
                    onChange={(e) => set('condition', e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{t('m_select')}</option>
                    {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Grading fields (only for GRADED) */}
              {isGraded && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-grading-company">
                      {t('m_gradingCompany')}
                    </label>
                    <select
                      id="modal-grading-company"
                      value={form.gradingCompany}
                      onChange={(e) => set('gradingCompany', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">{t('m_select')}</option>
                      <option value="PSA">PSA</option>
                      <option value="BGS">BGS</option>
                      <option value="CGC">CGC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-grade">
                      {t('m_grade')}
                    </label>
                    <input
                      id="modal-grade"
                      type="text"
                      value={form.grade}
                      onChange={(e) => set('grade', e.target.value)}
                      placeholder="9, 10, 9.5"
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}

              {/* Valore di mercato — editing it by hand switches the source to MANUAL. */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-market-value">
                  {t('m_marketValue')}
                </label>
                <input
                  id="modal-market-value"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.marketValue}
                  onChange={(e) => {
                    set('marketValue', parseFloat(e.target.value) || 0)
                    set('marketValueSource', 'MANUAL')
                  }}
                  className={fieldClass}
                />
              </div>

              {/* URL immagine (all item types) */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-image-url">
                  {t('m_imageUrl')}
                </label>
                <input
                  id="modal-image-url"
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => set('imageUrl', e.target.value)}
                  placeholder={t('m_imageUrlPlaceholder')}
                  className={fieldClass}
                />
                <p className="mt-1 text-xs text-muted">{t('m_imageUrlHint')}</p>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-notes">
                  {t('m_notes')}
                </label>
                <textarea
                  id="modal-notes"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                  className={`${fieldClass} resize-none`}
                />
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('m_cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring glow-violet"
            >
              {submitting ? `${t('m_save')}…` : t('m_save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
