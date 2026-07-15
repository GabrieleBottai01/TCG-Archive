# Collezione: form minimale, prezzi automatici, ricerca cross-lingua — Design

**Data:** 2026-07-15
**Stato:** approvato dall'utente

## Obiettivo

Rendere l'inserimento in collezione il più rapido possibile (cerca → scegli → 3 campi → salva), dare un prezzo automatico ovunque sia tecnicamente possibile, e far funzionare la ricerca in italiano anche quando il catalogo è in inglese.

## Contesto e vincoli

- L'utente colleziona **solo Pokémon**, **soprattutto prodotti sigillati**, in lingue **miste IT + EN + JP**.
- Il form attuale (`ItemFormModal.tsx`) ha **14 campi**, quasi tutti auto-compilabili ma tutti sempre visibili.
- **Nessun deploy** finché non autorizzato: si lavora su `feat/collection-refactor`, commit locali, nessun push.
- Nessuna API a pagamento.

## Decisioni prese (con l'utente)

| Tema | Decisione |
|---|---|
| Sorgente carte | **TCGdex primario**; `pokemontcg.io` rimosso |
| Sorgente sigillati | tcgcsv (unica fonte gratuita) |
| Prezzo sigillati | **Auto ma etichettato** come stima, sovrascrivibile |
| Cambio USD→EUR | **Tasso live** da API gratuita, cache 24h (sostituisce `0.92` hardcoded) |
| Ricerca sigillati IT | **Glossario IT→EN curato** + mapping set esistente |
| Campi in primo piano | Quantità, prezzo pagato, lingua |
| Migrazione externalId | Banale (poche/nessuna carta in collezione) |

> Questa spec **ribalta** la decisione precedente registrata in memoria ("i sigillati restano manuali"): l'utente accetta una stima etichettata pur di non inserire i prezzi a mano.

## Evidenze raccolte (verificate con richieste HTTP reali)

- **TCGdex** (`api.tcgdex.net/v2/it`): 15.234 carte in italiano su 187 set. Filtro `?name=` = substring case-insensitive (niente wildcard: `Primi*` restituisce `[]`). Espone `pricing.cardmarket` in **EUR**, aggiornato 2026-07-14. Nessuna API key. Rate limit **non documentato e non verificato** → trattare come esistente: cache + backoff.
- **pokemontcg.io**: solo inglese (`?language=it` ignorato silenziosamente). **744 carte moderne senza alcun prezzo**: era Mega Evolution (me1–me4, 564 carte) e Prismatic Evolutions (180) hanno `cardmarket` assente al 100%. Set recenti prezzati ma **vecchi ~180 giorni**. Errori 504 osservati durante i test.
- **Mapping TCGdex → pokemontcg.io**: deterministico, 2.004/2.004 carte verificate. Regola (`sv01`→`sv1`, `.5`→`pt5`) + tabella di 24 set irregolari. *Non serve* con TCGdex primario, ma resta documentato qui in caso di rollback.
- **"Primi compagni d'avventura" non esiste come carta** in nessuna delle due API: è un **prodotto sigillato** (First Partner Pack). **Nessuna API gratuita ha i nomi dei sigillati in italiano** → da qui la necessità del glossario.

## Architettura

### Sorgenti

| Dominio | Endpoint | Prezzo | Affidabilità |
|---|---|---|---|
| Carte | `GET /v2/it/cards?name=<q>` (lista), `GET /v2/it/cards/<id>` (dettaglio) | `pricing.cardmarket.low` (EUR) | Alta — mercato EU |
| Sigillati | tcgcsv `groups`/`products`/`prices` | `marketPrice` USD → EUR | **Stima** — mercato USA |
| Cambio | Frankfurter (BCE), cache 24h | — | — |

Immagini TCGdex richiedono un suffisso: `https://assets.tcgdex.net/it/sv/sv10/165/high.webp`.

### Provider

`pickProvider()` passa da `PokemonTcgIo | Tcgcsv | Manual` a **`Tcgdex | Tcgcsv | Manual`**, mantenendo l'interfaccia `PriceProvider` esistente (`supports()` / `fetchPrice()`), così la route di refresh non cambia.

### Form — da 14 campi a 3

