# TCG Archive — Design Spec

**Data:** 2026-06-29
**Stato:** Approvato (design), in attesa di revisione spec scritto

## Obiettivo

Applicazione web per gestire una collezione di carte collezionabili (TCG), prodotti
sigillati e carte gradate. L'utente registra i propri articoli con quantità, prezzo
d'acquisto e condizione; per le carte Pokémon raw il valore di mercato viene
recuperato automaticamente; l'app mostra la differenza tra costo e valore e il saldo
complessivo della collezione, con filtri per analisi custom. UI responsive (desktop,
tablet, smartphone).

## Decisioni chiave (dal brainstorming)

1. **Fonte prezzi:** API non ufficiale `pokemontcg.io` (gratuita, espone i prezzi
   Cardmarket in EUR). Cardmarket non offre API pubbliche aperte; lo scraping è contro
   i ToS. Architettura a *pricing provider* pluggable per agganciare in futuro l'API
   Cardmarket ufficiale.
2. **Prezzo vs condizione:** valore di mercato = `cardmarket.lowPrice` dell'API ("valore
   minimo"). La condizione è un attributo informativo della collezione e **non** altera
   il calcolo del valore.
3. **Ambito:** single-user ora, schema già predisposto al multiutente (concetto di
   *owner*). Login aggiungibile dopo senza migrazioni distruttive.
4. **Tipi di articolo (tutti nell'MVP):** carte singole raw, carte gradate (PSA/BGS/CGC),
   sealed/box, altri TCG (Magic, Yu-Gi-Oh, One Piece). Prezzo automatico solo per
   Pokémon raw; tutto il resto a prezzo manuale.
5. **Stack:** Next.js (App Router) + Prisma + Tailwind CSS.

## Architettura

- **Next.js (App Router)** full-stack, progetto unico.
- **Prisma ORM** con **SQLite** in locale (`dev.db`); passaggio a **Postgres** in cloud
  cambiando solo il datasource.
- **Tailwind CSS**, mobile-first.
- **API routes** server-side per ricerca carte e refresh prezzi → l'**API key di
  pokemontcg.io resta lato server**, mai esposta al browser.
- **Pricing provider astratto:** interfaccia `PriceProvider`; implementazioni
  `PokemonTcgIoProvider` (auto) e `ManualProvider` (no-op). Estendibile a Cardmarket
  ufficiale senza riscritture.

## Modello dati (Prisma)

### User
- `id`, `email` (nullable per ora), `name`, timestamps.
- Un utente "default" seedato nell'MVP. Tutti gli `Item` referenziano un `User` via
  `userId` per la predisposizione multiutente.

### Item
- `id`, `userId`
- `game`: enum POKEMON | MAGIC | YUGIOH | ONEPIECE | OTHER
- `itemType`: enum RAW | GRADED | SEALED
- `name`, `setName`, `cardNumber`, `language` (nullable dove non applicabile)
- `externalId` (id pokemontcg.io, nullable), `imageUrl` (nullable)
- `condition`: enum POOR | PLAYED | LIGHT_PLAYED | GOOD | EXCELLENT | NEAR_MINT | MINT
  (usato per RAW; nullable altrimenti)
- `gradingCompany`: enum PSA | BGS | CGC (nullable; per GRADED)
- `grade`: string/decimal (nullable; per GRADED)
- `quantity`: int (default 1)
- `purchasePrice`: decimal (per unità)
- `marketValue`: decimal (per unità)
- `marketValueSource`: enum AUTO | MANUAL
- `marketValueUpdatedAt`: datetime (nullable)
- `notes`: text (nullable)
- `createdAt`, `updatedAt`

## Logica di valore (cuore dell'app)

- Per articolo: **differenza = (marketValue − purchasePrice) × quantity**, mostrata con
  segno e colore (verde positivo / rosso negativo).
- **Saldo collezione:**
  - valore totale = Σ(marketValue × quantity)
  - costo totale = Σ(purchasePrice × quantity)
  - **P/L = valore totale − costo totale**
  - numero articoli e numero pezzi (Σ quantity)
- **Filtri** (gioco, tipo, condizione, set, ricerca testuale): i totali si **ricalcolano
  sul sottoinsieme filtrato** → "selezione custom" richiesta dal brief.

## Prezzi automatici

- Solo **Pokémon raw con `externalId`**: `marketValue = cardmarket.lowPrice`,
  `marketValueSource = AUTO`, aggiorna `marketValueUpdatedAt`.
- Aggiornamento: **all'inserimento** (precompilazione) **+ pulsante "Aggiorna valori"**
  in dashboard che fa un batch su tutti gli articoli AUTO. **Nessun polling continuo**
  (rispetto dei rate limit dell'API).
- Gradate / sealed / altri TCG: `marketValue` inserito manualmente, `source = MANUAL`.

## Flusso d'inserimento

- **Pokémon raw:** campo ricerca → digiti nome → proxy `/api/cards/search` →
  risultati con immagine/set/numero → selezione → precompila `name`, `setName`,
  `cardNumber`, `imageUrl`, `externalId`, `marketValue` (lowPrice). Poi l'utente indica
  condizione, quantità, prezzo d'acquisto.
- **Gradate / Sealed / Altri:** form manuale (campi grading o tipo sealed), valore di
  mercato a mano.

## Pagine UI (responsive)

- **Dashboard:** card riepilogo (valore totale, costo, P/L, n. articoli) + breakdown per
  gioco/tipo + pulsante "Aggiorna valori".
- **Collezione:** tabella su desktop / griglia a card su mobile, con filtri e colonne
  quantità/costo/valore/differenza. Azioni: modifica, elimina.
- **Aggiungi/Modifica articolo:** form a modale, con ricerca carte per Pokémon raw.

## Error handling

- API pokemontcg.io down / rate-limit → messaggio chiaro; si **mantiene l'ultimo valore
  noto** (non si azzera `marketValue`).
- Carta senza prezzo Cardmarket → flag "prezzo non disponibile", fallback manuale.
- Validazione form lato client + server (es. Zod).

## Testing

- **Vitest** per la logica di calcolo (differenza, totali, filtri) e per il pricing
  provider (con API mockata).
- **Playwright** per un e2e leggero del flusso principale (inserimento + dashboard).

## Processo di lavoro

- **File di avanzamento** `docs/PROGRESS.md` aggiornato a ogni step → nessun progresso
  perso, tracciabilità degli errori.
- **Monitoraggio subagent:** verifica dell'output di ogni agente prima di procedere.
- **Avviso all'~80% di context** per passaggio a nuova sessione.

## Fuori scope (MVP)

- Login/autenticazione reale (solo predisposizione schema).
- Storico prezzi nel tempo / grafici temporali.
- Integrazione Cardmarket ufficiale (solo interfaccia predisposta).
- Moltiplicatori di valore per condizione.
