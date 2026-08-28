# TCG Archive — Registro di avanzamento

Record durevole (committato nel repo) di ogni modifica sostanziale, per non perdere progressi
tra sessioni e non ripetere errori già affrontati. **All'inizio di ogni sessione: leggere questo file
prima di agire.** Voci più recenti in alto. Aggiornare a OGNI step con: decisioni prese, file creati/
modificati, problemi noti e come sono stati risolti.

> Questo è IL file di avanzamento canonico. Il ledger effimero sotto `.superpowers/sdd/` non è un
> sostituto (è git-ignored e viene cancellato a fine lavoro).

---

## 2026-08-28 — README inglese + presentazione repo pubblico

**Cosa:** riscritto `README.md` da zero in **inglese**, aggiornato allo stato reale (catena sealed
Cardtrader→Cardmarket→eBay, raw da Cardmarket/TCGdex, portfolio chart da snapshot immutabili, observatory
informativo, pricing philosophy "fonti gratuite e keyless / valori sempre etichettati per fonte", stack
Next.js 16 / React 19 / Prisma 7 / Neon / Tailwind 4, setup, script, struttura progetto). Il vecchio README
italiano era datato (diceva sealed da tcgcsv). Metadati GitHub aggiornati: description EN, homepage
`https://tcgarchive.netlify.app`, 9 topic (pokemon, tcg, trading-cards, collection-manager, nextjs, prisma,
typescript, cardmarket, pricing). **Non aggiunta una LICENSE** (decisione legale di Gabriele; senza licenza
il pubblico è "all rights reserved").

---

## 2026-08-28 — Push progress-log + repo reso pubblico

**Cosa:** consolidato il registro su `docs/AVANZAMENTO.md` (era `docs/superpowers/progress-log.md`);
push su `origin/main` (deploy Netlify); repo GitHub `GabrieleBottai01/TCG-Archive` reso **pubblico**.
**Sicurezza pre-pubblicazione:** verificato che nessun segreto sia committato — solo `.env.example`
con placeholder è tracciato; `.env`/`.env.local` gitignored e mai in history; nessun valore
tipo-credenziale nei file tracciati. Segreti reali vivono solo su Netlify/locale.
**Metodo di lavoro (regole permanenti di Gabriele):** 1) monitorare sempre l'output dei subagent e
verificarlo con build/typecheck/test prima di proseguire; 2) avvisare a ~80% di context per passare a
una nuova sessione, salvando prima tutti i progressi; 3) tenere QUESTO file aggiornato a ogni step.
Salvate anche in memoria (`tcg-archive-working-process.md`).

---

## 2026-07-27 — F-cardmarket: fonte Cardmarket automatica per i sealed (SPEDITO + DEPLOYATO)

**Arco:** "Collectr, done better" → sotto-progetto F-cardmarket (segue F-core).
**Spec:** `docs/superpowers/specs/2026-07-27-cardmarket-sealed-source-design.md`
**Piano:** `docs/superpowers/plans/2026-07-27-cardmarket-sealed-source.md`

**Cosa e perché:** i sealed che Cardtrader non mappa cadevano su eBay, che ne sottoprezzava alcuni
(confermato: Pokémon GO ETB €39,58 eBay vs ~€97/€103 Cardmarket). Gabriele voleva una fonte Cardmarket
**totalmente automatica** (niente inserimento manuale). Soluzione: i **file pubblici giornalieri S3** di
Cardmarket (nessuna chiave/login/scraping). Catena ora **Cardtrader → Cardmarket → eBay**; valore =
`trend` (fallback avg→low, guard `>0`) per evitare i low-outlier.

**Fatti chiave (verificati dal vivo su S3):**
- Pokémon = game id Cardmarket `6`.
- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
- Catalogo (sealed): `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json`
- Entrambi 200 con User-Agent browser, senza auth (solo le pagine HTML danno 403 ai bot).
- Àncora: Pokémon GO ETB → idProduct 653700 → trend €103,38.

**Commit (mergiati in main via `edd2649`):**
- `2b6a1dd` campo/tipo `cardmarketProductId` su Item/PriceInput/PriceResult
- `72b0c31` core puro Cardmarket (prezzo trend + resolver nome→idProduct)
- `5f81423` layer fetch+cache (download S3 single-flight)
- `424076f` catena sealedPrice Cardtrader→Cardmarket→eBay (+ mock cardmarket in tcgcsvProvider.test.ts per fermare una vera chiamata S3)
- `d676823` chip Cardmarket + persistenza cardmarketProductId in refresh/estimate/modale
- `c1bb563` script live-check `scripts/cardmarket-live-check.ts`
- `00208ac` cardmarketSealedEur rifiuta prezzi 0 espliciti (fix review finale)
- `5c20bf7` docs: chiarito deploy DB (netlify `prisma db push` gira pre-build)
- `bf0d93a` docs: registro avanzamento durevole

**Verifica:** 294 test verdi, tsc + lint puliti; 6 task SDD ciascuno con impl + review a 2 stadi; review
finale opus "ready to merge". Deploy `edd2649` su Netlify = `ready` (il build ha fatto `prisma db push`
aggiungendo la colonna nullable `Item.cardmarketProductId` a Neon prod). Prod sano (sito 307→login,
`/api/prices/refresh` 401 gated).

**⚠️ APERTO / prossima sessione:**
- Verifica live autenticata: confermare che il Pokémon GO ETB si riprezzi DAVVERO €39,58 → ~€103 con chip
  "Cardmarket" sulla `/collezione` di Gabriele (serve la sua sessione loggata o guidare il suo Chrome).
- Arricchire `NAMES` in `scripts/cardmarket-live-check.ts` con altri prodotti che Cardtrader non mappa
  (ora solo i 2 àncora).

**Limite noto:** i nomi catalogo sono inglesi (Phase 2A) → si mappa il prodotto Cardmarket inglese; i
sealed in lingua italiana/giapponese sono idProduct separati, fuori scope.
