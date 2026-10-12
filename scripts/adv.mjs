// Advanced data from nflverse (stats, Next Gen Stats, play-by-play, FTN charting, injury reports,
// betting lines), FantasyPros expert consensus rankings (via DynastyProcess), and Open-Meteo weather.
// Every source is optional: if one fails, the rest still build.

const NFLV = 'https://github.com/nflverse/nflverse-data/releases/download';
const FP_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/fp_latest_weekly.csv';
const TEAM_FIX = { LA: 'LAR', JAC: 'JAX', WSH: 'WAS', LVR: 'LV', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
const team = t => TEAM_FIX[t] || t;

// Same key the site uses to match players across sources.
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
const ALIAS = { 'mitchell tinsley': 'mitch tinsley', 'marquise brown': 'hollywood brown', 'gabe davis': 'gabriel davis', 'chigoziem okonkwo': 'chig okonkwo', 'josh palmer': 'joshua palmer', 'matthew hibner': 'matt hibner' };
export function nkey(name, pos) {
  if (pos === 'DEF' || pos === 'DST') { const w = String(name).replace(/D\/ST/i, '').trim().split(/\s+/); return 'def:' + w[w.length - 1].toLowerCase(); }
  const k = String(name).toLowerCase().replace(/[.'’]/g, '').replace(SUFFIX, '').replace(/\s+/g, ' ').trim();
  return ALIAS[k] || k;
}

// Minimal CSV parser (handles quotes, escaped quotes, newlines in fields).
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i] === 'NA' ? '' : (r[i] ?? '')); return o; });
}
const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const has = v => v !== '' && v != null && Number.isFinite(parseFloat(v));
const r2 = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

// Outdoor and open-roof stadiums (for weather). Domes and closed roofs are skipped.
const STADIUMS = {
  'Acrisure Stadium': [40.4468, -80.0158], 'Bank of America Stadium': [35.2258, -80.8528], 'Empower Field at Mile High': [39.7439, -105.0201],
  'Estadio Banorte': [19.3029, -99.1505], 'EverBank Stadium': [30.3239, -81.6373], 'GEHA Field at Arrowhead Stadium': [39.0489, -94.4839],
  'Gillette Stadium': [42.0909, -71.2643], 'Hard Rock Stadium': [25.958, -80.2389], 'Highmark Stadium': [42.7738, -78.787],
  'Huntington Bank Field': [41.5061, -81.6995], 'Lambeau Field': [44.5013, -88.0622], "Levi's Stadium": [37.403, -121.97],
  'Lincoln Financial Field': [39.9008, -75.1675], 'Lumen Field': [47.5952, -122.3316], 'M&T Bank Stadium': [39.278, -76.6227],
  'MetLife Stadium': [40.8135, -74.0745], 'Nissan Stadium': [36.1665, -86.7713], 'Northwest Stadium': [38.9077, -76.8645],
  'Paycor Stadium': [39.0955, -84.5161], 'Raymond James Stadium': [27.9759, -82.5033], 'Soldier Field': [41.8623, -87.6167],
  'Tottenham Hotspur Stadium': [51.6043, -0.0664], 'Wembley Stadium': [51.556, -0.2795], 'Maracana Stadium': [-22.9122, -43.2302],
  'Lucas Oil Stadium': [39.7601, -86.1639], 'Mercedes-Benz Stadium': [33.7554, -84.4008]
};

import { buildCbs } from './cbs.mjs';

