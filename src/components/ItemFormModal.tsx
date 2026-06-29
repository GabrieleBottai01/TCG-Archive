'use client'

import { useState, useEffect, useRef } from 'react'
import { CardSearch, type CardSearchResult } from '@/components/CardSearch'
import { GAME_LABELS, ITEM_TYPE_LABELS, CONDITION_LABELS } from '@/lib/labels'
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
    setForm((prev) => ({
      ...prev,
      name: r.name,
      setName: r.setName,
      cardNumber: r.cardNumber,
      imageUrl: r.imageUrl ?? '',
      externalId: r.externalId,
      marketValue: r.lowPrice ?? 0,
      marketValueSource: 'AUTO',
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
      // Bug 1 + Bug 2: imageUrl must be a real URL or null (never ''); only for Pokémon RAW
      imageUrl: isPokemonRawSubmit ? (form.imageUrl.trim() || null) : null,
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
        const msg = typeof errData.error === 'string' ? errData.error : 'Dati non validi. Controlla i campi.'
        setError(msg)
        return
      }
      const data = (await res.json()) as ApiItemResponse
      onSaved(data.item)
    } catch {
      setError('Errore di rete. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  const isPokemonRaw = form.game === 'POKEMON' && form.itemType === 'RAW'
  const isGraded = form.itemType === 'GRADED'
  const isRaw = form.itemType === 'RAW'

  return (
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
          {item ? 'Modifica articolo' : 'Nuovo articolo'}
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
              Gioco
            </label>
            <select
              id="modal-game"
              value={form.game}
              onChange={(e) => set('game', e.target.value)}
              className={fieldClass}
            >
              {Object.entries(GAME_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-type">
              Tipo
            </label>
            <select
              id="modal-type"
              value={form.itemType}
              onChange={(e) => set('itemType', e.target.value)}
              className={fieldClass}
            >
              {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Pokémon card search (only for POKEMON + RAW) */}
          {isPokemonRaw && (
            <div>
              <p className="text-sm font-medium text-fg mb-1">Cerca carta</p>
              <CardSearch onPick={handlePick} />
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-name">
              Nome
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

          {/* Set / numero carta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-setname">
                Set
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
                Numero carta
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
              Lingua
            </label>
            <input
              id="modal-language"
              type="text"
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
              placeholder="es. IT, EN, JP"
              className={fieldClass}
            />
          </div>

          {/* Condizione (only for RAW) */}
          {isRaw && (
            <div>
              <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-condition">
                Condizione
              </label>
              <select
                id="modal-condition"
                value={form.condition}
                onChange={(e) => set('condition', e.target.value)}
                className={fieldClass}
              >
                <option value="">— seleziona —</option>
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
                  Grading company
                </label>
                <select
                  id="modal-grading-company"
                  value={form.gradingCompany}
                  onChange={(e) => set('gradingCompany', e.target.value)}
                  className={fieldClass}
                >
                  <option value="">— seleziona —</option>
                  <option value="PSA">PSA</option>
                  <option value="BGS">BGS</option>
                  <option value="CGC">CGC</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-grade">
                  Grado
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
              Quantità
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
              Prezzo di acquisto
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
              Valore di mercato
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
              <p className="mt-1 text-xs text-success">Valore aggiornato automaticamente da Pokémon TCG</p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="modal-notes">
              Note
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
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring glow-violet"
            >
              {submitting ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
