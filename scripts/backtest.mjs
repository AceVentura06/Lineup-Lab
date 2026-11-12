// Walk-forward test of the usage model on this season: for each finished week, project it from earlier
// weeks only, then grade it with the site's own grader (ESPN scoring, same player pool) next to the saved
// current model, Sleeper and the site blend.  node scripts/backtest.mjs [--cache <folder>]
// Prints the tables and writes docs/BACKTEST.md.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { loader, loadSeason } from './fit.mjs';
import { shadowProjections, POS } from './usage.mjs';
import { actualsFrom, gradeWeek, tuneBlend, SOURCES } from './accuracy.mjs';

const ROOT = new URL('../', import.meta.url);
const ci = process.argv.indexOf('--cache'), get = loader(ci > 0 ? process.argv[ci + 1] : null);
const meta = JSON.parse(await readFile(new URL('data/meta.json', ROOT), 'utf8'));
const coef = JSON.parse(await readFile(new URL('assets/model/coefficients.json', ROOT), 'utf8'));
const g = {}; new Function('g', (await readFile(new URL('data/stats-data.js', ROOT), 'utf8')).replace(/^var (\w+)=/m, 'g.$1='))(g);
const act = actualsFrom(g.STATS_DATA);
const { S } = await loadSeason(get, meta.season);

const history = {};
for (const f of await readdir(new URL('data/history/', ROOT))) {
  const m = f.match(/^(\d{4})-w(\d{2})\.json$/);
  if (m && +m[1] === meta.season && +m[2] < meta.week) history[+m[2]] = JSON.parse(await readFile(new URL('data/history/' + f, ROOT), 'utf8'));
}
const weeks = Object.keys(history).map(Number).sort((a, b) => a - b);

// add the usage model to each saved week as "mod2", skill positions only
const SHOW = { mod2: 'Usage model (new)', mod: 'Current model', sleeper: 'Sleeper', lab: 'Site blend' };
const WITH = { ...SOURCES, mod2: SHOW.mod2 };
const withMod2 = {}, coverage = [];
for (const w of weeks) {
  const proj = shadowProjections(S, w, coef), players = {};
  for (const [k, p] of Object.entries(history[w].players)) if (POS.includes(p.pos)) players[k] = { ...p, src: { ...p.src, ...(proj[k] ? { mod2: proj[k] } : {}) } };
  withMod2[w] = { ...history[w], players };
  const before = gradeWeek({ ...history[w], players: Object.fromEntries(Object.entries(history[w].players).filter(([, p]) => POS.includes(p.pos))) }, act, w);
  const after = gradeWeek(withMod2[w], act, w, WITH);
  coverage.push([w, before?.n ?? 0, after?.srcs.includes('mod2') ? after.n : 0]);
}

// totals across weeks for a set of positions, from the grader's own output
function grade(hist, sources, positions) {
  const t = {};
  for (const w of weeks) {
    const snap = { ...hist[w], players: Object.fromEntries(Object.entries(hist[w].players).filter(([, p]) => positions.includes(p.pos))) };
    const r = gradeWeek(snap, act, w, sources);
    if (!r) continue;
    for (const s of r.srcs) {
      const m = r.m.ppr[s], a = t[s] = t[s] || { ae: 0, n: 0, hit: 0, tot: 0, rs: 0, rn: 0 };
      a.ae += m.ae; a.n += m.n; a.hit += m.hit; a.tot += m.tot; if (m.rho != null) { a.rs += m.rho * m.n; a.rn += m.n; }
    }
  }
  return t;
}
const f2 = v => v == null ? '-' : v.toFixed(2);
function table(hist, sources, names) {
  const groups = [...POS.map(p => [p, [p]]), ['All four', POS]];
  const res = groups.map(([label, ps]) => [label, grade(hist, sources, ps)]);
  let md = '';
  for (const [title, cell] of [['Average miss per player (points; lower is better)', a => f2(a.ae / a.n)],
    ['Rank correlation (higher is better)', a => a.rn ? f2(a.rs / a.rn) : '-'],
    ['Start-hit rate (share of true starters each source also ranked as starters)', a => a.tot ? Math.round(100 * a.hit / a.tot) + '%' : '-']]) {
    md += `\n**${title}**\n\n| Position | ${Object.values(names).join(' | ')} | Player-weeks |\n|---|${Object.keys(names).map(() => '---:').join('|')}|---:|\n`;
    for (const [label, t] of res) md += `| ${label} | ${Object.keys(names).map(s => t[s] ? cell(t[s]) : '-').join(' | ')} | ${Object.values(t)[0]?.n ?? 0} |\n`;
  }
  return { md, res: Object.fromEntries(res) };
}

const NOW = { mod: SHOW.mod, sleeper: SHOW.sleeper, lab: SHOW.lab };
const regrade = table(history, SOURCES, NOW);
const test = table(withMod2, WITH, SHOW);

