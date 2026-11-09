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

test('players with 0 snaps are not graded for any source; a shutout on real snaps still is', () => {
  // weeks as "ppr:rec:passTD:snap%"
  const S = stats(['Sat Out|WR|0:0:0:0', 'No Data|WR|0:0:0:', 'Shut Out|WR|0:0:0:82', 'Late Post|WR|9:3:0:', 'Kick Er|K|0:0:0:0', 'Bench Td|RB|6:0:0:0']);
  const act = actualsFrom(S, {});
  assert.deepEqual(Object.keys(act).filter(k => act[k][1]), ['shut out', 'late post', 'kick er']);
  const src = v => ({ espn: [v, v, v], sleeper: [v, v, v] }), p = (n, pos) => ({ n, pos, tm: 'BAL', src: src(19) });
  const g = gradeWeek({ players: { 'sat out': p('Sat Out', 'WR'), 'no data': p('No Data', 'WR'), 'shut out': p('Shut Out', 'WR') } }, act, 1);
  assert.equal(g.n, 1);
  assert.equal(g.m.ppr.espn.ae, 19);
  assert.equal(g.m.ppr.sleeper.ae, 19);
  assert.deepEqual(g.miss.ppr.espn.map(r => r[0]), ['Shut Out']);
});

test('players hurt during a game are not graded; a low-snap game he was fine after still is', () => {
  const S = { fields: ['name', 'pos', 'team', 'weeks'], rows: [
    'Hurt Early|QB|BAL|20:0:0:100;18:0:0:100;0:0:0:2;-;-',   // left Week 3, missed Week 4
    'Bye Week|WR|DEN|9:0:0:80;9:0:0:80;1:0:0:20;-;9:0:0:80', // Week 4 is his bye, back in Week 5
    'Listed Out|WR|BAL|9:0:0:80;9:0:0:80;9:0:0:80;1:0:0:20',  // hurt in the latest week, next game not played yet
    'Listed Q|WR|BAL|9:0:0:80;9:0:0:80;9:0:0:80;1:0:0:20',    // low snaps, only Questionable
    'Full Game|WR|BAL|9:0:0:80;9:0:0:80;0:0:0:82;9:0:0:80',   // shut out on real snaps
  ].join('\n') };
  const sched = 'BAL|A,B,C,D,E\nDEN|A,B,C,BYE,E', inj = 'Listed Out|WR|BAL|IR\nListed Q|WR|BAL|Questionable';
  const graded = (n, w, currentWeek) => !!actualsFrom(S, { sched, inj, currentWeek })[n][w];
  assert.equal(graded('hurt early', 3, 6), false);
  assert.equal(graded('bye week', 3, 6), true);
  assert.equal(graded('listed out', 4, 5), false);
  assert.equal(graded('listed q', 4, 5), true);
  assert.equal(graded('full game', 3, 6), true);
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
