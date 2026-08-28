# TCG Archive

A web app to manage a **trading-card collection** — sealed products, raw cards, and graded slabs — with
**automatic European market pricing** and a **value-over-time** view of the whole portfolio.

For every item you record quantity, purchase price, and condition/grade. TCG Archive then fetches a
trustworthy EU market value automatically, shows the gain/loss per item and the overall balance of the
collection, and tracks how that balance moves day by day.

> Built for Pokémon TCG, with an emphasis on **honest, source-labelled prices** — no guessed numbers
> silently inflating or deflating your collection's worth.

**Live app:** https://tcgarchive.netlify.app *(personal instance — sign-in required)*

---

## Features

- **Collection management** — add sealed products, raw Pokémon cards, and graded slabs; track quantity,
  purchase price, condition, and grading company/grade.
- **Automatic EU market pricing**, with the source shown on every item so you know how much to trust it:
  - **Sealed products:** a resilient chain — **Cardtrader** (lowest current EU listing) → **Cardmarket**
    (public daily price-guide *trend*) → **eBay** EU median as a last resort.
  - **Raw Pokémon cards:** **Cardmarket** EUR price via [TCGdex](https://tcgdex.dev).
  - **Graded slabs:** manual (their value diverges too much from ungraded market data to auto-price).
- **Dashboard** — cost vs. value per item, total collection balance, gains/losses paired with their
  percentage, plus filters and grouping for custom analysis.
- **Portfolio chart** — the collection's value over time, drawn from **immutable daily snapshots** so the
  historical curve is never retroactively rewritten when prices change.
- **EU price observatory** — a background reference learned from eBay listings, shown as a hedged
  secondary line. It is **informational only** and never overrides the stored value (a hard-won design
  decision after early versions let confidently-wrong lows drag the balance down).
- **Bilingual** — Italian and English UI; search works in Italian while the catalogue stores English names
  for reliable price matching.
- **Responsive** — desktop, tablet, and phone.

### Pricing philosophy

All pricing sources are **free and keyless**. Cardmarket data comes from its **public daily download
files** (price guide + product catalogue) — no API key, no login, no scraping. Every automatic value is
labelled with its origin (Cardtrader / Cardmarket / eBay estimate / manual) so a figure is never more
confident than the data behind it.

---

## Tech stack

- **Next.js 16** (App Router, TypeScript) — frontend + API routes
- **React 19**, **Tailwind CSS 4** (mobile-first)
- **Prisma 7** on **Postgres** ([Neon](https://neon.tech), serverless driver)
- **Auth.js v5** (NextAuth) — email + password and Google sign-in, JWT sessions
- **Vitest** (unit) + **Playwright** (e2e)
- Deployed on **Netlify**, including a scheduled function for the daily price observatory

---

## Getting started

Requires **Node.js 20+** and a **Postgres** database (a free [Neon](https://neon.tech) project works well).

```bash
# 1. Install dependencies (postinstall generates the Prisma client)
npm install

# 2. Configure environment variables
cp .env.example .env
#   DATABASE_URL  = Neon POOLED connection string (host contains "-pooler") — used by the app at runtime
#   DIRECT_URL    = Neon DIRECT connection string (no "-pooler") — used by the Prisma CLI (db push / seed)
#   AUTH_SECRET   = generate with `openssl rand -base64 32`
#   AUTH_URL      = http://localhost:3000 in local dev
#   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET = Google OAuth credentials (optional:
#     without them, email + password sign-in still works)
#   The pricing sources (TCGdex, Cardtrader, Cardmarket, eBay) need no API key.

# 3. Create the schema on the database
npm run db:push

# 4. Run the dev server
npm run dev            # http://localhost:3000
```

### Useful scripts

```bash
npm run dev        # start the dev server
npm run build      # production build
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright)
npm run lint       # ESLint
npm run db:push    # sync the Prisma schema to the database
```

---

## Project structure

```
src/
  app/            Next.js App Router — pages (/collezione, /login, …) and API routes (/api/*)
  components/     UI — Dashboard, CollectionView, PortfolioChart, item modal, …
  lib/
    pricing/      pricing providers: cardtrader, cardmarket, tcgdex, eBay estimate, chain orchestration
    snapshots/    immutable daily portfolio snapshots (the value-over-time curve)
    observatory/  EU price reference learned from eBay (informational only)
prisma/           schema (db push workflow; no migrations directory)
netlify/          scheduled function for the daily observatory run
docs/             design specs, implementation plans, and the progress log
```

---

## Notes

- The app is a **personal collection tracker** deployed as a single-user instance; the code is open for
  anyone to read, learn from, or self-host.
- Pricing accuracy is treated as a first-class concern: see the design specs and plans under
  `docs/superpowers/` for the reasoning behind the sealed-pricing chain and the observatory's demotion.
