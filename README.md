# TCG Archive

Applicazione web per gestire la propria collezione di carte collezionabili (TCG), prodotti
sigillati e carte gradate. Per ogni articolo si registrano quantità, prezzo d'acquisto e
condizione; per le carte **Pokémon raw** il valore di mercato viene recuperato in automatico
da [pokemontcg.io](https://pokemontcg.io) (prezzo minimo Cardmarket in EUR). L'app mostra la
differenza tra costo e valore per ogni articolo e il **saldo complessivo** della collezione,
con filtri per analisi personalizzate. UI responsive (desktop, tablet, smartphone).

## Stack

- **Next.js** (App Router, TypeScript) — frontend + API routes
- **Prisma** (v7) su **SQLite** in locale (pronto per Postgres in cloud)
- **Tailwind CSS** (mobile-first)
- **Vitest** (unit) + **Playwright** (e2e)

## Setup

Richiede Node.js 20+ e un database **Postgres** (consigliato [Neon](https://neon.tech), piano gratuito).

```bash
# 1. Installa le dipendenze (il postinstall genera il client Prisma)
npm install

# 2. Configura le variabili d'ambiente
cp .env.example .env
#   - DATABASE_URL = connection string POOLED di Neon (host con "-pooler")
#   - DIRECT_URL   = connection string DIRECT di Neon (senza "-pooler"), usata dalla CLI Prisma
#   - POKEMONTCGIO_API_KEY è opzionale: senza chiave l'API pokemontcg.io
#     funziona con limiti di rate più bassi. Ottienine una gratis su
#     https://dev.pokemontcg.io per limiti più alti.

# 3. Crea lo schema sul DB ed esegui il seed dell'utente di default
npm run db:setup        # = prisma db push + prisma db seed

# 4. Avvia in sviluppo
npm run dev             # http://localhost:3000
```

> **Importante:** il seed (`prisma db seed`) è obbligatorio al primo avvio. Tutti gli
> articoli appartengono all'utente `default-user`; senza il seed il primo inserimento
> fallisce con un errore di foreign key. L'app è single-user ora, ma lo schema è già
> predisposto al multiutente.

## Deploy su Netlify

L'app è pronta per Netlify (Next.js runtime + Neon Postgres). Vedi `netlify.toml`.

1. Crea un progetto su **Neon** e copia le due connection string (pooled → `DATABASE_URL`, direct → `DIRECT_URL`).
2. Su **Netlify**: *Add new site → Import from GitHub* e seleziona `GabrieleBottai01/TCG-Archive`.
3. In *Site settings → Environment variables* imposta `DATABASE_URL`, `DIRECT_URL` e (opz.) `POKEMONTCGIO_API_KEY`.
4. Lancia il deploy: il build command (`prisma db push && prisma db seed && next build`) crea lo schema, esegue il seed e builda. Ogni push su `main` ridistribuisce automaticamente.

## Comandi utili

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia il server di sviluppo |
| `npm run build` | Build di produzione |
| `npm start` | Avvia la build di produzione |
| `npm test` | Test unitari (Vitest) |
| `npm run e2e` | Test end-to-end (Playwright, Chromium) |
| `npm run lint` | ESLint (deve restare senza errori: la build fallisce sugli errori) |
| `npm run db:push` | Sincronizza lo schema Prisma sul DB |
| `npm run db:seed` | Seed dell'utente di default |
| `npm run db:setup` | `db:push` + `db:seed` insieme |

## Architettura

- **`src/lib/value.ts`** — funzioni pure per i calcoli di valore (differenza, totali, filtri).
  Unica fonte di verità per la matematica monetaria; i componenti non calcolano totali inline.
- **`src/lib/pricing/`** — astrazione a *provider* pluggable. `PokemonTcgIoProvider` recupera
  i prezzi automatici (solo Pokémon raw); `ManualProvider` per tutto il resto. Aggiungere
  l'API ufficiale Cardmarket in futuro = una nuova implementazione, senza riscritture.
- **API routes** (`src/app/api/...`) — la chiave dell'API prezzi resta lato server. Item CRUD
  validato con Zod; mutazioni scopate per `userId` (IDOR-safe).
- **Pagine** — `/` dashboard (riepilogo + "Aggiorna valori"), `/collezione` (lista + filtri +
  totali live + modale aggiungi/modifica con ricerca carte).

Documentazione di design e piano: `docs/superpowers/`.

## Note sui prezzi

Cardmarket non offre un'API pubblica aperta. I prezzi automatici provengono da pokemontcg.io
(`cardmarket.lowPrice`), disponibile solo per le carte Pokémon. Per carte gradate, prodotti
sealed e altri giochi il valore di mercato si inserisce manualmente. La condizione (Poor→Mint)
è un attributo informativo della collezione e non altera il valore calcolato.
