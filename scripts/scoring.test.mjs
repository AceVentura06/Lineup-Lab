// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPN, BASELINE, espnPoints } from './scoring.mjs';
import { loadModel } from './model.mjs';
import { actualsFrom } from './accuracy.mjs';

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

