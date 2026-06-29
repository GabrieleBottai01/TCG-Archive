'use client'

import { useSyncExternalStore } from 'react'

export type Lang = 'it' | 'en'

type Dict = Record<string, string>

const it: Dict = {
  nav_dashboard: 'Dashboard',
  nav_collection: 'Collezione',

  // Dashboard
  dash_title: 'Dashboard',
  dash_collectionValue: 'Valore della collezione',
  dash_cost: 'Costo',
  dash_costTotal: 'Costo totale',
  dash_pl: 'P/L',
  dash_items: 'N. articoli',
  dash_pieces: 'Pezzi',
  dash_perGame: 'Per gioco',
  dash_updateTitle: 'Aggiorna valori di mercato',
  dash_updateDesc: 'Aggiorna i valori di mercato delle carte Pokémon (fonte automatica).',
  dash_updateBtn: 'Aggiorna valori',
  dash_updating: 'Aggiornamento…',
  dash_refreshErr: 'Aggiornamento non riuscito. Riprova più tardi.',
  dash_networkErr: 'Impossibile contattare il server. Controlla la connessione.',
  dash_emptyDesc: 'La tua collezione è vuota. Inizia ad aggiungere articoli!',
  dash_goToCollection: 'Vai alla Collezione',
  unit_article: 'articolo',
  unit_articles: 'articoli',
  unit_piece: 'pezzo',
  unit_pieces: 'pezzi',

  // Collection
  coll_title: 'Collezione',
  coll_add: 'Aggiungi',
  coll_edit: 'Modifica',
  coll_delete: 'Elimina',
  coll_confirmDelete: 'Eliminare questo articolo?',
  coll_empty: 'Nessun articolo in collezione. Aggiungine uno!',
  coll_viewGallery: 'Galleria',
  coll_viewTable: 'Tabella',
  filter_allGames: 'Tutti i giochi',
  filter_allTypes: 'Tutti i tipi',
  filter_allConditions: 'Tutte le condizioni',
  filter_search: 'Cerca per nome o set…',
  filter_byGame: 'Filtra per gioco',
  filter_byType: 'Filtra per tipo',
  filter_byCondition: 'Filtra per condizione',
  filter_searchAria: 'Cerca',
  th_article: 'Articolo',
  th_game: 'Gioco',
  th_type: 'Tipo',
  th_cond: 'Cond.',
  th_qty: 'Qtà',
  th_purchase: 'Acquisto',
  th_value: 'Valore',
  th_difference: 'Differenza',
  th_actions: 'Azioni',
  tot_value: 'Valore',
  tot_cost: 'Costo',
  tot_pieces: 'Pezzi',
  tot_items: 'N. articoli',

  // Modal
  m_new: 'Nuovo articolo',
  m_edit: 'Modifica articolo',
  m_game: 'Gioco',
  m_type: 'Tipo',
  m_searchCard: 'Cerca carta',
  m_searchPlaceholder: 'Cerca carta Pokémon...',
  m_searchSet: 'Cerca set',
  m_searchSetPlaceholder: 'Cerca set sigillato Pokémon...',
  m_noResults: 'Nessun risultato trovato.',
  m_name: 'Nome',
  m_set: 'Set',
  m_cardNumber: 'Numero carta',
  m_language: 'Lingua',
  m_languagePlaceholder: 'es. IT, EN, JP',
  m_condition: 'Condizione',
  m_select: '— seleziona —',
  m_gradingCompany: 'Compagnia di grading',
  m_grade: 'Voto',
  m_quantity: 'Quantità',
  m_purchasePrice: 'Prezzo di acquisto',
  m_marketValue: 'Valore di mercato',
  m_imageUrl: 'URL immagine',
  m_imageUrlPlaceholder: 'https://…  link a un’immagine',
  m_imageUrlHint: 'Incolla il link a un’immagine del prodotto (es. da Cardmarket).',
  m_autoUpdated: 'Valore aggiornato automaticamente da Pokémon TCG',
  m_notes: 'Note',
  m_save: 'Salva',
  m_cancel: 'Annulla',
  m_validationErr: 'Dati non validi. Controlla i campi.',
  m_networkErr: 'Errore di rete. Riprova.',

  // Footer
  footer_tagline: 'Il caveau della tua collezione.',

  // Game labels
  game_POKEMON: 'Pokémon',
  game_MAGIC: 'Magic',
  game_YUGIOH: 'Yu-Gi-Oh!',
  game_ONEPIECE: 'One Piece',
  game_OTHER: 'Altro',
  // Type labels
  type_RAW: 'Carta',
  type_GRADED: 'Gradata',
  type_SEALED: 'Sealed',
}

