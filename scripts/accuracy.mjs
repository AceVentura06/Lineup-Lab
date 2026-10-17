// Saves each week's pregame projections and grades them against what players actually scored.
import { nkey } from './adv.mjs';

export const SOURCES = { lab: 'Ace Lineup Lab', mod: 'Model alone', espn: 'ESPN', sleeper: 'Sleeper', cbs: 'CBS Sports', fp: 'FantasyPros' };
const SC = ['ppr', 'half', 'std'];
// 12-team starting spots: a "start" is a top-N finish at the position
const STARTERS = { QB: 12, RB: 24, WR: 30, TE: 12, K: 12, DST: 12 };

// Keep a player's last projection from before his game kicked off; keep updating everyone else.
export function mergeSnapshot(prev, cur, now = Date.now()) {
  const players = { ...(prev?.players || {}) };
  for (const [k, p] of Object.entries(cur.players)) {
    const old = players[k];
    if (old && old.k && now >= old.k) continue;          // frozen at kickoff
    if (!old && p.k && now >= p.k) continue;             // first seen after kickoff: don't trust it
    players[k] = p;
  }
  return { week: cur.week, backfilled: prev?.backfilled || false, players };
}

// Actual fantasy points by week from the season stats file: key -> { week: [ppr, half, std] }
export function actualsFrom(STATS) {
  const F = STATS.fields, iN = F.indexOf('name'), iP = F.indexOf('pos'), iW = F.indexOf('weeks');
  const out = {};
  for (const line of String(STATS.rows || '').split('\n')) {
    if (!line) continue;
    const c = line.split('|'); const pos = c[iP];
    const key = nkey(c[iN], pos);
    const m = out[key] = {};
    c[iW].split(';').forEach((w, i) => {
      if (!w || w === '-') return;
      const [ppr, rec] = w.split(':').map(Number);
      if (!Number.isFinite(ppr)) return;
      m[i + 1] = [ppr, ppr - 0.5 * (rec || 0), ppr - (rec || 0)];
    });
  }
  return out;
}

const r2 = v => Math.round(v * 100) / 100;
function ranks(vals) { // average ranks, 1 = highest
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const r = Array(vals.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
function spearman(a, b) {
  const n = a.length; if (n < 4) return null;
  const ra = ranks(a), rb = ranks(b), ma = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

// Grade one week. snap: saved projections; act: actuals map; w: week number.
export function gradeWeek(snap, act, w) {
  const players = Object.entries(snap.players).map(([id, p]) => ({ ...p, id, a: act[id]?.[w] })).filter(p => p.a);
  if (!players.length) return null;
  // sources present for most players that week (a source that only covers a handful would skew the pool)
  const cover = {};
  for (const p of players) for (const s in p.src) if (p.src[s]?.[0] != null) cover[s] = (cover[s] || 0) + 1;
  const srcs = Object.keys(SOURCES).filter(s => (cover[s] || 0) >= players.length * 0.5);
  // shared pool: every graded source projected him, and he was fantasy-relevant (avg PPR projection 5+, any K/DST)
  const pool = players.filter(p => srcs.every(s => p.src[s]?.[0] != null) &&
    (p.pos === 'K' || p.pos === 'DST' || srcs.reduce((t, s) => t + p.src[s][0], 0) / srcs.length >= 5));
  const out = { srcs, n: pool.length, backfilled: !!snap.backfilled, m: {}, miss: {}, best: {} };
  SC.forEach((sc, i) => {
    out.m[sc] = {}; out.miss[sc] = {}; out.best[sc] = {};
    for (const s of srcs) {
      let ae = 0; const pos = {}; let hit = 0, tot = 0, rs = 0, rn = 0;
      for (const p of pool) { const e = Math.abs(p.src[s][i] - p.a[i]); ae += e; const q = pos[p.pos] = pos[p.pos] || [0, 0]; q[0] += e; q[1]++; }
      for (const P of Object.keys(STARTERS)) {
        const g = pool.filter(p => p.pos === P); if (g.length < 6) continue;
        const N = Math.min(STARTERS[P], Math.floor(g.length / 2));
        const top = (f) => new Set([...g].sort((x, y) => f(y) - f(x)).slice(0, N).map(p => p.id));
        const ps = top(p => p.src[s][i]), as = top(p => p.a[i]);
        for (const k of ps) if (as.has(k)) hit++;
        tot += N;
        const rho = spearman(g.map(p => p.src[s][i]), g.map(p => p.a[i]));
        if (rho != null) { rs += rho * g.length; rn += g.length; }
      }
      out.m[sc][s] = { ae: r2(ae), n: pool.length, hit, tot, rho: rn ? r2(rs / rn) : null,
        pos: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, [r2(v[0]), v[1]]])) };
      const row = p => [p.n, p.pos, p.tm, p.src[s][i], r2(p.a[i])];
      out.miss[sc][s] = [...pool].sort((x, y) => Math.abs(y.src[s][i] - y.a[i]) - Math.abs(x.src[s][i] - x.a[i])).slice(0, 5).map(row);
      out.best[sc][s] = pool.filter(p => p.a[i] >= 15).sort((x, y) => Math.abs(x.src[s][i] - x.a[i]) - Math.abs(y.src[s][i] - y.a[i])).slice(0, 3).map(row);
    }
  });
  return out;
}

