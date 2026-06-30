# Auth Multiutente — Fase 1 — Design Spec

**Data:** 2026-06-30
**Stato:** Approvato (design), in attesa di revisione spec scritto

## Obiettivo

Trasformare TCG Archive da single-user (hard-coded `userId='default-user'`) ad
applicazione **multiutente** con autenticazione reale: registrazione e login con
**email+password** e **Google (OAuth)**, sessioni, e tutte le query/route limitate
all'utente in sessione. Le funzioni email (verifica, reset) sono la **Fase 2**.

## Contesto

Next.js (App Router, TS) + Prisma 7 (client generato in `src/generated/prisma`, adapter
Neon) su Neon Postgres, deploy Netlify. Lo schema ha già `User` e `Item` con `Item.userId`
(FK a User). Attualmente ogni route usa la costante `USER_ID = 'default-user'` e le pagine
`/` e `/collezione` interrogano quell'utente. La collezione di produzione è vuota.

## Stack

- **Auth.js v5** (`next-auth@5`) + **`@auth/prisma-adapter`**.
- **`bcryptjs`** per hash/verify password (puro JS, ok su serverless Netlify).
- **Sessioni JWT** (`session.strategy = 'jwt'`) — necessarie con il provider Credentials.
- Provider: **Credentials** (email+password) e **Google** (OAuth).

## Modello dati (Prisma)

### User (modifiche)
- `email String @unique` — diventa obbligatoria (identità di login). (Oggi è `String?`.)
- `passwordHash String?` — null per utenti solo-Google.
- `emailVerified DateTime?` — standard Auth.js (usata in Fase 2).
- `image String?` — avatar da Google.
- `name String?` resta. `accounts Account[]`, `sessions Session[]` (relazioni adapter).

### Nuovi modelli standard Auth.js
`Account`, `Session`, `VerificationToken` con i campi standard dell'adapter Prisma di Auth.js.

### Item
- `userId` resta FK; la relazione diventa `onDelete: Cascade` (eliminando un utente si
  eliminano i suoi articoli).

Lo schema si sincronizza con `prisma db push` (come già in produzione).

## Configurazione auth

- `src/auth.ts`: `export const { handlers, auth, signIn, signOut } = NextAuth({...})` con:
  - `adapter: PrismaAdapter(prisma)`
  - `session: { strategy: 'jwt' }`
  - `providers`: `Credentials` (con `authorize` che cerca l'utente per email, verifica la
    password con bcrypt e ritorna `{ id, email, name, image }`, o `null`) e `Google`.
  - `callbacks.jwt`: mette `token.id = user.id` al login; `callbacks.session`: copia
    `session.user.id = token.id`.
  - `pages: { signIn: '/login' }`.
- `src/app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers`.
- `src/app/api/register/route.ts`: POST. Valida con Zod (`email` valido, `password` ≥ 8,
  `name` opzionale). Se l'email è già presente → 409. Altrimenti hash bcrypt e
  `prisma.user.create`. Risposta `{ ok: true }`. (Il client poi chiama `signIn`.)

## Pagine

- **`/login`** (`src/app/login/page.tsx`, client): form email+password che chiama
  `signIn('credentials', { email, password, redirect: false })`; bottone "Accedi con Google"
  → `signIn('google')`. Mostra errore "Credenziali non valide" su fallimento. Link a `/register`.
- **`/register`** (`src/app/register/page.tsx`, client): form (nome opzionale, email,
  password) → `POST /api/register`; al successo `signIn('credentials', ...)` e redirect a `/`.
  Mostra errori di validazione / email già usata. Link a `/login`.
- Entrambe usano lo stile/temi esistenti e sono tradotte IT/EN.

## Scoping multiutente

- Helper `requireUserId()` (server) in `src/lib/session.ts`: `const s = await auth()`; se
  assente lancia/ritorna non-autorizzato. Usato dalle API per ottenere l'id utente.
- API routes: sostituire `USER_ID = 'default-user'` con l'id dell'utente in sessione in
  `/api/items` (GET/POST), `/api/items/[id]` (PUT/DELETE — già scopate per userId, ora
  l'userId è quello di sessione), `/api/prices/refresh`. Senza sessione → **401**.
- Pagine server `/` e `/collezione`: `const session = await auth()`; se assente
  `redirect('/login')`; altrimenti `findMany({ where: { userId: session.user.id } })`.
- **`src/middleware.ts`**: protegge `/` e `/collezione` (redirect a `/login` se non loggato);
  lascia pubbliche `/login`, `/register`, `/api/auth/*`, asset.

## Nav & logout

- `layout.tsx` (server) legge `const session = await auth()` e passa `session` a `SiteNav`.
- `SiteNav` (client): se `session` mostra nome/email utente + bottone **Logout**
  (`signOut({ callbackUrl: '/login' })`); altrimenti link **Accedi** (`/login`) e
  **Registrati** (`/register`). Il logout è un piccolo handler client.

## Variabili d'ambiente (nuove)

In `.env` locale e nelle env di Netlify:
- `AUTH_SECRET` — generata (es. `openssl rand -base64 32`).
- `AUTH_URL=https://tcgarchive.netlify.app` (in locale `http://localhost:3000`).
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — create da Gabriele nella Google Cloud Console
  (OAuth 2.0 Client, redirect URI `https://tcgarchive.netlify.app/api/auth/callback/google`).
- `.env.example` aggiornato con i nuovi nomi.

## Migrazione dati

La collezione di produzione è vuota: nessuna migrazione di articoli. **Rimozione del seed
`default-user`** (`prisma/seed.ts` e lo step `prisma db seed` dal build Netlify in
`netlify.toml`). I nuovi utenti partono con collezione vuota.

## i18n

Tutte le nuove stringhe (login, registrazione, nav utente/logout, messaggi d'errore) nei
dizionari `it`/`en` di `src/lib/i18n.ts`, usate via `useT()`.

## Error handling

- Registrazione: input non valido → 400; email già usata → 409.
- Login credenziali errate → la pagina mostra "Credenziali non valide".
- API senza sessione → 401; pagine senza sessione → redirect `/login`.

## Testing

- `src/lib/password.ts` (`hashPassword`/`verifyPassword` su bcryptjs) con test unit
  (hash ≠ plaintext; verify true/false).
- Schema Zod della registrazione con test (email valida/invalida, password < 8 rifiutata).
- I flussi end-to-end di Auth.js (login/Google/sessione/redirect) si verificano
  manualmente / in produzione (richiedono DB + credenziali Google).

## Fuori scope (Fase 2)

- Verifica email alla registrazione e reset password (richiedono Resend/servizio email).
- Profilo utente / cambio password dall'app.
- Ruoli/permessi, condivisione collezioni.
