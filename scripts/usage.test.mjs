// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import UsageModel from '../assets/model/usage-model.js';
import { prepare, inputsAsOf, shadowProjections, FEATURES, POS } from './usage.mjs';
import { ridge } from './fit.mjs';

test('model formula: intercept plus weight x standardized input, never below zero', () => {
  const C = { positions: { WR: { features: ['a', 'b'], means: [10, 0.5], scales: [2, 0.25], weights: [3, -1], intercept: 8 } } };
  assert.equal(UsageModel.predict(C, 'WR', { a: 14, b: 0.25 }), 8 + 3 * 2 - 1 * -1);   // 15
  assert.equal(UsageModel.predict(C, 'WR', { a: 10, b: null }), 8);                    // a missing input counts as average
  assert.equal(UsageModel.predict(C, 'WR', { a: -100, b: 0.5 }), 0);
  assert.equal(UsageModel.predict(C, 'K', { a: 1 }), null);
});

test('ridge: recovers a straight line when the penalty is tiny', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ x: [i, (i * 7) % 5], y: 2 * i + 3 * ((i * 7) % 5) + 1 }));
  const m = ridge(rows, 1e-9);
  assert.ok(Math.abs(m.predict([10, 2]) - 27) < 1e-6);
  assert.ok(Math.abs(ridge(rows, 1e6).predict([49, 4]) - m.intercept) < 1, 'a huge penalty shrinks toward the average');
});

// one receiver, three weeks; week 3 is the game being projected
const ep = (week, xfp, fp, tgt) => ({ player_id: 'A', full_name: 'Al Wide Jr.', position: 'WR', posteam: 'ATL', week: String(week), total_fantasy_points_exp: String(xfp),
  total_fantasy_points: String(fp), rush_fantasy_points_exp: '0', receptions: '4', rec_attempt: String(tgt), rec_attempt_team: '30', rec_air_yards: '50', rec_air_yards_team: '250',
  rush_attempt: '0', rush_attempt_team: '25' });
const games = [1, 2, 3].map(w => ({ game_type: 'REG', week: String(w), home_team: 'ATL', away_team: 'MIN', spread_line: '3', total_line: '44' }));
const snaps = [1, 2, 3].map(w => ({ game_type: 'REG', week: String(w), player: 'Al Wide', team: 'ATL', offense_pct: '0.8' }));
const pbp = [{ week: '1', posteam: 'ATL', play_type: 'pass', receiver_player_id: 'A', air_yards: '12', yardline_100: '10' },
  { week: '1', posteam: 'ATL', play_type: 'pass', receiver_player_id: 'B', air_yards: '8', yardline_100: '6' }];

test('inputs as of a week: worked values from earlier weeks', () => {
  const S = prepare({ ep: [ep(1, 10, 14, 6), ep(2, 14, 12, 9), ep(3, 99, 99, 30)], games, snaps, pbp });
  const [p] = inputsAsOf(S, 3);
  assert.equal(p.key, 'al wide');
  assert.equal(p.x.xfpS, 12);
  assert.equal(p.x.eff, 1);                 // (14-10 + 12-14) / 2
  assert.equal(p.x.tgtSh, 15 / 60);
  assert.equal(p.x.snap, 0.8);
  assert.equal(p.x.ezSh, 0.5);              // one of the team's two end-zone targets
  assert.equal(p.x.implied, 23.5);          // (44 + 3) / 2 at home
  assert.equal(p.x.gp, 2);
  assert.equal(inputsAsOf(S, 1).length, 0); // no earlier games: no projection
});

test('inputs as of a week never see that week or later', () => {
  const at3 = rows => JSON.stringify(inputsAsOf(prepare({ ep: rows, games, snaps, pbp }), 3));
  assert.equal(at3([ep(1, 10, 14, 6), ep(2, 14, 12, 9), ep(3, 99, 99, 30)]), at3([ep(1, 10, 14, 6), ep(2, 14, 12, 9), ep(3, 1, 0, 1)]));
});

test('saved coefficients fit the model: every position, one weight per input', () => {
  const C = JSON.parse(readFileSync(new URL('../assets/model/coefficients.json', import.meta.url), 'utf8'));
  for (const pos of POS) {
    const m = C.positions[pos];
    assert.deepEqual(m.features, FEATURES[pos]);
    for (const f of ['means', 'scales', 'weights']) assert.equal(m[f].length, m.features.length, `${pos} ${f}`);
    assert.ok(m.scales.every(s => s > 0) && Number.isFinite(m.intercept));
  }
  const S = prepare({ ep: [ep(1, 10, 14, 6), ep(2, 14, 12, 9)], games, snaps, pbp });
  const v = shadowProjections(S, 3, C)['al wide'];
  assert.ok(v[0] > 0 && v[0] < 40);
  assert.ok(Math.abs(v[0] - v[1] - 2) < 0.11 && Math.abs(v[0] - v[2] - 4) < 0.11, 'four catches a game: half-PPR is 2 lower, standard 4 lower');
});