// Grade every finished week. history: { week: snapshot }
export function gradeAll(history, STATS, currentWeek, season) {
  const act = actualsFrom(STATS);
  const weeks = {};
  for (const [w, snap] of Object.entries(history)) {
    if (+w >= currentWeek) continue;           // only weeks whose games are all done
    const g = gradeWeek(snap, act, +w);
    if (g && g.n) weeks[w] = g;
  }
  return { season, sources: SOURCES, starters: STARTERS, weeks };
}

// How much to trust the sites vs. our model, tuned from every graded week, by position.
// For each position, tries site weights 0%–100% in 5% steps and keeps the one whose blend
// would have missed actual PPR points by the least, on fantasy-relevant players (avg projection
// 5+, any K/DST). Small samples are pulled toward the default so a lucky week can't swing it.
export const BLEND_SITES = ['espn', 'sleeper', 'cbs', 'fp'];
export function tuneBlend(history, STATS, currentWeek, def = 0.5, pull = 30) {
  const act = actualsFrom(STATS), by = {}, weeks = new Set();
  for (const [w, snap] of Object.entries(history)) {
    if (+w >= currentWeek) continue;
    for (const [id, p] of Object.entries(snap.players || {})) {
      const a = act[id]?.[+w]?.[0], m = p.src?.mod?.[0];
      if (a == null || m == null) continue;
      const sv = BLEND_SITES.map(s => p.src[s]?.[0]).filter(v => v != null);
      if (!sv.length) continue;
      const s = sv.reduce((x, y) => x + y, 0) / sv.length;
      if (p.pos !== 'K' && p.pos !== 'DST' && (m + s) / 2 < 5) continue;
      (by[p.pos] = by[p.pos] || []).push([m, s, a]); weeks.add(+w);
    }
  }
  const pos = {};
  for (const [P, rows] of Object.entries(by)) {
    if (rows.length < 30) continue;
    const mae = w => rows.reduce((e, [m, s, a]) => e + Math.abs((1 - w) * m + w * s - a), 0) / rows.length;
    let best = 0, bestE = Infinity;
    for (let i = 0; i <= 20; i++) { const w = i / 20, e = mae(w); if (e < bestE - 1e-9) { best = w; bestE = e; } }
    const w = Math.round((rows.length * best + pull * def) / (rows.length + pull) * 100) / 100;
    pos[P] = { w, n: rows.length, mae: r2(mae(w)), sites: r2(mae(1)), model: r2(mae(0)), even: r2(mae(0.5)) };
  }
  return { weeks: [...weeks].sort((a, b) => a - b), def, pos };
}
