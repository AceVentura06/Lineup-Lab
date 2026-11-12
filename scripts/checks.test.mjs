// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { minRows } from './checks.mjs';
import { parseCSV } from './adv.mjs';
import { parseCbsProj, parseCbsRanks } from './cbs.mjs';
import { build } from './build.mjs';

const fixture = f => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('minRows: an empty or thin source is a failure, a full one passes', () => {
  assert.equal(minRows('ESPN projections', 400, 10), 400);
  assert.throws(() => minRows('ESPN projections', 0, 10), /only 0 rows/);
  assert.throws(() => minRows('Betting lines', 3, 10), /expected at least 10/);
  assert.throws(() => minRows('Made-up source', 5, 10), /no minimum set/);
});

test('minRows: season-to-date files may be empty before Week 3', () => {
  assert.equal(minRows('nflverse stats', 0, 1), 0);
  assert.equal(minRows('Play-by-play', 0, 2), 0);
  assert.throws(() => minRows('nflverse stats', 0, 3), /only 0 rows/);
});

test('parseCSV: quotes, commas and newlines inside fields, NA as empty', () => {
  const rows = parseCSV('name,team,note\n"Brown, A.J.",PHI,"said ""go""\nthen left"\nJoe Back,NA,ok\n');
  assert.deepEqual(rows, [{ name: 'Brown, A.J.', team: 'PHI', note: 'said "go"\nthen left' }, { name: 'Joe Back', team: '', note: 'ok' }]);
});

test('CBS projections page: name, team and fantasy points per row', () => {
  assert.deepEqual(parseCbsProj(fixture('cbs-proj-qb.html')), [
    { name: 'Brock Purdy', team: 'SF', pts: 29.4 }, { name: 'Josh Allen', team: 'BUF', pts: 28.5 }, { name: 'Trevor Lawrence', team: 'JAX', pts: 26.1 }]);
});

test('CBS rankings page: experts, and each player\'s rank from each', () => {
  const r = parseCbsRanks(fixture('cbs-ranks-rb.html'));
  assert.deepEqual(r.experts, ['Jamey Eisenberg', 'Dave Richard', 'Heath Cummings']);
  assert.deepEqual(r.rows.map(x => [x.name, x.team, x.rank, x.experts]), [
    ['Jahmyr Gibbs', 'DET', 1, [1, 2, 1]], ['Kenneth Walker III', 'KC', 2, [2, 1, 2]], ['Bijan Robinson', 'ATL', 3, [3, 4, 3]]]);
});

// a tiny stand-in for Sleeper and ESPN: enough for build() to run
function fakeFetch({ projections, espnFails }) {
  return async url => {
    if (url.includes('/state/nfl')) return { season: '2026', week: 10, display_week: 10, season_type: 'regular' };
    if (url.includes('/schedule/')) return [{ week: 10, home: 'ATL', away: 'MIN', date: '2099-11-15', status: 'pre' }];
    if (url.includes('/projections/')) return projections;
    if (url.includes('/stats/')) return Array.from({ length: 200 }, (_, i) => ({ player_id: 'p' + i, team: 'ATL',
      player: { first_name: 'Player', last_name: 'N' + i, position: 'WR' }, stats: { gp: 1, pts_ppr: 5, off_snp: 30, tm_off_snp: 60 } }));
    if (url.includes('/players/nfl')) return {};
    if (url.includes('espn.com')) { if (espnFails) throw new Error('HTTP 503'); return { players: [] }; }
    throw new Error('unexpected url ' + url);
  };
}
const projRows = n => Array.from({ length: n }, (_, i) => ({ team: 'ATL', opponent: 'MIN', stats: { pts_ppr: 9 },
  player: { first_name: 'Player', last_name: 'N' + i, position: 'WR' } }));

test('build: an empty Sleeper projections answer stops the run', async () => {
  await assert.rejects(build(fakeFetch({ projections: [] })), /Sleeper projections: only 0 rows/);
});

test('build: ESPN failing or returning nothing is recorded as a failed source, with Sleeper still ok', async () => {
  const down = await build(fakeFetch({ projections: projRows(200), espnFails: true }));
  assert.equal(down.sources.Sleeper.ok, true);
  assert.equal(down.sources.ESPN.ok, false);
  assert.match(down.sources.ESPN.detail, /HTTP 503/);
  const empty = await build(fakeFetch({ projections: projRows(200) }));
  assert.equal(empty.sources.ESPN.ok, false);
  assert.match(empty.sources.ESPN.detail, /only 0 rows/);
});
