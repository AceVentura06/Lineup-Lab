// Weekly usage inputs for the usage model, "as of" any week: only games from earlier weeks are used.
// The same code builds the training rows (2023-2025), the walk-forward test and the live shadow projections.
// Takes one season of parsed nflverse rows:
//   ep     ffopportunity ep_weekly: expected fantasy points per player-game
//   snaps  snap_counts
//   games  schedules/games.csv: betting lines, home/away
//   pbp    play-by-play: goal-line carries, end-zone targets, dropbacks
// Known gaps: no free routes-run data (snap share stands in), and it cannot see a teammate's injury opening up work.
import { nkey } from './keys.mjs';
import UsageModel from '../assets/model/usage-model.js';

export const POS = ['QB', 'RB', 'WR', 'TE'];
const COMMON = ['xfp3', 'xfpS', 'eff', 'snap', 'tgtSh', 'aySh', 'carSh', 'glSh', 'ezSh', 'implied', 'spread', 'home', 'oppDef', 'gp'];
export const FEATURES = { QB: [...COMMON, 'dropbacks', 'rushX'], RB: COMMON, WR: COMMON, TE: COMMON };
export const FEATURE_NOTES = {
  xfp3: 'expected fantasy points per game, last three games', xfpS: 'expected fantasy points per game, season to date',
  eff: 'actual minus expected points per game', snap: 'share of offensive snaps', tgtSh: 'share of team targets',
  aySh: 'share of team air yards', carSh: 'share of team carries', glSh: 'share of team carries inside the 5',
  ezSh: 'share of team end-zone targets', implied: 'Vegas implied team total', spread: 'points favored by',
  home: '1 at home, 0 away', oppDef: 'points over expected the opponent has allowed to the position, per game',
  gp: 'games played this season', dropbacks: 'dropbacks per game', rushX: 'expected rushing points per game',
};

const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const share = (gs, a, b) => { const d = gs.reduce((t, g) => t + g[b], 0); return d ? gs.reduce((t, g) => t + g[a], 0) / d : 0; };

export function prepare({ ep, snaps, games, pbp }) {
  // play-by-play: per player-week counts and team-week totals
  const pw = {}, tw = {};
  const bump = (o, k, f) => { (o[k] = o[k] || { gl: 0, ez: 0, db: 0 })[f]++; };
  for (const r of pbp) {
    if ((r.season_type && r.season_type !== 'REG') || r.two_point_attempt === '1') continue;
    const w = +r.week, tm = r.posteam;
    if (r.qb_dropback === '1') { const id = r.passer_player_id || r.rusher_player_id; if (id) bump(pw, id + '|' + w, 'db'); }
    if (r.play_type === 'pass' && r.receiver_player_id && r.air_yards !== '' && num(r.air_yards) >= num(r.yardline_100)) { bump(pw, r.receiver_player_id + '|' + w, 'ez'); bump(tw, tm + '|' + w, 'ez'); }
    if (r.play_type === 'run' && r.rusher_player_id && num(r.yardline_100) <= 5) { bump(pw, r.rusher_player_id + '|' + w, 'gl'); bump(tw, tm + '|' + w, 'gl'); }
  }
  // snap share by name + team + week (the snap file has no shared player id)
  const snap = {};
  for (const r of snaps) if (r.game_type === 'REG') snap[nkey(r.player, '') + '|' + r.team + '|' + +r.week] = num(r.offense_pct);
  // schedule: each team's game each week
  const sched = {};
  for (const g of games) {
    if (g.game_type !== 'REG') continue;
    const sp = g.spread_line === '' ? null : num(g.spread_line), tot = g.total_line === '' ? null : num(g.total_line);   // spread: + means home favored
    const imp = s => sp == null || tot == null ? null : tot / 2 + s * sp / 2;
    sched[g.home_team + '|' + +g.week] = { opp: g.away_team, home: 1, implied: imp(1), spread: sp };
    sched[g.away_team + '|' + +g.week] = { opp: g.home_team, home: 0, implied: imp(-1), spread: sp == null ? null : -sp };
  }
  // players and their games; what each defense allowed over expected, by position and week
  const players = {}, def = {};
  for (const r of ep) {
    const w = +r.week, pos = r.position;
    if (!POS.includes(pos) || !(w >= 1 && w <= 18) || !r.player_id) continue;
    const p = players[r.player_id] = players[r.player_id] || { id: r.player_id, name: r.full_name, pos, games: [] };
    const c = pw[r.player_id + '|' + w] || {}, t = tw[r.posteam + '|' + w] || {};
    p.games.push({ week: w, team: r.posteam, xfp: num(r.total_fantasy_points_exp), fp: num(r.total_fantasy_points), rushX: num(r.rush_fantasy_points_exp),
      rec: num(r.receptions), tgt: num(r.rec_attempt), tmTgt: num(r.rec_attempt_team), ay: num(r.rec_air_yards), tmAy: num(r.rec_air_yards_team),
      car: num(r.rush_attempt), tmCar: num(r.rush_attempt_team), snap: snap[nkey(r.full_name, pos) + '|' + r.posteam + '|' + w] ?? null,
      gl: c.gl || 0, tmGl: t.gl || 0, ez: c.ez || 0, tmEz: t.ez || 0, db: c.db || 0 });
    const o = sched[r.posteam + '|' + w]?.opp;
    if (o) { const d = (def[o + '|' + pos] = def[o + '|' + pos] || {}); d[w] = (d[w] || 0) + num(r.total_fantasy_points) - num(r.total_fantasy_points_exp); }
  }
  for (const p of Object.values(players)) p.games.sort((a, b) => a.week - b.week);
  return { players, sched, def };
}

