# Avanzamento — Refactor collezione (form minimale + prezzi auto + ricerca IT)

**Branch:** `feat/collection-refactor` · **Spec:** `docs/superpowers/specs/2026-07-15-collection-refactor-design.md`

> Aggiornare questo file ad **ogni** modifica: cosa è stato fatto, cosa è verificato, quali errori sono emersi e come sono stati risolti. Serve a non perdere progressi tra sessioni e a non ripetere gli stessi errori.

## ⛔ Vincoli operativi (non violare)

- **NIENTE `git push`** e nessun deploy Netlify finché l'utente non lo autorizza esplicitamente. Il push su `main` triggera un build Netlify e consuma i suoi crediti.
- Commit locali: OK. Si lavora sul branch `feat/collection-refactor`.
- Avvisare l'utente al ~80% del context.
- L'output dei subagent va sempre verificato, non accettato ciecamente.

## Stato

| # | Task | Stato |
|---|------|-------|
| — | Brainstorming + decisioni | ✅ fatto |
| — | Spec di design scritta e approvata | ✅ fatto |
| — | Branch dedicato creato | ✅ fatto |
| — | Piano di implementazione | ⏳ prossimo |
| 1 | `lib/fx.ts` — cambio USD→EUR live + cache 24h | ⬜ |
| 2 | `pricing/tcgdex.ts` — ricerca carte IT + prezzo Cardmarket EUR | ⬜ |
| 3 | `pricing/sealedGlossary.ts` — glossario IT→EN tipi prodotto | ⬜ |
| 4 | `pricing/sealed.ts` — glossario + fallback "mostra sempre risultati" | ⬜ |
| 5 | `pricing/index.ts` — pickProvider: Tcgdex \| Tcgcsv \| Manual | ⬜ |
| 6 | Rimozione `pokemonTcgIo.ts` | ⬜ |
| 7 | `ItemFormModal.tsx` — form 14 campi → 3 + "Altri dettagli" | ⬜ |
| 8 | Etichette prezzo (verde/giallo/warning IT-JP) | ⬜ |
| 9 | `CardSearch` / `SealedSearch` — prezzo nei risultati | ⬜ |

## Decisioni (con motivazione)

1. **TCGdex primario, pokemontcg.io rimosso.** Non è solo per l'italiano: ptcgio ha **0% di copertura prezzi su 744 carte moderne** (era Mega Evolution + Prismatic Evolutions) e prezzi vecchi ~180gg sui set recenti, con 504 durante i test. TCGdex ha nomi IT nativi + Cardmarket EUR aggiornato.
2. **Sigillati: prezzo auto ma etichettato.** Ribalta la decisione precedente ("sigillati sempre manuali"). L'utente accetta una stima USA convertita pur di non digitare i prezzi, purché sia dichiarata.
3. **Glossario IT→EN curato per i sigillati.** Nessuna API gratuita ha i nomi dei sigillati in italiano. I nomi sono composti `[Set] + [Tipo prodotto]`: i set li dà TCGdex in IT, i tipi prodotto sono un vocabolario chiuso. Limite accettato: va mantenuto a mano.
4. **Nessuna modifica allo schema DB.** `language` e `marketValueUpdatedAt` bastano; la fonte si deduce da `externalId`. Zero migrazioni → zero rischio deploy.
5. **Cambio USD→EUR live** (Frankfurter/BCE, cache 24h) al posto dello `0.92` hardcoded in `sealed.ts:6`.

## Trappole note (non ricascarci)

- **`?name=Primi*` su TCGdex restituisce `[]`**: il filtro è substring case-insensitive, l'asterisco è letterale. Niente wildcard.
- **Le immagini TCGdex richiedono un suffisso**: `.../165` da solo non è un'immagine; serve `/high.webp` o `/low.webp`.
- **La lista carte TCGdex NON ha né set né prezzo** (solo `id`, `localId`, `name`, `image`). Il prezzo sta solo nel dettaglio `/v2/it/cards/<id>` → non ciclare la lista per i prezzi (N+1): recuperarlo **alla selezione**. Il nome del set si ricava dal prefisso dell'id (`sv10-165`→`sv10`) su una mappa cacheata da `/v2/it/sets`.
- **API cambio**: `api.frankfurter.app` risponde **301** e `api.exchangerate.host` ora **richiede API key**. Usare `https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR` (verificato), fallback `https://open.er-api.com/v6/latest/USD`.
- **Il tasso hardcoded 0.92 è sbagliato**: il reale al 2026-07-15 è **0.877** → sigillati sovrastimati ~5%.
- **"Primi compagni d'avventura" non è una carta**: è un sigillato (First Partner Pack). Nessuna API gratuita lo ha in italiano → serve il glossario. Non cercarlo tra le carte.
- **`handlePickSealed` oggi scarta `priceEur` e `externalId`** già restituiti da `sealed.ts` (ItemFormModal.tsx:127-136). L'infrastruttura di pricing sigillati esiste già: va **collegata**, non riscritta.
- **tcgcsv non ha a catalogo i sigillati IT/JP**: il prezzo restituito è quello del prodotto **inglese** equivalente. Da etichettare.
- **Test locali non coprono DB/auth**: `.env` locale usa SQLite mentre l'app usa l'adapter Neon. Verificare con tsc/lint/test/build; il runtime solo in produzione.
- **Copertura prezzi TCGdex verificata solo su 12 carte**: campione piccolo, da riverificare su dati reali.

## Log modifiche

| Data | Modifica | Verifica | Commit |
|---|---|---|---|
| 2026-07-15 | Spec di design + file avanzamento + branch | — | (in corso) |