Sempre visibile:
1. **Tipo**: `Sigillato` | `Carta` (toggle). Il selettore *gioco* sparisce: Pokémon è implicito (il campo resta nel DB con default `POKEMON`). Se `Carta`, sotto-opzione "gradata?" che commuta `RAW`↔`GRADED`.
2. **Ricerca** contestuale al tipo, con immagine + nome + prezzo nei risultati.
3. **Riepilogo** della selezione (immagine, nome, set, valore auto etichettato).
4. **Quantità** · **Prezzo pagato** · **Lingua** (select `IT`/`EN`/`JP`; oggi è testo libero).

In "Altri dettagli" (collassato): condizione, grading company + voto, note, override valore, URL immagine, nome/set/numero editabili.

### Etichettatura prezzi

- Carta → `Cardmarket · aggiornato il <data>` (verde)
- Sigillato EN → `Stima TCGplayer USA · convertito · <data>` (giallo)
- Sigillato IT/JP → `⚠️ Stima basata sul prodotto inglese` — tcgcsv non ha a catalogo i sigillati IT/JP, quindi il prezzo è quello della versione EN
- Modifica manuale del valore → `MANUAL`, con link per tornare ad `AUTO`

### Ricerca cross-lingua

- **Carte**: nativa (endpoint `it`).
- **Sigillati**, cascata deterministica (si ferma al primo livello che produce risultati):
  1. **Glossario IT→EN** sui tipi prodotto, applicato alla query.
  2. **Nomi set IT→EN** via TCGdex (già implementato in `sealed.ts`).
  3. **Substring** normalizzato (minuscole, accenti rimossi, punteggiatura → spazi) sui nomi prodotto EN.
  4. **Token overlap**: si spezza la query in token (≥3 caratteri, esclusi articoli/preposizioni) e si tengono i prodotti che matchano ≥1 token, ordinati per numero di token matchati.
  5. Se ancora **zero**: si mostra un messaggio che suggerisce il termine inglese e invita a cercare per nome del set. **Non** si afferma mai che il prodotto "non è disponibile", e **non** si mostrano prodotti casuali/non correlati per riempire la lista (rumore peggiore del vuoto).

Ogni risultato dichiara la lingua del catalogo (EN) così è chiaro perché il nome non è in italiano.

Il glossario (`sealedGlossary.ts`) sfrutta la composizionalità dei nomi (`[Set] + [Tipo prodotto]`): i set li dà TCGdex, i tipi prodotto sono un vocabolario chiuso e piccolo. È **curato a mano e non sarà mai esaustivo** — limite accettato.

## Database

**Nessuna modifica allo schema.** `language` e `marketValueUpdatedAt` esistono; la fonte del prezzo si deduce dal prefisso di `externalId` (`tcgcsv:` vs id carta). Zero migrazioni, zero rischio in deploy.

## File

- **Nuovi**: `src/lib/pricing/tcgdex.ts`, `src/lib/pricing/sealedGlossary.ts`, `src/lib/fx.ts`
- **Modificati**: `src/lib/pricing/{search,index,sealed}.ts`, `src/components/{ItemFormModal,CardSearch,SealedSearch}.tsx`
- **Rimosso**: `src/lib/pricing/pokemonTcgIo.ts` (+ test associato)

## Test

Funzioni pure testabili senza rete: normalizzazione query, glossario IT→EN, conversione valuta, parsing risposte. Le chiamate API si testano con `fetch` mockato, come già fa `pricing/__tests__/pokemonTcgIo.test.ts`.

Verifica per task: `npx tsc --noEmit` + `npm run lint` + `npm test`; `npm run build` dove indicato. L'auth e il DB non sono testabili in locale (`.env` locale usa SQLite).

## Rischi

| Rischio | Mitigazione |
|---|---|
| Rate limit TCGdex non documentato | Cache + backoff; nessun burst |
| Glossario incompleto | Fallback fuzzy + risultati EN sempre mostrati |
| Prezzo sigillati IT/JP fuorviante | Etichetta esplicita + override manuale |
| Copertura prezzi TCGdex stimata su 12 carte | Verificare su un campione reale in fase di implementazione |

## Fuori scope

Multi-gioco (Magic, Yu-Gi-Oh…), prezzi Cardmarket ufficiali per sigillati (API a pagamento), data di acquisto (campo inesistente a DB).
