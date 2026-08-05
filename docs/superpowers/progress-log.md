# TCG Archive — Progress Log

Durable, repo-committed record of every substantial change, so no progress is lost across
sessions and past mistakes aren't repeated. Newest entries at the top. Append an entry whenever a
task / commit / deploy lands. (Ephemeral SDD ledgers under `.superpowers/sdd/` are NOT a substitute.)

---

## 2026-07-27 — F-cardmarket: automatic Cardmarket source for sealed (SHIPPED + DEPLOYED)

**Arc:** "Collectr, done better" → sub-project F-cardmarket (follows F-core).
**Spec:** `docs/superpowers/specs/2026-07-27-cardmarket-sealed-source-design.md`
**Plan:** `docs/superpowers/plans/2026-07-27-cardmarket-sealed-source.md`

**What & why:** Sealed products Cardtrader can't map fell back to eBay, which underpriced some
(confirmed: Pokémon GO ETB €39,58 eBay vs ~€97/€103 Cardmarket). Gabriele wanted a FULLY AUTOMATIC
Cardmarket source (rejected any manual entry). Solution: Cardmarket's PUBLIC daily S3 files
(no key/login/scraping). Chain is now **Cardtrader → Cardmarket → eBay**; value = `trend` (fallback
avg→low, `>0` guard) to avoid outlier lows.

**Key facts (verified live against S3):**
- Pokémon = Cardmarket game id `6`.
- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
- Catalogue (sealed): `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json`
- Both 200 with a browser UA, no auth (only the HTML pages 403 to bots).
- Anchor: Pokémon GO ETB → idProduct 653700 → trend €103,38.

**Commits (merged to main via `edd2649`):**
- `2b6a1dd` field/type `cardmarketProductId` on Item/PriceInput/PriceResult
- `72b0c31` Cardmarket pure core (trend price + name→idProduct resolver)
- `5f81423` fetch+cache layer (single-flight S3 downloads)
- `424076f` sealedPrice chain Cardtrader→Cardmarket→eBay (also mocked cardmarket in tcgcsvProvider.test.ts to stop a real S3 call)
- `d676823` Cardmarket chip + persist cardmarketProductId through refresh/estimate/modal
- `c1bb563` live-check script `scripts/cardmarket-live-check.ts`
- `00208ac` cardmarketSealedEur rejects explicit 0 prices (final-review fix)
- `5c20bf7` docs: clarify DB deploy (netlify `prisma db push` runs pre-build)

**Verification:** 294 tests green, tsc + lint clean; 6 SDD tasks each passed impl + 2-stage review;
opus final review "ready to merge". Deploy `edd2649` on Netlify = `ready` (the build's `prisma db push`
added the nullable `Item.cardmarketProductId` column to prod Neon). Prod healthy (site 307→login,
`/api/prices/refresh` 401 gated).

**⚠️ OPEN / next session:**
- Authenticated prod live-verify: confirm the GO ETB item ACTUALLY reprices €39,58 → ~€103 with a
  "Cardmarket" chip on Gabriele's `/collezione` (needs his logged-in session or driving his Chrome).
- Enrich `scripts/cardmarket-live-check.ts` `NAMES` with Gabriele's OTHER Cardtrader-unmapped product
  names (currently only 2 anchors).

**Known limitation:** catalogue names are English (Phase 2A) → maps the English Cardmarket product;
Italian/JP-language sealed are separate idProducts, out of scope.
