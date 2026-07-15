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
| 1 | `lib/fx.ts` — cambio USD→EUR live + cache 24h | ✅ fatto |
| 2 | `pricing/tcgdex.ts` — ricerca carte IT + prezzo Cardmarket EUR | ⬜ |
| 3 | `pricing/sealedGlossary.ts` — glossario IT→EN tipi prodotto | ✅ fatto |
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

## ⚠️ Lezione appresa: i mock hanno nascosto lo stesso bug due volte

Il Task 5 (ricerca sigillati) è passato **due volte** con i test unitari verdi mentre era **sbagliato sui dati reali**.
La prima fixture era irrealistica (metteva "First Partner Pack" dentro il gruppo "Sword & Shield", mentre nella
realtà tcgcsv ha un gruppo dedicato). Regola per questo modulo: **verificare sempre contro tcgcsv live**, non
solo con i mock. Script rapido, dalla root del repo:

```ts
// live-check.ts
import { searchSealedProducts } from '@/lib/pricing/sealed'
;(async () => console.log(await searchSealedProducts("Collezione Allenatore Elite Rivali Predestinati")))()
```
```bash
npx tsx live-check.ts
```

## Log modifiche

| Data | Modifica | Verifica | Commit |
|---|---|---|---|
| 2026-07-15 | Spec di design + file avanzamento + branch | — | `81e42d9` |
| 2026-07-15 | Piano di implementazione (9 task) | self-review | `77ec66f` |
| 2026-07-15 | Task 1: `lib/fx.ts` — `getUsdToEurRate()` cache 24h + fallback `0.877`, `api.frankfurter.dev` | `npm test -- fx` 4/4; tsc/lint puliti; review ✅ | `ea12187` |
| 2026-07-15 | Task 2: `sealedGlossary.ts` — glossario IT→EN | 11/11; review ✅ dopo 1 fix (regex single-pass word-boundary) | `98b6689`, `e5a5385` |
| 2026-07-15 | Task 3: `tcgdex.ts` — ricerca carte IT + prezzo Cardmarket EUR | 9/9; review ✅ dopo 1 fix (cache-poisoning su /sets) | `3380934`, `624a9be` |
| 2026-07-15 | Task 4: registry → TCGdex, **pokemontcg.io rimosso**, route orfana `/api/sets/search` eliminata | 62/62; tsc/lint puliti; review ✅ | `5995595` |
| 2026-07-15 | Task 5: `sealed.ts` — cascata + FX live | 15/15 unit verdi **ma live ANCORA sbagliato** (vedi sotto) | `a059521`, `3674009`, `e3caaec` |

## ✅ Task 5 risolto — verificato live al commit `2bc6d64`

| Query | Risultato | Esito |
|---|---|---|
| "Primi compagni d'avventura" | 9 `[exact]`, prezzi corretti | ✅ **bug originale risolto** |
| "Collezione Allenatore Elite Rivali Predestinati" | 3 `[exact]`, "Destined Rivals Elite Trainer Box — 150.74 EUR" | ✅ |
| "Rivali Predestinati" | 25 prodotti, tutti Destined Rivals | ✅ |
| "zzzzqqqq" | 0 risultati | ✅ |

**Causa radice** (trovata strumentando contro dati live, non leggendo il codice): il set hint
`["rivali","predestinati"]` matchava **due** set TCGdex — `pl2` (IT "L'Ascesa dei Rivali" / EN
"Rising Rivals") e `sv10` (IT "Rivali Predestinati" / EN "Destined Rivals") — perché bastava *un solo*
token. Poi i nomi inglesi risolti venivano **spezzati in token**, e il token spurio `"rising"`
selezionava il gruppo **"Chaos Rising"**. Infine `.slice(0,4)`, sull'ordine di pubblicazione
decrescente di tcgcsv, teneva il set più recente e **scartava quello giusto**.

**Fix**: i set vengono ora **pesati** sul numero di token distinti matchati (si tengono solo i
migliori), i gruppi si matchano sul nome inglese **come frase intera** e i candidati sono ordinati
per qualità del match *prima* dello slice.

⚠️ Il task-review formale del Task 5 non è stato eseguito (3 round di fix; ho verificato io il
comportamento live). La qualità del codice va coperta dal **review finale di branch** — non saltarlo.

## Debito segnalato

- **`AGENTS.md` punta a un percorso inesistente**: dice di leggere `node_modules/next/dist/docs/`
  prima di scrivere codice, ma quella cartella **non esiste** in Next 16.2.9 (verificato). L'istruzione
  è ineseguibile e viene silenziosamente ignorata da ogni agent. Da correggere o rimuovere.
- **README.md** documenta ancora pokemontcg.io e `POKEMONTCGIO_API_KEY` come fonte prezzi: ora è falso.
| 2026-07-15 | Task 1: `lib/fx.ts` — `getUsdToEurRate()` con cache 24h e fallback `0.877`, endpoint `api.frankfurter.dev` | `npm test -- fx` → 4/4 verdi; `tsc --noEmit` e `npm run lint` puliti | `ea12187` |
| 2026-07-15 | Task 2 (SDD): `pricing/sealedGlossary.ts` — `normalizeQuery`/`translateSealedQuery`/`queryTokens`, glossario IT→EN sigillati (funzioni pure, non ancora collegate a `sealed.ts`) | `npm test -- sealedGlossary` → 8/8 verdi; `npm test` (suite intera) → 54/54 verdi; `tsc --noEmit` e `npm run lint` puliti | `98b6689` |
