// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN, BASELINE, espnPoints } from './scoring.mjs';
import { loadModel } from './model.mjs';
import { actualsFrom, gradeWeek } from './accuracy.mjs';

const wk = s => s.split(':');

test('offense: Sleeper points minus one more point per interception', () => {
  // 20 Sleeper points with 2 interceptions (already -1 each there) is 18 in ESPN scoring
  assert.equal(espnPoints('QB', wk('20:0:2:100:250:2:10:0:0:0:0:0:5')), 18);
  assert.equal(espnPoints('WR', wk('14.5:6:0:80:0:0:0:0:85:0:0:22:0')), 14.5);
});

test('kicker: scored from the stat line', () => {
  // two FG under 40, one 40-49, one 50-59, one miss, three extra points, one missed extra point
  assert.equal(espnPoints('K', wk('0:0:0::0:0:0:0:0:0:0:2:1:1:0:1:3:1')), 2 * 3 + 4 + 5 - 1 + 3);
});

test('defense: scored from the stat line, with points-allowed tiers', () => {
  // 3 sacks, 1 INT, 1 fumble recovery, 1 TD, 0 safeties, 0 blocks, 10 points allowed
  assert.equal(espnPoints('DEF', wk('0:0:0::0:0:0:0:0:0:0:3:1:1:1:0:0:10:300')), 3 + 2 + 2 + 6 + 3);
  assert.equal(espnPoints('DEF', wk('0:0:0::0:0:0:0:0:0:0:0:0:0:0:0:0:0:300')), 5);    // shutout
  assert.equal(espnPoints('DEF', wk('0:0:0::0:0:0:0:0:0:0:0:0:0:0:0:0:50:300')), -5);
});

test('the scoring table matches the page defaults', () => {
  const data = { SITE_DATA: { week: 1, sleeper: '', espn: '' }, STATS_DATA: { fields: [], rows: '' }, CTX_DATA: {}, ADV_DATA: undefined };
  const M = loadModel(data, ['DEF_SC']);
  assert.deepEqual({ ...M.DEF_SC }, ESPN);
});

test('baselines: only ESPN and CBS differ from Sleeper', () => {
  assert.deepEqual(BASELINE, { sleeper: {}, espn: { int: -2 }, cbs: { ptd: 6, int: -2 }, fp: {} });
});

test('actualsFrom grades a quarterback in ESPN scoring', () => {
  const act = actualsFrom({ fields: ['name', 'pos', 'weeks'], rows: 'Al Passer|QB|20:0:2:100:250:2:10:0:0:0:0' });
  assert.deepEqual(act['al passer'], { 1: [18, 18, 18] });
});

const src = v => ({ espn: [v, v, v], sleeper: [v, v, v] });
test('gradeWeek: a late scratch projected 5+ is graded as zero; a low projection is left out', () => {
  const snap = { players: {
    'joe back': { n: 'Joe Back', pos: 'RB', src: src(18) },
    'late scratch': { n: 'Late Scratch', pos: 'WR', src: src(12) },
    'deep bench': { n: 'Deep Bench', pos: 'WR', src: src(3) },
  } };
  const g = gradeWeek(snap, { 'joe back': { 1: [20, 20, 20] } }, 1);
  assert.equal(g.n, 2);
  assert.equal(g.m.ppr.espn.ae, 2 + 12);
});

test('gradeWeek: no scores at all for the week means no grade, not all zeros', () => {
  assert.equal(gradeWeek({ players: { 'joe back': { pos: 'RB', src: src(18) } } }, {}, 1), null);
});
