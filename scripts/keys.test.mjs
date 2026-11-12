// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALIAS, nkey, collisions } from './keys.mjs';
import { loadModel } from './model.mjs';

test('nkey: suffixes, punctuation, aliases, defenses', () => {
  assert.equal(nkey("Ja'Marr Chase", 'WR'), 'jamarr chase');
  assert.equal(nkey('Travis Etienne Jr.', 'RB'), 'travis etienne');
  assert.equal(nkey('A.J. Brown', 'WR'), 'aj brown');
  assert.equal(nkey('Marquise Brown', 'WR'), 'hollywood brown');
  assert.equal(nkey('Chicago Bears D/ST', 'DST'), 'def:bears');
  assert.equal(nkey('Bears', 'DEF'), 'def:bears');
});

test('the page builds the same keys from the shared alias table', () => {
  const data = { SITE_DATA: { week: 1, sleeper: '', espn: '', alias: ALIAS }, STATS_DATA: { fields: [], rows: '' }, CTX_DATA: {}, ADV_DATA: undefined };
  const M = loadModel(data, ['nkey']);
  for (const [name, pos] of [["Ja'Marr Chase", 'WR'], ['Travis Etienne Jr.', 'RB'], ['A.J. Brown', 'WR'], ['Marquise Brown', 'WR'], ['Gabe Davis', 'WR'],
    ['Kenneth Walker III', 'RB'], ['Chicago Bears', 'DEF']]) assert.equal(M.nkey(name, pos), nkey(name, pos), name);
});

test('collisions: two players on one key are reported, one player is not', () => {
  assert.deepEqual(collisions('Josh Allen|QB|BUF|9\nJosh Allen|WR|JAX|2\nAl Wide|WR|MIN|9'), [['josh allen', ['Josh Allen (QB, BUF)', 'Josh Allen (WR, JAX)']]]);
  assert.deepEqual(collisions('Al Wide|WR|MIN|9\nJoe Back|RB|ATL|9'), []);
});
