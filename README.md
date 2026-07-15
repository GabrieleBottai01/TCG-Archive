# TCG Archive

Applicazione web per gestire la propria collezione di carte collezionabili (TCG), prodotti
sigillati e carte gradate. Per ogni articolo si registrano quantità, prezzo d'acquisto e
condizione; per le carte **Pokémon raw** il valore di mercato viene recuperato in automatico
da [TCGdex](https://tcgdex.dev) (prezzo minimo Cardmarket in EUR), e per i **prodotti sigillati**
da [tcgcsv](https://tcgcsv.com) (prezzo TCGplayer USA convertito in EUR: una stima, etichettata
come tale nell'interfaccia). La ricerca funziona in italiano. L'app mostra la
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
#   - AUTH_SECRET   = genera con `openssl rand -base64 32`
#   - AUTH_URL      = http://localhost:3000 in locale
#   - AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET = credenziali OAuth (opzionali:
#     senza di esse resta attivo il login email+password)
#   Le API dei prezzi (TCGdex, tcgcsv) non richiedono alcuna chiave.

# 3. Crea lo schema sul DB
npm run db:push         # = prisma db push

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
3. In *Site settings → Environment variables* imposta `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` (il dominio di produzione) e, per il login Google, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. Lancia il deploy: il build command (`prisma db push && next build`) crea lo schema e builda. Ogni push su `main` ridistribuisce automaticamente.

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

Cardmarket non offre un'API pubblica aperta.

- **Carte Pokémon raw** → [TCGdex](https://tcgdex.dev) (`pricing.cardmarket.low`): prezzo Cardmarket
  in **EUR**, mercato europeo. Nessuna API key.
- **Prodotti sigillati** → [tcgcsv](https://tcgcsv.com), che ripubblica i prezzi TCGplayer in **USD**,
  convertiti in EUR con il cambio BCE del giorno ([Frankfurter](https://frankfurter.dev), cache 24h).
  È il **mercato USA**, quindi una *stima*: l'interfaccia la etichetta come tale. Il catalogo tcgcsv
  contiene solo prodotti in inglese, perciò per un sigillato italiano o giapponese il prezzo mostrato
  è quello della versione inglese — anche questo è dichiarato nell'interfaccia.
- **Carte gradate** → sempre manuali: il valore di uno slab diverge da quello della carta raw.

La ricerca dei sigillati funziona per **nome del set + tipo prodotto** (es. "Collezione Allenatore
Élite Rivali Predestinati"), tradotti dall'italiano tramite un glossario curato: tcgcsv non ha un
indice per nome prodotto, quindi cercare un semplice nome di Pokémon non è supportato.

La condizione (Poor→Mint) è un attributo informativo della collezione e non altera il valore calcolato.
