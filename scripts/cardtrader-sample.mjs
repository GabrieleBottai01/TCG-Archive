// Dev-only. Fetches a real Cardtrader sample to build/validate the client against.
// Reads CARDTRADER_JWT from the environment; never inline or print the token.
// Run: node --env-file=.env scripts/cardtrader-sample.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const JWT = process.env.CARDTRADER_JWT
if (!JWT) {
  console.error('Set CARDTRADER_JWT in your environment first.')
  process.exit(1)
}
const BASE = 'https://api.cardtrader.com/api/v2'
const H = { Authorization: `Bearer ${JWT}` }
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

const info = await get('/info') // auth test
const games = await get('/games')
const gameList = Array.isArray(games) ? games : (games.array ?? [])
const pokemon = gameList.find((g) => /pok[eé]mon/i.test(g.name))
const gameId = pokemon?.id
const allExpansions = await get('/expansions')
const expansions = Array.isArray(allExpansions)
  ? allExpansions.filter((e) => e.game_id === gameId)
  : []
// Pick an expansion likely to hold sealed (Paldean Fates if present, else the first).
const exp = expansions.find((e) => /paldean fates/i.test(e.name)) ?? expansions[0]
const blueprints = exp ? await get(`/blueprints/export?expansion_id=${exp.id}`) : []
// A sealed-looking blueprint (name mentions a sealed product type), else the first.
const sealed =
  blueprints.find((b) => /(elite trainer box|booster box|booster bundle|collection)/i.test(b.name)) ??
  blueprints[0]
const marketplace = sealed ? await get(`/marketplace/products?blueprint_id=${sealed.id}`) : {}

mkdirSync('docs/reference', { recursive: true })
writeFileSync(
  'docs/reference/cardtrader-sample.json',
  JSON.stringify(
    {
      info,
      gameId,
      expansionsCount: expansions.length,
      expansionsSample: expansions.slice(0, 20),
      chosenExpansion: exp,
      blueprintsCount: blueprints.length,
      blueprintsSample: blueprints.slice(0, 40),
      chosenBlueprint: sealed,
      marketplace,
    },
    null,
    2,
  ),
)
console.log(
  `Wrote docs/reference/cardtrader-sample.json — pokemon game_id: ${gameId}, expansions: ${expansions.length}, blueprints: ${blueprints.length}, chosen blueprint id: ${sealed?.id}`,
)