const en: Dict = {
  nav_dashboard: 'Dashboard',
  nav_collection: 'Collection',

  dash_title: 'Dashboard',
  dash_collectionValue: 'Collection value',
  dash_cost: 'Cost',
  dash_costTotal: 'Total cost',
  dash_pl: 'P/L',
  dash_items: 'Items',
  dash_pieces: 'Pieces',
  dash_perGame: 'By game',
  dash_updateTitle: 'Update market values',
  dash_updateDesc: 'Update the market values of Pokémon cards (automatic source).',
  dash_updateBtn: 'Update values',
  dash_updating: 'Updating…',
  dash_refreshErr: 'Update failed. Please try again later.',
  dash_networkErr: 'Couldn’t reach the server. Check your connection.',
  dash_emptyDesc: 'Your collection is empty. Start adding items!',
  dash_goToCollection: 'Go to Collection',
  unit_article: 'item',
  unit_articles: 'items',
  unit_piece: 'piece',
  unit_pieces: 'pieces',

  coll_title: 'Collection',
  coll_add: 'Add',
  coll_edit: 'Edit',
  coll_delete: 'Delete',
  coll_confirmDelete: 'Delete this item?',
  coll_empty: 'No items in your collection. Add one!',
  coll_viewGallery: 'Gallery',
  coll_viewTable: 'Table',
  filter_allGames: 'All games',
  filter_allTypes: 'All types',
  filter_allConditions: 'All conditions',
  filter_search: 'Search by name or set…',
  filter_byGame: 'Filter by game',
  filter_byType: 'Filter by type',
  filter_byCondition: 'Filter by condition',
  filter_searchAria: 'Search',
  th_article: 'Item',
  th_game: 'Game',
  th_type: 'Type',
  th_cond: 'Cond.',
  th_qty: 'Qty',
  th_purchase: 'Purchase',
  th_value: 'Value',
  th_difference: 'Difference',
  th_actions: 'Actions',
  tot_value: 'Value',
  tot_cost: 'Cost',
  tot_pieces: 'Pieces',
  tot_items: 'Items',

  m_new: 'New item',
  m_edit: 'Edit item',
  m_game: 'Game',
  m_type: 'Type',
  m_searchCard: 'Search card',
  m_searchPlaceholder: 'Search Pokémon card...',
  m_searchSet: 'Search set',
  m_searchSetPlaceholder: 'Search sealed Pokémon set...',
  m_noResults: 'No results found.',
  m_name: 'Name',
  m_set: 'Set',
  m_cardNumber: 'Card number',
  m_language: 'Language',
  m_languagePlaceholder: 'e.g. IT, EN, JP',
  m_condition: 'Condition',
  m_select: '— select —',
  m_gradingCompany: 'Grading company',
  m_grade: 'Grade',
  m_quantity: 'Quantity',
  m_purchasePrice: 'Purchase price',
  m_marketValue: 'Market value',
  m_imageUrl: 'Image URL',
  m_imageUrlPlaceholder: 'https://…  link to an image',
  m_imageUrlHint: 'Paste a link to a product image (e.g. from Cardmarket).',
  m_autoUpdated: 'Value updated automatically from Pokémon TCG',
  m_notes: 'Notes',
  m_save: 'Save',
  m_cancel: 'Cancel',
  m_validationErr: 'Invalid data. Check the fields.',
  m_networkErr: 'Network error. Try again.',

  footer_tagline: 'The vault for your collection.',

  game_POKEMON: 'Pokémon',
  game_MAGIC: 'Magic',
  game_YUGIOH: 'Yu-Gi-Oh!',
  game_ONEPIECE: 'One Piece',
  game_OTHER: 'Other',
  type_RAW: 'Card',
  type_GRADED: 'Graded',
  type_SEALED: 'Sealed',
}

const dict: Record<Lang, Dict> = { it, en }

// Grading conditions are industry-standard terms — same in both languages.
export const CONDITION_LABELS: Record<string, string> = {
  POOR: 'Poor',
  PLAYED: 'Played',
  LIGHT_PLAYED: 'Light Played',
  GOOD: 'Good',
  EXCELLENT: 'Excellent',
  NEAR_MINT: 'Near Mint',
  MINT: 'Mint',
}

// ---- External store (mirrors the theme toggle): no setState-in-effect, no hydration mismatch ----
const listeners = new Set<() => void>()

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'it'
  } catch {
    return 'it'
  }
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem('lang', next)
  } catch {
    // localStorage unavailable — language still applies for the session.
  }
  document.documentElement.lang = next
  listeners.forEach((fn) => fn())
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, readLang, () => 'it')
}

export function useT() {
  const lang = useLang()
  return (key: string) => dict[lang][key] ?? key
}
