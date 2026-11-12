// One-time fix for saved history. Weeks saved before the per-site scoring table existed converted every
// site as if it were in Sleeper scoring, so ESPN's saved numbers lost a second point per interception.
// This adds back what was wrongly removed, using the player's per-game stats through the week before
// (the same stats the page used at the time). Originals stay in git history.
//   node scripts/migrate-history.mjs            fix ESPN in every saved week that has it
//   node scripts/migrate-history.mjs espn cbs   fix the named sources
// Each file records what was fixed ("fixed": [...]), so running it twice changes nothing.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { nkey } from './adv.mjs';
import { BASELINE } from './scoring.mjs';

const HIST = new URL('../data/history/', import.meta.url);
const r1 = v => Math.round(v * 10) / 10;

// what the old conversion got wrong for one source, per game: points to add back
export function correction(source, perGame) {
  const b = BASELINE[source] || {};
  return (4 - (b.ptd ?? 4)) * perGame.ptd + (-1 - (b.int ?? -1)) * perGame.int;
}

// per-game pass TDs and interceptions through the week before `week`: key -> { ptd, int }
export function perGameBefore(STATS, week) {
  const F = STATS.fields, iN = F.indexOf('name'), iP = F.indexOf('pos'), iW = F.indexOf('weeks'), out = {};
  for (const line of String(STATS.rows || '').split('\n')) {
    if (!line) continue;
    const c = line.split('|');
    if (c[iP] === 'K' || c[iP] === 'DEF') continue;
    const played = c[iW].split(';').slice(0, week - 1).filter(w => w && w !== '-').map(w => w.split(':'));
    if (!played.length) continue;
    const sum = i => played.reduce((t, f) => t + (+f[i] || 0), 0) / played.length;
    out[nkey(c[iN], c[iP])] = { ptd: sum(2), int: sum(5) };
  }
  return out;
}

export function migrate(snap, STATS, sources) {
  const done = new Set(snap.fixed || []), todo = sources.filter(s => !done.has(s));
  const pg = perGameBefore(STATS, snap.week);
  let n = 0;
  for (const [k, p] of Object.entries(snap.players)) for (const s of todo) {
    const v = p.src[s], add = pg[k] ? correction(s, pg[k]) : 0;
    if (!v || !add || p.pos === 'K' || p.pos === 'DST') continue;
    p.src[s] = v.map(x => x == null ? x : Math.max(0, r1(x + add)));
    n++;
  }
  snap.fixed = [...done, ...todo];
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = process.argv.slice(2).length ? process.argv.slice(2) : ['espn'];
  const g = {}; new Function('g', (await readFile(new URL('../data/stats-data.js', import.meta.url), 'utf8')).replace(/^var (\w+)=/m, 'g.$1='))(g);
  const meta = JSON.parse(await readFile(new URL('../data/meta.json', import.meta.url), 'utf8'));
  for (const f of (await readdir(HIST)).filter(f => /^\d{4}-w\d{2}\.json$/.test(f)).sort()) {
    const snap = JSON.parse(await readFile(new URL(f, HIST), 'utf8'));
    if (snap.week >= meta.week) continue;   // the current week is still being saved by the updater, with the fixed conversion
    const n = migrate(snap, g.STATS_DATA, sources);
    if (n) await writeFile(new URL(f, HIST), JSON.stringify(snap));
    console.log(`${f}: ${n} values corrected (${sources.join(', ')})`);
  }
}