export async function buildAdv({ fetchText, fetchGz, season, week, log = () => {} }) {
  const out = { season, week, sources: {}, players: {}, games: {}, ecr: {}, practice: {} };
  const ok = (name, detail) => { out.sources[name] = { ok: true, detail }; log(`${name}: ${detail}`); };
  const fail = (name, e) => { out.sources[name] = { ok: false, detail: String(e.message || e) }; log(`${name} FAILED: ${e.message || e}`); };
  const P = {}; // gsis id -> player record
  const pl = (id, name, pos, tm) => {
    if (!P[id]) P[id] = { name, pos, team: tm, s: {} };
    if (tm) P[id].team = tm;
    return P[id];
  };
  const add = (p, k, v) => { p.s[k] = (p.s[k] || 0) + v; };

  // 1. nflverse weekly player stats: air yards, EPA, CPOE, team shares
  let weeklyRows = [];
  try {
    weeklyRows = parseCSV(await fetchText(`${NFLV}/stats_player/stats_player_week_${season}.csv`)).filter(r => r.season_type === 'REG');
    const teamTot = {};
    for (const r of weeklyRows) {
      const k = r.week + '|' + team(r.team);
      const t = teamTot[k] = teamTot[k] || { tgt: 0, ay: 0 };
      t.tgt += num(r.targets); t.ay += num(r.receiving_air_yards);
    }
    for (const r of weeklyRows) {
      if (!['QB', 'RB', 'WR', 'TE', 'FB'].includes(r.position)) continue;
      const p = pl(r.player_id, r.player_display_name, r.position === 'FB' ? 'RB' : r.position, team(r.team));
      const t = teamTot[r.week + '|' + team(r.team)];
      add(p, 'g', 1);
      for (const [k, c] of [['tgt', 'targets'], ['rec', 'receptions'], ['recYd', 'receiving_yards'], ['ay', 'receiving_air_yards'], ['yac', 'receiving_yards_after_catch'],
        ['recEpa', 'receiving_epa'], ['car', 'carries'], ['rushYd', 'rushing_yards'], ['rushEpa', 'rushing_epa'], ['att', 'attempts'], ['cmp', 'completions'],
        ['passYd', 'passing_yards'], ['passEpa', 'passing_epa'], ['sacks', 'sacks_suffered'], ['passAy', 'passing_air_yards'], ['ppr', 'fantasy_points_ppr'],
        ['recFd', 'receiving_first_downs'], ['rushFd', 'rushing_first_downs'], ['rec20', 'receiving_20'], ['rush10', 'rushing_10']]) add(p, k, num(r[c]));
      if (has(r.passing_cpoe)) { add(p, 'cpoeW', num(r.passing_cpoe) * num(r.attempts)); add(p, 'cpoeN', num(r.attempts)); }
      if (t) { add(p, 'tmTgt', t.tgt); add(p, 'tmAy', t.ay); }
    }
    ok('nflverse stats', `${weeklyRows.length} player-weeks`);
  } catch (e) { fail('nflverse stats', e); }

  // 2. Next Gen Stats (season-to-date rows are week 0)
  for (const kind of ['receiving', 'rushing', 'passing']) {
    try {
      const rows = parseCSV(await fetchGz(`${NFLV}/nextgen_stats/ngs_${kind}.csv.gz`)).filter(r => r.season === String(season) && r.season_type === 'REG' && r.week === '0');
      for (const r of rows) {
        const p = pl(r.player_gsis_id, r.player_display_name, r.player_position, team(r.team_abbr));
        if (kind === 'receiving') Object.assign(p.s, { sep: num(r.avg_separation), cush: num(r.avg_cushion), iay: num(r.avg_intended_air_yards), yacoe: num(r.avg_yac_above_expectation) });
        if (kind === 'rushing') Object.assign(p.s, { ryoe: num(r.rush_yards_over_expected_per_att), box8: num(r.percent_attempts_gte_eight_defenders), ttl: num(r.avg_time_to_los), rpoe: num(r.rush_pct_over_expected) });
        if (kind === 'passing') Object.assign(p.s, { ttt: num(r.avg_time_to_throw), aggr: num(r.aggressiveness), ays: num(r.avg_air_yards_to_sticks), cpae: num(r.completion_percentage_above_expectation) });
      }
      ok(`Next Gen Stats ${kind}`, `${rows.length} players`);
    } catch (e) { fail(`Next Gen Stats ${kind}`, e); }
  }

  // 3. Play-by-play: red zone, end zone, deep targets, and expected fantasy points
  let pbp = [];
  try {
    pbp = parseCSV(await fetchGz(`${NFLV}/pbp/play_by_play_${season}.csv.gz`)).filter(r => r.season_type === 'REG' && r.two_point_attempt !== '1');
    const ayB = a => !has(a) ? 'u' : a < 0 ? 'n' : a < 5 ? 0 : a < 10 ? 1 : a < 15 ? 2 : a < 20 ? 3 : a < 30 ? 4 : 5;
    const ylP = y => y <= 5 ? 0 : y <= 10 ? 1 : y <= 20 ? 2 : y <= 50 ? 3 : 4;
    const ylR = y => y <= 2 ? 0 : y <= 5 ? 1 : y <= 10 ? 2 : y <= 20 ? 3 : y <= 50 ? 4 : 5;
    const targets = pbp.filter(r => r.play_type === 'pass' && r.receiver_player_id);
    const rushes = pbp.filter(r => r.play_type === 'run' && r.rusher_player_id);
    // League averages per situation bin
    const tb = {}, rb = {};
    for (const r of targets) {
      const k = ayB(r.air_yards === '' ? NaN : num(r.air_yards)) + '|' + ylP(num(r.yardline_100));
      const b = tb[k] = tb[k] || { n: 0, rec: 0, yd: 0, td: 0 };
      b.n++; if (r.complete_pass === '1') { b.rec++; b.yd += num(r.yards_gained); } if (r.pass_touchdown === '1') b.td++;
      r._k = k;
    }
    for (const r of rushes) {
      const k = ylR(num(r.yardline_100)) + '|' + (r.qb_scramble === '1' ? 's' : 'r');
      const b = rb[k] = rb[k] || { n: 0, yd: 0, td: 0 };
      b.n++; b.yd += num(r.yards_gained); if (r.rush_touchdown === '1') b.td++;
      r._k = k;
    }
    const tmRz = {}, tmGl = {}, tmDeep = {}, tmEz = {};
    const inc = (o, k) => o[k] = (o[k] || 0) + 1;
    for (const r of targets) {
      const tm = team(r.posteam), y = num(r.yardline_100), a = r.air_yards === '' ? NaN : num(r.air_yards), b = tb[r._k];
      const p = pl(r.receiver_player_id, r.receiver_player_name, '', tm);
      add(p, 'xRec', b.rec / b.n); add(p, 'xRecYd', b.yd / b.n); add(p, 'xRecTd', b.td / b.n); add(p, 'pbpTgt', 1);
      add(p, 'aRecTd', r.pass_touchdown === '1' ? 1 : 0);
      if (y <= 20) { add(p, 'rzTgt', 1); inc(tmRz, tm); }
      if (Number.isFinite(a) && a >= y) { add(p, 'ezTgt', 1); inc(tmEz, tm); }
      if (Number.isFinite(a) && a >= 20) { add(p, 'deepTgt', 1); inc(tmDeep, tm); }
    }
    for (const r of rushes) {
      const tm = team(r.posteam), y = num(r.yardline_100), b = rb[r._k];
      const p = pl(r.rusher_player_id, r.rusher_player_name, '', tm);
      add(p, 'xRushYd', b.yd / b.n); add(p, 'xRushTd', b.td / b.n); add(p, 'pbpCar', 1);
      if (y <= 10) { add(p, 'rz10Car', 1); inc(tmRz, tm + 'c'); }
      if (y <= 5) { add(p, 'glCar', 1); inc(tmGl, tm); }
    }
    for (const p of Object.values(P)) {
      const tm = p.team;
      if (p.s.rzTgt !== undefined || p.s.pbpTgt) { p.s.tmRzTgt = tmRz[tm] || 0; p.s.tmEzTgt = tmEz[tm] || 0; p.s.tmDeep = tmDeep[tm] || 0; }
      if (p.s.pbpCar) { p.s.tmRz10Car = tmRz[tm + 'c'] || 0; p.s.tmGlCar = tmGl[tm] || 0; }
    }
    ok('Play-by-play', `${targets.length} targets, ${rushes.length} carries`);
  } catch (e) { fail('Play-by-play', e); }

  // 4. FTN charting joined to play-by-play
  try {
    if (!pbp.length) throw new Error('needs play-by-play');
    const byPlay = new Map(pbp.map(r => [r.game_id + '|' + r.play_id, r]));
    const rows = parseCSV(await fetchText(`${NFLV}/ftn_charting/ftn_charting_${season}.csv`));
    const tmFirst = {}; let joined = 0;
    for (const f of rows) {
      const r = byPlay.get(f.nflverse_game_id + '|' + f.nflverse_play_id); if (!r) continue; joined++;
      const T = v => v === 'TRUE';
      if (r.play_type === 'pass' && r.receiver_player_id) {
        const p = P[r.receiver_player_id]; if (!p) continue;
        add(p, 'ftnTgt', 1);
        if (T(f.is_catchable_ball)) add(p, 'catchable', 1);
        if (T(f.is_contested_ball)) add(p, 'contested', 1);
        if (T(f.is_drop)) add(p, 'ftnDrop', 1);
        if (T(f.is_screen_pass)) add(p, 'screen', 1);
        if (f.read_thrown === '1') { add(p, 'firstRead', 1); tmFirst[team(r.posteam)] = (tmFirst[team(r.posteam)] || 0) + 1; }
      }
      if (r.passer_player_id && r.qb_dropback === '1' && P[r.passer_player_id]) {
        const q = P[r.passer_player_id];
        add(q, 'ftnDb', 1);
        if (T(f.is_play_action)) add(q, 'pa', 1);
        if (T(f.is_interception_worthy)) add(q, 'intWorthy', 1);
        if (T(f.is_qb_out_of_pocket)) add(q, 'oop', 1);
        if (num(f.n_blitzers) > 0) add(q, 'blitzed', 1);
      }
      if (r.play_type === 'run' && r.rusher_player_id && P[r.rusher_player_id] && num(f.n_defense_box) > 0) {
        const p = P[r.rusher_player_id]; add(p, 'ftnCar', 1); if (num(f.n_defense_box) >= 8) add(p, 'stacked', 1);
      }
    }
    for (const p of Object.values(P)) if (p.s.ftnTgt) p.s.tmFirst = tmFirst[p.team] || 0;
    ok('FTN charting', `${joined} charted plays`);
  } catch (e) { fail('FTN charting', e); }

  // 5. Official injury reports with practice participation (this week's report only)
  try {
    const rows = parseCSV(await fetchText(`${NFLV}/injuries/injuries_${season}.csv`)).filter(r => r.week === String(week) && r.season_type === 'REG');
    const code = s => /did not/i.test(s) ? 'DNP' : /limited/i.test(s) ? 'LP' : /full/i.test(s) ? 'FP' : '';
    for (const r of rows) {
      const pos = r.position === 'FB' ? 'RB' : r.position;
      if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) continue;
      out.practice[nkey(r.full_name, pos)] = [code(r.practice_status), r.report_status || '', r.report_primary_injury || r.practice_primary_injury || ''];
    }
    ok('NFL injury reports', rows.length ? `${rows.length} entries for week ${week}` : `no week ${week} report yet (comes out Wednesday)`);
  } catch (e) { fail('NFL injury reports', e); }

  // 6. Betting lines and game info
  let games = [];
  try {
    games = parseCSV(await fetchText(`${NFLV}/schedules/games.csv`)).filter(r => r.season === String(season) && r.week === String(week) && r.game_type === 'REG');
    for (const g of games) {
      const sp = has(g.spread_line) ? num(g.spread_line) : null, tot = has(g.total_line) ? num(g.total_line) : null;
      const base = { total: tot, roof: g.roof, stadium: g.stadium, day: g.gameday, time: g.gametime };
      const home = team(g.home_team), away = team(g.away_team);
      out.games[home] = { ...base, opp: away, home: true, spread: sp == null ? null : -sp, implied: sp == null || tot == null ? null : r2(tot / 2 + sp / 2) };
      out.games[away] = { ...base, opp: home, home: false, spread: sp, implied: sp == null || tot == null ? null : r2(tot / 2 - sp / 2) };
    }
    // each team's average points scored in completed games (baseline for the Vegas adjustment)
    const done = parseCSV(await fetchText(`${NFLV}/schedules/games.csv`)).filter(r => r.season === String(season) && r.game_type === 'REG' && has(r.home_score) && has(r.away_score));
    const pts = {};
    for (const g of done) for (const [t, v] of [[team(g.home_team), num(g.home_score)], [team(g.away_team), num(g.away_score)]]) { pts[t] = pts[t] || [0, 0]; pts[t][0] += v; pts[t][1]++; }
    out.teamPts = Object.fromEntries(Object.entries(pts).map(([t, [s, n]]) => [t, r2(s / n)]));
    const all = Object.values(out.games).map(g => g.implied).filter(v => v != null);
    out.avgImplied = all.length ? r2(all.reduce((a, b) => a + b, 0) / all.length) : null;
    ok('Betting lines', `${games.length} week ${week} games, ${games.filter(g => has(g.total_line)).length} with lines`);
  } catch (e) { fail('Betting lines', e); }

  // 7. Weather at outdoor and open-roof stadiums
  try {
    let n = 0;
    const now = Date.now();
    for (const g of games) {
      const c = STADIUMS[g.stadium];
      if (!c || !g.gameday || !['outdoors', 'open'].includes(g.roof)) continue;
      const days = (Date.parse(g.gameday) - now) / 864e5;
      if (days < -1 || days > 15) continue;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=America/New_York&start_date=${g.gameday}&end_date=${g.gameday}`;
      const j = JSON.parse(await fetchText(url));
      const h = Math.min(23, parseInt(String(g.gametime).split(':')[0], 10) || 13);
      const hr = j.hourly || {};
      const w = { temp: hr.temperature_2m?.[h], wind: hr.wind_speed_10m?.[h], gust: hr.wind_gusts_10m?.[h], precip: hr.precipitation_probability?.[h] };
      for (const t of [team(g.home_team), team(g.away_team)]) if (out.games[t]) out.games[t].weather = w;
      n++;
    }
    ok('Weather', `${n} outdoor games forecast`);
  } catch (e) { fail('Weather', e); }

  // 8. FantasyPros expert consensus rankings (scraped daily by DynastyProcess)
  try {
    const rows = parseCSV(await fetchText(FP_URL));
    const posMap = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DST: 'DST' };
    let match = 0, checked = 0;
    for (const r of rows) {
      const pos = posMap[(r.pos || '').toUpperCase()]; if (!pos) continue;
      const opp = team(String(r.player_opponent || '').replace(/^(at|vs\.?|@)\s*/i, '').trim());
      const tm = team(r.team);
      if (out.games[tm]) { checked++; if (out.games[tm].opp === opp) match++; }
      const key = nkey(r.player_name, pos);
      if (out.ecr[key]) continue; // first page wins
      out.ecr[key] = [num(r.ecr), parseInt(String(r.pos_rank).replace(/\D/g, ''), 10) || null, r2(num(r.sd)), num(r.best), num(r.worst), r.start_sit_grade || '', has(r.r2p_pts) ? num(r.r2p_pts) : null, r.scrape_date || '', has(r.player_owned_avg) ? num(r.player_owned_avg) : null];
    }
    out.ecrCurrent = checked > 0 && match / checked > 0.6;
    ok('FantasyPros consensus', `${Object.keys(out.ecr).length} players${out.ecrCurrent ? '' : ' (last week\'s rankings; this week\'s not posted yet)'}`);
  } catch (e) { fail('FantasyPros consensus', e); }

  // 9. CBS Sports: three experts' weekly rankings + consensus, and weekly projections
  try {
    const c = await buildCbs({ fetchText, season, week, nkey, games: out.games, log });
    out.cbs = c;
    ok('CBS Sports', `${Object.keys(c.proj).length} projections, ${Object.keys(c.ranks).length} expert rankings${c.ranksCurrent ? '' : ' (this week\'s rankings not posted yet)'}`);
  } catch (e) { fail('CBS Sports', e); }

  // Compact per-player output keyed like the site's other data
  const F = ['g', 'tgt', 'tmTgt', 'ay', 'tmAy', 'rec', 'recYd', 'yac', 'recEpa', 'car', 'rushYd', 'rushEpa', 'att', 'cmp', 'passEpa', 'sacks', 'passAy', 'cpoeW', 'cpoeN',
    'recFd', 'rushFd', 'rec20', 'rush10',
    'sep', 'cush', 'iay', 'yacoe', 'ryoe', 'box8', 'ttl', 'rpoe', 'ttt', 'aggr', 'ays', 'cpae',
    'xRec', 'xRecYd', 'xRecTd', 'xRushYd', 'xRushTd', 'pbpTgt', 'pbpCar', 'rzTgt', 'tmRzTgt', 'ezTgt', 'tmEzTgt', 'deepTgt', 'tmDeep', 'rz10Car', 'tmRz10Car', 'glCar', 'tmGlCar',
    'ftnTgt', 'catchable', 'contested', 'ftnDrop', 'screen', 'firstRead', 'tmFirst', 'ftnDb', 'pa', 'intWorthy', 'oop', 'blitzed', 'ftnCar', 'stacked'];
  out.fields = F;
  for (const p of Object.values(P)) {
    if (!p.pos || !p.s.g) continue;
    const key = nkey(p.name, p.pos);
    const prev = out.players[key];
    if (prev && prev[0] >= p.s.g) continue;
    out.players[key] = F.map(f => p.s[f] == null ? null : r2(p.s[f]));
  }
  log(`Advanced player records: ${Object.keys(out.players).length}`);
  return out;
}
