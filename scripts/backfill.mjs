// Run once (re-run any time): rebuild earlier weeks' pregame projections for Sleeper and the model,
// using only what was known before each week's games. Usage: node scripts/backfill.mjs 2 5
// Weeks saved live are skipped unless you add --force.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { build } from './build.mjs';
import { advAsOf } from './adv.mjs';
import { projectAll } from './model.mjs';

const HIST = new URL('../data/history/', import.meta.url);
const UA = 'lineup-lab-updater (personal fantasy football site)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, headers = {}) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
    catch (e) { if (i >= 2) throw e; await sleep(3000 * (i + 1)); }
  }
}
const fetchJson = async (u, h) => (await get(u, { Accept: 'application/json', ...h })).json();
const fetchText = async u => (await get(u)).text();

const meta = JSON.parse(await readFile(new URL('../data/meta.json', import.meta.url), 'utf8'));
const season = meta.season;
const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a));
const from = +(nums[0] || 2), to = +(nums[1] || meta.week - 1);
await mkdir(HIST, { recursive: true });
for (let w = from; w <= to; w++) {
  // never replace projections that were saved live before the games: those cannot be rebuilt
  const file = new URL(`${season}-w${String(w).padStart(2, '0')}.json`, HIST);
  const old = await readFile(file, 'utf8').then(JSON.parse, () => null);
  if (old && !old.backfilled && !process.argv.includes('--force')) { console.log(`Week ${w}: skipped, it holds live pregame projections (add --force to overwrite)`); continue; }
  const d = await build(fetchJson, { asOfWeek: w, season, log: () => {} });
  const ADV_DATA = await advAsOf({ fetchText, season, week: w });
  const snap = projectAll({ SITE_DATA: d.sites, STATS_DATA: d.stats, CTX_DATA: d.ctx, ADV_DATA });
  // only the sources that can be rebuilt honestly: the model (blended with Sleeper only) and Sleeper
  for (const p of Object.values(snap.players)) for (const s of Object.keys(p.src)) if (!['lab', 'mod', 'sleeper'].includes(s)) delete p.src[s];
  snap.backfilled = true;
  await writeFile(file, JSON.stringify(snap));
  const c = Object.values(snap.players);
  console.log(`Week ${w}: ${c.length} players, model ${c.filter(p => p.src.mod).length}, Sleeper ${c.filter(p => p.src.sleeper).length}`);
}
