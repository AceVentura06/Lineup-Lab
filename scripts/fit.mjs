// Fits the usage model: one ridge regression per position (QB, RB, WR, TE) on 2023-2025, predicting a
// player's next-game fantasy points (ESPN default PPR) from his usage in earlier games that season.
// Run by hand once per offseason:  node scripts/fit.mjs [--cache <folder>]
// Writes assets/model/coefficients.json. Node only, no packages. --cache keeps the downloads for a re-run.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseCSV } from './adv.mjs';
import { prepare, inputsAsOf, POS, FEATURES } from './usage.mjs';

const NFLV = 'https://github.com/nflverse/nflverse-data/releases/download';
const EP = 'https://github.com/ffverse/ffopportunity/releases/download/latest-data';
export const TRAIN = [2023, 2024, 2025];
const LAMBDAS = [1, 3, 10, 30, 100, 300, 1000, 3000];
const MIN_XFP = 4;   // train on fantasy-relevant players: at least 4 expected points a game so far

// Download a file as text (gunzipping .gz), optionally keeping a copy in a cache folder.
export function loader(cache) {
  return async url => {
    const file = cache && new URL(url.split('/').pop(), new URL(cache.replace(/\/?$/, '/'), `file://${process.cwd()}/`));
    let buf = file && await readFile(file).catch(() => null);
    if (!buf) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      buf = Buffer.from(await r.arrayBuffer());
      if (file) { await mkdir(new URL('.', file), { recursive: true }); await writeFile(file, buf); }
    }
    return (url.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
  };
}

// One season, ready for inputsAsOf(), plus actual points: "playerId|week" -> ESPN default PPR points.
export async function loadSeason(get, season) {
  const reg = r => r.season_type === 'REG';
  const games = parseCSV(await get(`${NFLV}/schedules/games.csv`)).filter(r => r.season === String(season));
  const S = prepare({ games, ep: parseCSV(await get(`${EP}/ep_weekly_${season}.csv`)), snaps: parseCSV(await get(`${NFLV}/snap_counts/snap_counts_${season}.csv`)),
    pbp: parseCSV(await get(`${NFLV}/pbp/play_by_play_${season}.csv.gz`)).filter(reg) });
  const actual = {};
  for (const r of parseCSV(await get(`${NFLV}/stats_player/stats_player_week_${season}.csv`)).filter(reg)) actual[r.player_id + '|' + +r.week] = parseFloat(r.fantasy_points_ppr) || 0;
  return { S, actual };
}

// Training rows by position: { x: [feature values or null], y: actual points, season }
export function rowsFor({ S, actual }, season) {
  const out = Object.fromEntries(POS.map(p => [p, []]));
  for (let w = 2; w <= 18; w++) for (const p of inputsAsOf(S, w)) {
    const y = actual[p.id + '|' + w];
    if (y == null || p.x.xfpS < MIN_XFP) continue;     // did not play, or not fantasy-relevant
    out[p.pos].push({ x: FEATURES[p.pos].map(f => p.x[f]), y, season });
  }
  return out;
}

// Ridge regression on standardized inputs. Missing inputs sit at the average (zero after standardizing).
export function ridge(rows, lambda) {
  const k = rows[0].x.length, means = [], scales = [];
  for (let j = 0; j < k; j++) {
    const v = rows.map(r => r.x[j]).filter(x => x != null), m = v.reduce((a, b) => a + b, 0) / v.length;
    means.push(m); scales.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1);
  }
  const z = r => r.x.map((x, j) => x == null ? 0 : (x - means[j]) / scales[j]);
  const intercept = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  const A = Array.from({ length: k }, (_, i) => { const row = Array(k + 1).fill(0); row[i] = lambda; return row; });
  for (const r of rows) { const zr = z(r), y = r.y - intercept; for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) A[a][b] += zr[a] * zr[b]; A[a][k] += zr[a] * y; } }
  for (let i = 0; i < k; i++) {                          // Gauss-Jordan elimination with pivoting
    let p = i; for (let j = i + 1; j < k; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
    [A[i], A[p]] = [A[p], A[i]];
    for (let j = 0; j < k; j++) if (j !== i) { const f = A[j][i] / A[i][i]; for (let c = i; c <= k; c++) A[j][c] -= f * A[i][c]; }
  }
  const weights = A.map((r, i) => r[k] / r[i]);
  const predict = x => Math.max(0, intercept + x.reduce((t, v, j) => t + (v == null ? 0 : weights[j] * (v - means[j]) / scales[j]), 0));
  return { means, scales, weights, intercept, predict };
}
const mae = (m, rows) => rows.reduce((a, r) => a + Math.abs(m.predict(r.x) - r.y), 0) / rows.length;

// Penalty strength by leave-one-season-out: fit on two seasons, measure the miss on the third.
export function chooseLambda(rows) {
  const seasons = [...new Set(rows.map(r => r.season))];
  const cv = LAMBDAS.map(l => seasons.reduce((t, s) => { const held = rows.filter(r => r.season === s); return t + mae(ridge(rows.filter(r => r.season !== s), l), held) * held.length; }, 0) / rows.length);
  const i = cv.indexOf(Math.min(...cv));
  return { lambda: LAMBDAS[i], cvMiss: cv[i], cv: Object.fromEntries(LAMBDAS.map((l, j) => [l, +cv[j].toFixed(3)])) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ci = process.argv.indexOf('--cache'), get = loader(ci > 0 ? process.argv[ci + 1] : null);
  const rows = Object.fromEntries(POS.map(p => [p, []]));
  for (const season of TRAIN) {
    const r = rowsFor(await loadSeason(get, season), season);
    for (const p of POS) rows[p].push(...r[p]);
    console.log(`${season}: ${POS.map(p => `${p} ${r[p].length}`).join(', ')} player-games`);
  }
  const r4 = v => +v.toFixed(4), positions = {};
  for (const p of POS) {
    const c = chooseLambda(rows[p]), m = ridge(rows[p], c.lambda);
    positions[p] = { features: FEATURES[p], means: m.means.map(r4), scales: m.scales.map(r4), weights: m.weights.map(r4), intercept: r4(m.intercept),
      lambda: c.lambda, rows: rows[p].length, cvMiss: +c.cvMiss.toFixed(3) };
    console.log(`${p}: ${rows[p].length} rows, penalty ${c.lambda}, held-out season miss ${c.cvMiss.toFixed(3)}  (by penalty: ${JSON.stringify(c.cv)})`);
    console.log('   ' + FEATURES[p].map((f, i) => `${f} ${m.weights[i].toFixed(2)}`).join('  '));
  }
  const out = { model: 'usage ridge, per position', target: 'next-game fantasy points, ESPN default PPR', trained: TRAIN, fitted: new Date().toISOString().slice(0, 10),
    minExpectedPoints: MIN_XFP, positions };
  await writeFile(new URL('../assets/model/coefficients.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  console.log('Wrote assets/model/coefficients.json');
}
