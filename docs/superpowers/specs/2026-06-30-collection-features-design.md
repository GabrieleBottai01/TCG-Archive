# Collection Features — Design Spec

**Data:** 2026-06-30
**Stato:** Approvato (design), in attesa di revisione spec scritto

## Obiettivo

Aggiungere quattro funzioni alla gestione della collezione di TCG Archive: **ordinamenti**,
**filtri avanzati**, **export CSV** e **statistiche extra** in dashboard. Tutte operano sui
dati già caricati nel client (nessuna modifica a schema/DB), coerenti con l'architettura
attuale (funzioni pure in `src/lib/value.ts` + componenti client).

## Approccio

**Tutto client-side.** La pagina `/collezione` è `force-dynamic` e carica l'intera
collezione dell'utente; ordinare, filtrare ed esportare lato client è adeguato per una
collezione personale (decine–centinaia di articoli). La logica risiede in funzioni pure
testabili in `src/lib/value.ts` (e un nuovo `src/lib/csv.ts` per il CSV); l'UI vive nei
componenti esistenti (`CollectionView`, `FilterBar`, `Dashboard`).

Alternativa scartata: ordinamento/filtri server-side via query Prisma (sovradimensionato,
aggiunge round-trip e stato in URL senza benefici a questa scala).

## 1. Ordinamenti

- Funzione pura `sortItems(items, sort)` in `value.ts`:
  - `type SortKey = 'createdAt' | 'marketValue' | 'difference' | 'name' | 'game' | 'quantity'`
  - `type SortDir = 'asc' | 'desc'`
  - `type Sort = { key: SortKey; dir: SortDir }`
  - `difference` usa `itemDifference(item)`; `name`/`game` ordinano case-insensitive (`localeCompare`); ordinamento stabile.
- UI: un `<select>` "Ordina per" + un pulsante che inverte la direzione (icona ↑/↓), accanto al toggle Galleria/Tabella in `CollectionView`.
- Default: `{ key: 'createdAt', dir: 'desc' }` (più recenti, come ora).
- Si applica al set **dopo** il filtro, in entrambe le viste (galleria e tabella).

## 2. Filtri avanzati

- Estensione del tipo `Filters` in `value.ts` con campi opzionali:
  - `minValue?: number`, `maxValue?: number` (sul `marketValue` per unità)
  - `pl?: 'gain' | 'loss'` (segno di `itemDifference`)
  - `setName?` (già presente), `language?: string`
- `filterItems` aggiorna per gestire i nuovi campi (range valore inclusivo; `pl` su `itemDifference > 0` / `< 0`; `language` match esatto).
- UI: sezione **"Filtri avanzati"** espandibile (toggle mostra/nascondi) sotto la `FilterBar`:
  input numerici Valore min/Valore max, select P/L (Tutti / In guadagno / In perdita),
  input testo Set, input testo Lingua. Pulsante **"Azzera filtri"** che resetta `Filters` a `{}`.
- I totali (`collectionTotals`) continuano a riflettere il set filtrato.

## 3. Export CSV

- Nuovo `src/lib/csv.ts`:
  - `itemsToCsv(items, labels): string` genera CSV con header e righe.
  - Colonne: Nome, Gioco, Tipo, Condizione, Lingua, Set, Quantità, Prezzo acquisto, Valore di mercato, Differenza, Fonte valore.
  - Valori di gioco/tipo/condizione tradotti tramite mappe label passate in input (così il CSV è nella lingua UI). Numeri con punto decimale; campi con virgola/virgolette/newline correttamente quotati (escape `"` → `""`); newline `\r\n`; prefisso BOM UTF-8 per compatibilità Excel.
- UI: pulsante **"Esporta CSV"** in `CollectionView` che esporta il set **filtrato e ordinato**
  correntemente visibile. Download client-side via `Blob` + link temporaneo; nome file
  `tcg-archive-YYYY-MM-DD.csv` (data presa da `new Date()` nel handler client).

## 4. Statistiche extra (dashboard)

- Funzioni pure in `value.ts`:
  - `groupTotals(items, keyFn): { key, totals }[]` — riusabile per ripartizione per tipo e per condizione.
  - `topByValue(items, n)` e `topByDifference(items, n, dir)` — top N per `marketValue*qty` e per `itemDifference` (guadagno e perdita).
  - `averageValuePerPiece(items)` = `totalValue / pieceCount` (0 se nessun pezzo).
- UI: nuove sezioni nella `Dashboard`:
  - "Per tipo" e "Per condizione" (card simili a "Per gioco", con valore e P/L).
  - "Top per valore" (top 5) e "Top per guadagno/perdita" (top 5 in guadagno e top 5 in perdita).
  - "Valore medio per pezzo" come `SummaryCard`.

## Internazionalizzazione

Tutte le nuove etichette (ordinamenti, filtri avanzati, pulsanti, intestazioni statistiche,
header CSV) aggiunte ai dizionari `it`/`en` in `src/lib/i18n.ts` e usate via `useT()`.

## Testing

Vitest sulle funzioni pure: `sortItems` (ogni chiave + direzione + stabilità), `filterItems`
esteso (range valore, pl, lingua), `itemsToCsv` (header, quoting/escape, BOM, righe corrette),
e le funzioni statistiche (`groupTotals`, `topByValue`, `topByDifference`, `averageValuePerPiece`).
La logica UI resta sottile (consuma le funzioni pure).

## Fuori scope

- Storico prezzi / grafici nel tempo (richiederebbe snapshot in DB: ciclo separato).
- Persistenza di ordinamento/filtri tra sessioni (i filtri restano in stato locale; la vista
  Galleria/Tabella resta persistita come ora).
- Import CSV.