// Inputs for every player with a game in `week`, from his games before it.
// Returns [{ id, key, name, pos, team, recPg, x: { feature: value | null } }]
export function inputsAsOf(S, week) {
  const out = [];
  for (const p of Object.values(S.players)) {
    const gs = p.games.filter(g => g.week < week);
    if (!gs.length) continue;
    const team = gs[gs.length - 1].team, g = S.sched[team + '|' + week];
    if (!g) continue;                                   // bye
    const dw = Object.entries(S.def[g.opp + '|' + p.pos] || {}).filter(([w]) => +w < week).map(([, v]) => v);
    out.push({ id: p.id, key: nkey(p.name, p.pos), name: p.name, pos: p.pos, team, recPg: mean(gs.map(x => x.rec)), x: {
      xfp3: mean(gs.slice(-3).map(x => x.xfp)), xfpS: mean(gs.map(x => x.xfp)), eff: mean(gs.map(x => x.fp - x.xfp)),
      snap: mean(gs.map(x => x.snap).filter(v => v != null)), tgtSh: share(gs, 'tgt', 'tmTgt'), aySh: share(gs, 'ay', 'tmAy'),
      carSh: share(gs, 'car', 'tmCar'), glSh: share(gs, 'gl', 'tmGl'), ezSh: share(gs, 'ez', 'tmEz'),
      implied: g.implied, spread: g.spread, home: g.home, oppDef: mean(dw) ?? 0, gp: gs.length,
      dropbacks: mean(gs.map(x => x.db)), rushX: mean(gs.map(x => x.rushX)) } });
  }
  return out;
}

// The usage model's projection for every player with a game in `week`: key -> [ppr, half, std].
// Half and standard take off the player's catches per game so far. coef: assets/model/coefficients.json.
export function shadowProjections(S, week, coef) {
  const out = {}, best = {};
  const r1 = v => Math.round(v * 10) / 10;
  for (const p of inputsAsOf(S, week)) {
    const v = UsageModel.predict(coef, p.pos, p.x);
    if (v == null || (best[p.key] ?? -1) >= p.x.xfpS) continue;      // two players on one key: keep the busier one
    best[p.key] = p.x.xfpS;
    out[p.key] = [r1(v), r1(Math.max(0, v - 0.5 * p.recPg)), r1(Math.max(0, v - p.recPg))];
  }
  return out;
}
