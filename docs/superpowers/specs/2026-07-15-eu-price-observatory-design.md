# Osservatorio prezzi EU per i sigillati — Design

**Data:** 2026-07-15
**Stato:** approvato dall'utente · **bloccato su una verifica legale** (vedi Rischi)
**Contesto:** funzione dentro TCG Archive (non un'app separata)

## Il problema

I sigillati della collezione sono valorizzati con il prezzo TCGplayer USA convertito in EUR — misurato a **~2,5–3× di scarto** dai prezzi Cardmarket europei. Non esiste alcuna fonte gratuita di prezzi EU per i sigillati: TCGdex copre solo le carte, tcgcsv è il catalogo USA. Il numero mostrato oggi è una stima etichettata, ma resta sbagliata.

L'idea di partenza dell'utente era un tool di **arbitraggio** che confronta i prezzi tra piattaforme e allerta sugli affari. Analisi:

- L'arbitraggio richiede **annunci**, non prezzi aggregati. Le due fonti disponibili sono aggregati giornalieri.
- Il delta USA↔EU **non è un'inefficienza**: è struttura di mercato (spedizione $40–60 per un box, IVA import 22%, dazi, 2–4 settimane). Un alert su quel delta suonerebbe su ogni prodotto ogni giorno, sempre a vuoto.
- Il vero arbitraggio è **dentro** un mercato (un box a €60 mentre gli altri stanno a €95), e si calcola da una sola fonte.
- **Ma senza un riferimento EU affidabile, "sotto il valore di mercato" non è calcolabile.** Il riferimento viene prima dell'alert.

Questa spec costruisce **il riferimento**. Gli alert sono un progetto successivo che dipende da questo.

## Decisioni prese (con l'utente)

| Tema | Decisione |
|---|---|
| Collocazione | Funzione dentro TCG Archive |
| Scope v1 | **Riferimento prezzi prima**, alert dopo |
| Come si costruisce | Osservatorio: annunci osservati + sparizione + calo di quantità |
| Fonte | eBay Browse API (gratuita, legittima, annunci live) |
| Marketplace | **eBay.it e eBay.de** |
| Lingua prodotto | **Solo IT / EN / JA** — i prodotti in tedesco vanno esclusi anche quando trovati su .de |
| Titoli ambigui | **Scartare nel dubbio** — non entrano nella mediana |
| Watchlist | I sigillati già presenti nella collezione |
| Sostituzione stima USA | Solo quando il riferimento è `STRONG` |
| Infrastruttura | Job giornaliero approvato (costo verificato, vedi sotto) |

## Costi (verificati 2026-07-15)

| Piattaforma | Fatto | Impatto |
|---|---|---|
| **Netlify** free | 300 crediti/mese **condivisi**; ogni deploy = 15 crediti (→ **~20 deploy/mese**, ecco il limite reale dell'utente). Scheduled function: 10 crediti/GB-ora, timeout **30s** | Il job costa **~0,2 crediti/mese** = 1/75 di un deploy. Irrilevante. ⚠️ Se l'account è anteriore a set-2025 potrebbe essere su piano legacy: **da controllare in dashboard** |
| **Neon** free | **0,5 GB con stop netto** (blocca le scritture, non addebita). 100 CU-ore/mese, autosuspend 5 min | La compute è irrilevante. **Lo spazio è il vincolo vero** → architettura roll-up |
| **eBay Browse API** | Gratuita, ~5.000 chiamate/giorno, annunci **attivi**. ⚠️ **Non verificato direttamente**: developer.ebay.com blocca l'accesso automatico (6 tentativi falliti). Tutti i dati eBay vengono da frammenti di ricerca | ~100 chiamate/giorno: ampio margine |

Il timeout di 30s della scheduled function è un vincolo di progetto reale: con ~100 prodotti da interrogare serve concorrenza limitata, o una background function.

## Architettura

### Roll-up: il grezzo muore, l'imparato resta

Due tabelle con vite diverse. Serve a due scopi insieme: rispettare l'eventuale limite di retention di eBay **e** stare nel mezzo giga di Neon.

```prisma
model EbayObservation {          // grezzo — potato oltre i 30 giorni
  id           String    @id @default(cuid())
  productKey   String              // "tcgcsv:23234:517001"
  ebayItemId   String
  marketplace  String              // EBAY_IT | EBAY_DE
  lang         String              // IT | EN | JA — lingua del PRODOTTO, non del sito
  priceEur     Float
  quantity     Int?                // il calo tra due osservazioni = vendita confermata
  firstSeenAt  DateTime
  lastSeenAt   DateTime
  goneAt       DateTime?
  confidence   Float
  @@unique([ebayItemId, marketplace])
  @@index([productKey, lang, lastSeenAt])
}

model PriceReference {            // derivato dell'utente — permanente, pochi MB/anno
  id             String   @id @default(cuid())
  productKey     String
  lang           String
  day            DateTime @db.Date
  medianEur      Float?
  sampleSize     Int
  confirmedSales Int              // da calo di quantità
  quickSales     Int              // spariti in <48h
  strength       String           // STRONG | WEAK | NONE
  @@unique([productKey, lang, day])
}
```

Il riferimento è **per prodotto E per lingua**: una ETB italiana e una inglese sono due prezzi diversi, non due campioni dello stesso.

### I tre segnali, in ordine di forza

| Segnale | Significato | Forza |
|---|---|---|
| **Quantità calata** (3 → 2 disponibili) | qualcuno **ha comprato** a quel prezzo esatto | vendita confermata |
| **Sparito in <48h** | quasi certamente venduto (le inserzioni scadono a 30gg) | vendita probabile |
| **Annuncio attivo** | quanto il venditore *spera* di ottenere | solo prezzo richiesto |

Il calo di quantità è il fatto che rende superflua la Marketplace Insights API (a rilascio limitato): è un prezzo di vendita reale, ottenuto gratis dalla sola Browse API.

`strength`:
- `STRONG` → ≥3 vendite confermate o rapide negli ultimi 90 giorni
- `WEAK` → solo prezzi richiesti, o campione < 3
- `NONE` → nessun dato utile

### Il job giornaliero

1. Watchlist: `SELECT DISTINCT externalId, language FROM Item WHERE itemType='SEALED' AND externalId LIKE 'tcgcsv:%'`
2. Per ogni prodotto: Browse API su `EBAY_IT` e `EBAY_DE`
3. Matching dei titoli (sotto) → gli incerti si scartano
4. Upsert osservazioni: aggiorna `lastSeenAt`; se `quantity` è calata → registra vendita confermata
5. `goneAt` per gli annunci non più visti
6. Ricalcola `PriceReference` del giorno per ogni (prodotto, lingua)
7. Cancella le osservazioni con `lastSeenAt` oltre i 30 giorni

### Il matcher — dove il progetto vive o muore

Un annuncio eBay si chiama *"Pokemon 151 Elite Trainer Box ITA SIGILLATA Scarlatto Violetto NUOVA"*, non `tcgcsv:23234:517001`. La query si costruisce dal nome tcgcsv, tradotta con il **glossario IT→EN già esistente** (`src/lib/pricing/sealedGlossary.ts`).

Un titolo entra nella mediana solo se **tutti** i token essenziali del prodotto sono presenti **e nessuno** di questi compare:

| Esclusione | Perché |
|---|---|
| `pokemon center` / `pokémon center` | versione esclusiva, prezzo anche 3× |
| `vuota` `vuoto` `empty` `solo scatola` `nur box` | **box vuoto da collezione** — farebbe credere che una ETB valga €15 |
| `proxy` `custom` `repack` `fake` | non è il prodotto |
| `lotto` `bundle di` `stock` | lotti multipli: il prezzo non è per pezzo |

**La lingua del prodotto non è la lingua del sito.** Regola:

- Marcatori espliciti: `ITA`/`italiano` → IT · `ENG`/`English`/`Englisch` → EN · `JAP`/`giapponese`/`japanese` → JA · `DE`/`Deutsch`/`tedesco` → **DE = scartare**
- **Senza marcatore, vale la lingua di default del marketplace**: nessun marcatore su `EBAY_IT` → IT; nessun marcatore su `EBAY_DE` → **DE → scartare**. Un venditore tedesco che elenca un prodotto tedesco non scrive la lingua: è ovvia per lui.
- Conseguenza: su `EBAY_DE` un prodotto entra **solo con marcatore esplicito** IT/EN/JA. È il motivo per cui .de aggiunge volume senza contaminare.
- La lingua rilevata deve combaciare con `Item.language`.

`confidence` = f(token del prodotto trovati, assenza di esclusioni, lingua determinata). Sotto soglia → scartato, punto.

### Interfaccia

`src/lib/priceSource.ts` guadagna un quarto tipo: `euReference`. Il chip dichiara la propria solidità invece di dare un numero e basta:

- 🟢 `Riferimento EU €95,00 · 12 osservazioni · 3 vendite confermate` (STRONG)
- 🟡 `Riferimento EU ~€95,00 · 4 osservazioni, nessuna vendita confermata — dato debole` (WEAK)
- ⚪️ dati insufficienti → resta la stima USA, etichettata come oggi

Quando `STRONG`, il riferimento EU **sostituisce** la stima USA nel valore dell'articolo e quindi nel saldo della collezione.

## Fuori scope v1

Alert e notifiche · prodotti non posseduti · Cardmarket · carte singole (hanno già Cardmarket EUR via TCGdex) · rilevamento truffe/falsi.

## Rischi

| Rischio | Stato |
|---|---|
| 🔴 **ToS eBay: retention dei dati a 30 giorni** | **Bloccante, da confermare dall'utente** appena l'account dev è attivo. Il roll-up dovrebbe reggere (gli aggregati sono dato derivato, non dati eBay) ma **la clausola non è stata letta**: developer.ebay.com blocca l'accesso automatico |
| ⚠️ Tutti i dati eBay non verificati | Rate limit, `EBAY_IT` come marketplace valido, gratuità: tutto da frammenti di ricerca. **Da confermare col primo accesso reale** |
| Volume insufficiente su eBay | Molti prodotti non avranno mai abbastanza annunci → `NONE`, e il chip lo dice. Non si inventa un numero |
| Il matcher sbaglia | Mitigato scartando nel dubbio. **Va testato su titoli eBay reali**, non su mock: stamattina i mock hanno nascosto lo stesso bug tre volte |
| Rodaggio 4–8 settimane | Dichiarato in UI, non nascosto |
| Timeout 30s della scheduled function | Concorrenza limitata, o background function se serve |
| ⚠️ Piano Netlify legacy | Se l'account è pre-set-2025 il modello a crediti non vale: **da controllare in dashboard** |

## Perché questo vale la pena

Il motore che serve all'arbitraggio **è lo stesso** che ripara la valutazione della collezione. Non sono due progetti: sono lo stesso dato. E spiega perché questi strumenti "sono riservati a pochi tool privati a pagamento" — non perché il codice sia difficile, ma perché **quel dato non si compra: si accumula**.
