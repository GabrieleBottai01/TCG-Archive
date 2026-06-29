'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CardSearch, type CardSearchResult } from '@/components/CardSearch'
import { SetSearch, type SetSearchResult } from '@/components/SetSearch'
import { useT, CONDITION_LABELS } from '@/lib/i18n'
import { GAME_LABELS, ITEM_TYPE_LABELS } from '@/lib/labels'
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

function seedForm(item?: PlainItem): FormState {
  if (item) {
    return {
      game: item.game,
      itemType: item.itemType,
      name: item.name,
      setName: item.setName ?? '',
      cardNumber: item.cardNumber ?? '',
      language: item.language ?? '',
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
    game: 'POKEMON',
    itemType: 'RAW',
    name: '',
    setName: '',
    cardNumber: '',
    language: '',
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
  const [form, setForm] = useState<FormState>(() => seedForm(item))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const set = (field: keyof FormState, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handlePick = (r: CardSearchResult) => {
    setForm((prev) => {
      const raw = prev.itemType === 'RAW'
      return {
        ...prev,
        name: r.name,
        setName: r.setName,
        cardNumber: r.cardNumber,
        imageUrl: r.imageUrl ?? '',
        externalId: r.externalId,
        // Auto market price only for raw cards; a graded slab keeps its manual value.
        ...(raw ? { marketValue: r.lowPrice ?? 0, marketValueSource: 'AUTO' } : {}),
      }
    })
  }

  const handlePickSet = (r: SetSearchResult) => {
    setForm((prev) => ({
      ...prev,
      name: r.name,
      setName: r.name,
      imageUrl: r.imageUrl ?? '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // Determine context for payload normalization (Bug 2)
    const isPokemonRawSubmit = form.game === 'POKEMON' && form.itemType === 'RAW'

    // Build payload with explicit nulls for cleared optional fields (Bug 1)
    // and type-specific field normalization (Bug 2)
    const payload: Record<string, unknown> = {
      game: form.game,
      itemType: form.itemType,
      name: form.name,
      quantity: Number(form.quantity),
      purchasePrice: Number(form.purchasePrice),
      marketValue: Number(form.marketValue),
      // Bug 2: force MANUAL when not a Pokémon RAW item
      marketValueSource: isPokemonRawSubmit ? form.marketValueSource : 'MANUAL',
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
      // Bug 2: Pokémon-raw-specific fields — null for all other game/type combos
      externalId: isPokemonRawSubmit ? (form.externalId.trim() || null) : null,
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

  const isGraded = form.itemType === 'GRADED'
  const isRaw = form.itemType === 'RAW'
  // Card search for Pokémon singles (raw or graded); set search for sealed products.
  const isPokemonCardSearch = form.game === 'POKEMON' && (isRaw || isGraded)
  const isPokemonSealed = form.game === 'POKEMON' && form.itemType === 'SEALED'

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
          {/* Gioco */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-game">
              {t('m_game')}
            </label>
            <select
              id="modal-game"
              value={form.game}
              onChange={(e) => set('game', e.target.value)}
              className={fieldClass}
            >
              {Object.keys(GAME_LABELS).map((k) => (
                <option key={k} value={k}>{t('game_' + k)}</option>
              ))}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-type">
              {t('m_type')}
            </label>
            <select
              id="modal-type"
              value={form.itemType}
              onChange={(e) => set('itemType', e.target.value)}
              className={fieldClass}
            >
              {Object.keys(ITEM_TYPE_LABELS).map((k) => (
                <option key={k} value={k}>{t('type_' + k)}</option>
              ))}
            </select>
          </div>

          {/* Pokémon card search — raw + graded singles share card art */}
          {isPokemonCardSearch && (
            <div>
              <p className="text-sm font-medium text-fg mb-1">{t('m_searchCard')}</p>
              <CardSearch onPick={handlePick} />
            </div>
          )}

          {/* Pokémon set search — sealed products get the official set logo */}
          {isPokemonSealed && (
            <div>
              <p className="text-sm font-medium text-fg mb-1">{t('m_searchSet')}</p>
              <SetSearch onPick={handlePickSet} />
            </div>
          )}

          {/* Nome + live image preview */}
          <div className="flex gap-3 items-start">
            <ItemImage
              item={{
                imageUrl: form.imageUrl.trim() || null,
                itemType: form.itemType,
                game: form.game,
                name: form.name,
              }}
              className="aspect-[5/7] w-24 rounded-lg border border-border shrink-0"
            />
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-name">
                {t('m_name')}
              </label>
              <input
                id="modal-name"
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                className={fieldClass}
              />
            </div>
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

          {/* Lingua */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-language">
              {t('m_language')}
            </label>
            <input
              id="modal-language"
              type="text"
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
              placeholder={t('m_languagePlaceholder')}
              className={fieldClass}
            />
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
                  placeholder="es. 9, 10, 9.5"
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          {/* Quantità */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-quantity">
              {t('m_quantity')}
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

          {/* Prezzo di acquisto */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-purchase-price">
              {t('m_purchasePrice')}
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

          {/* Valore di mercato */}
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
            {form.marketValueSource === 'AUTO' && (
              <p className="mt-1 text-xs text-success">{t('m_autoUpdated')}</p>
            )}
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