// Preview only (the real refit is for the switch-on session): the site-vs-model weights the tuner
// would choose today, and what it would choose if the usage model stood in for the current one.
const swapped = Object.fromEntries(weeks.map(w => [w, { ...withMod2[w], players: Object.fromEntries(Object.entries(withMod2[w].players).filter(([, p]) => p.src.mod2).map(([k, p]) => [k, { ...p, src: { ...p.src, mod: p.src.mod2 } }])) }]));
const bNow = tuneBlend(history, g.STATS_DATA, meta.week).pos, bNew = tuneBlend(swapped, g.STATS_DATA, meta.week).pos;
const blend = `| Position | Model weight today | Model weight with the usage model | Best blend miss today | With the usage model |\n|---|---:|---:|---:|---:|\n` +
  POS.map(p => `| ${p} | ${bNow[p] ? Math.round(100 * (1 - bNow[p].w)) + '%' : '-'} | ${bNew[p] ? Math.round(100 * (1 - bNew[p].w)) + '%' : '-'} | ${bNow[p] ? f2(bNow[p].mae) : '-'} | ${bNew[p] ? f2(bNew[p].mae) : '-'} |`).join('\n');

const miss = (t, s) => t[s] ? t[s].ae / t[s].n : null;
const verdict = POS.map(p => { const a = miss(test.res[p], 'mod2'), b = miss(test.res[p], 'mod'); return `${p}: ${a == null || b == null ? 'not graded' : a < b ? `better by ${f2(b - a)}` : `WORSE by ${f2(a - b)}`}`; }).join('; ');

// every position and measure where the usage model is behind another source
const M = [['average miss', a => a.ae / a.n, -1, f2], ['rank correlation', a => a.rn ? a.rs / a.rn : null, 1, f2], ['start-hit rate', a => a.tot ? a.hit / a.tot : null, 1, v => Math.round(100 * v) + '%']];
const worse = [];
for (const [label, t] of Object.entries(test.res)) for (const [name, val, dir, fmt] of M) for (const s of ['mod', 'sleeper', 'lab']) {
  if (!t.mod2 || !t[s]) continue;
  const a = val(t.mod2), b = val(t[s]);
  if (a != null && b != null && dir * (a - b) < -1e-9) worse.push(`| ${label} | ${name} | ${fmt(a)} | ${SHOW[s]} ${fmt(b)} |`);
}

const md = `# Usage model backtest

Generated by \`node scripts/backtest.mjs\` on ${new Date().toISOString().slice(0, 10)}. Season ${meta.season}, Weeks ${weeks[0]}-${weeks[weeks.length - 1]}.
Every number here is measured by the site's grader (\`scripts/accuracy.mjs\`), in ESPN default PPR scoring.

## How it was run

- The usage model was fitted on ${coef.trained.join(', ')} only (\`scripts/fit.mjs\`, fitted ${coef.fitted}). No ${meta.season} game was used to fit it.
- For each week, its inputs come only from that season's earlier weeks.
- It is graded on the grader's shared pool: players every graded source projected, average projection 5+,
  with late scratches counted as zero. Adding the usage model as a source means a player also needs a usage-model number.
- The other columns are the projections saved before each week's games. Weeks 2-5 were rebuilt after the fact
  (Sleeper and the current model only); Weeks 6 on were saved live.

## 1. Re-grade of the current sources under the corrected scoring

This is the baseline every comparison uses. It replaces the Session 2 figures, which were graded against
Sleeper scoring and left out players who did not play.
${regrade.md}
## 2. Usage model against the current model, Sleeper and the site blend

Same weeks, same grader, on the players that also have a usage-model number.
${test.md}
Usage model against the current model, average miss: ${verdict}.

### Where the usage model is worse

${worse.length ? `| Position | Measure | Usage model | Behind |\n|---|---|---:|---|\n${worse.join('\n')}` : 'Nowhere in this sample.'}

### Coverage

Players in the grader's pool (QB, RB, WR, TE) without and with the usage model as a source. The counts can
differ by a few either way: a player needs a usage-model number, and the 5-point cutoff is on the average of
all graded sources, which now includes it.

| Week | Pool | With usage model |
|---|---:|---:|
${coverage.map(c => `| ${c[0]} | ${c[1]} | ${c[2]} |`).join('\n')}

## 3. Blend preview (not the refit)

What the existing tuner picks from these weeks. The real refit belongs to the switch-on session, after two
live shadow weeks; this only shows the direction.

${blend}

## What this does not show

- Betting lines in the files are closing lines. The live model will see whatever line is posted when it runs.
- Weeks 2-5 of the current model and site blend were rebuilt after the fact, not saved live.
- Eight weeks is a small sample; week-to-week swings of half a point in average miss are normal.
- The usage model has no injury adjustment. A player ruled out before kickoff is not in the graded pool for any source.
- A player whose name does not match between nflverse and Sleeper gets no usage-model number (see the coverage table).
`;
await writeFile(new URL('docs/BACKTEST.md', ROOT), md);
console.log(md);
