// Run with: node --test scripts/accuracy.test.mjs (update.yml runs it after every data refresh)
// Small hand-worked cases for the grading and blend math the site's default weights come from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actualsFrom, gradeWeek, tuneBlend } from './accuracy.mjs';
import { projectAll } from './model.mjs';

// stats rows are "name|pos|weeks", weeks as "ppr:receptions;..." with "-" for no game
const stats = rows => ({ fields: ['name', 'pos', 'weeks'], rows: rows.join('\n') });

test('actualsFrom turns PPR + receptions into PPR, half and standard', () => {
  const act = actualsFrom(stats(['Joe Back|RB|20:4;-']));
  assert.deepEqual(act['joe back'], { 1: [20, 18, 16] });
});

test('gradeWeek: total miss per source, on the shared pool', () => {
  const src = (espn, sleeper) => ({ espn: [espn, espn, espn], sleeper: [sleeper, sleeper, sleeper] });
  const snap = { players: {
    'joe back': { n: 'Joe Back', pos: 'RB', tm: 'ATL', src: src(18, 25) },
    'al wide': { n: 'Al Wide', pos: 'WR', tm: 'MIN', src: src(10, 6) },
  } };
  const act = { 'joe back': { 1: [20, 20, 20] }, 'al wide': { 1: [8, 8, 8] } };
  const g = gradeWeek(snap, act, 1);
  assert.equal(g.n, 2);
  assert.equal(g.m.ppr.espn.ae, 4);    // |18-20| + |10-8|
  assert.equal(g.m.ppr.sleeper.ae, 7); // |25-20| + |6-8|
});

test('tuneBlend picks the model when it is right, pulled halfway to the default at 30 rows', () => {
  // 30 RBs: the model nails every score, the sites are always 4 high
  const rows = [], players = {};
  for (let i = 0; i < 30; i++) {
    rows.push(`Back ${i}|RB|12:0`);
    players[`back ${i}`] = { pos: 'RB', src: { mod: [12], espn: [16], sleeper: [16] } };
  }
  const b = tuneBlend({ 1: { players } }, stats(rows), 2);
  assert.equal(b.pos.RB.n, 30);
  assert.equal(b.pos.RB.w, 0.25); // best is 0% sites; (30*0 + 30*0.5) / 60
  assert.equal(b.pos.RB.model, 0);
});

// The updater saves each week's projections by running index.html's own script in Node (model.mjs).
// If a page change uses a browser feature that runner lacks, update.mjs only logs it and the run stays
// green, so the accuracy history would stop growing unnoticed. This turns that into a failing test.
test('the page model still runs in Node on the current data', () => {
  const load = f => { const g = {}; new Function('g', readFileSync(new URL(`../data/${f}.js`, import.meta.url), 'utf8').replace(/^var (\w+)=/m, 'g.$1='))(g); return g; };
  const data = Object.assign({}, ...['sites-data', 'stats-data', 'ctx-data', 'adv-data'].map(load));
  const r = projectAll(data);
  assert.ok(Object.keys(r.players).length > 50, 'expected projections for the week\'s players');
});
