// Builds Lineup Lab's data from Sleeper and ESPN.
// Pure logic: takes a fetchJson(url, headers) function so it can run in Node or a browser.
export async function build(fetchJson, { prevEspn = null, log = () => {} } = {}) {
  const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const qs = POS.map(p => 'position[]=' + p).join('&');
  const r1 = v => { v = Math.round(v * 10) / 10; return v ? String(v) : ''; };

  // --- current season / week ---
  const state = await fetchJson('https://api.sleeper.app/v1/state/nfl');
  const season = Number(state.season);
  let week = Number(state.display_week || state.week) || 1;
  if (state.season_type !== 'regular') week = state.season_type === 'pre' ? 1 : 18;
  week = Math.min(18, Math.max(1, week));

  // Our own week change: move to the next week at 3:30 AM Eastern on the Tuesday
  // after that week's last game, instead of waiting for Sleeper to switch.
  const sch = await fetchJson(`https://api.sleeper.app/schedule/nfl/regular/${season}`);
  if (state.season_type === 'regular') {
    const w2 = weekByCalendar(sch, Date.now());
    if (w2) { if (w2 !== week) log(`Sleeper says week ${week}; calendar says week ${w2}`); week = w2; }
  }
  log(`Season ${season}, week ${week}`);

  // --- Sleeper projections for this week ---
  const proj = await fetchJson(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${qs}&order_by=ppr`);
  const sleeper = proj
    .filter(x => x.stats && (x.stats.pts_ppr || 0) > 0.5 && x.player && POS.includes(x.player.position))
    .map(x => [((x.player.first_name || '') + ' ' + (x.player.last_name || '')).trim(), x.player.position,
      x.team || x.player.team || '', x.opponent || '',
      +(x.stats.pts_ppr || 0).toFixed(1), +(x.stats.pts_half_ppr || 0).toFixed(1), +(x.stats.pts_std || 0).toFixed(1)].join('|'))
    .join('\n');
  log(`Sleeper projections: ${sleeper.split('\n').length}`);

  // --- ESPN projections (unofficial API; keep last good copy if it fails) ---
  let espn = '', espnRanks = '', espnOwn = '';
  try {
    const POSN = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
    const filt = { players: { filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`00${season}`, `10${season}`, `11${season}${week}`] },
      sortPercOwned: { sortPriority: 1, sortAsc: false }, limit: 1000 } };
    const get = async ld => {
      const d = await fetchJson(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/${ld}?scoringPeriodId=${week}&view=kona_player_info`,
        { 'X-Fantasy-Filter': JSON.stringify(filt) });
      const m = {};
      for (const e of d.players || []) {
        const p = e.player;
        const s = (p.stats || []).find(s => s.scoringPeriodId === week && s.statSourceId === 1 && s.statSplitTypeId === 1);
        if (s) m[p.id] = [p.fullName, POSN[p.defaultPositionId] || p.defaultPositionId, +s.appliedTotal.toFixed(1)];
        // share of ESPN leagues where the player is rostered
        const own = e.player.ownership && e.player.ownership.percentOwned;
        if (own != null && POSN[p.defaultPositionId]) ownOut[p.id] = [p.fullName, POSN[p.defaultPositionId], +own.toFixed(1)];
        // ESPN analysts' weekly positional ranks (PPR)
        const rk = (p.rankings && p.rankings[String(week)] || []).filter(r => r.rankType === 'PPR');
        const ind = rk.filter(r => r.rankSourceId !== 0 && r.rank > 0).map(r => r.rank);
        const avg = rk.find(r => r.rankSourceId === 0 && r.averageRank)?.averageRank ?? (ind.length ? ind.reduce((a, b) => a + b, 0) / ind.length : null);
        if (avg && ind.length) rankOut[p.id] = [p.fullName, POSN[p.defaultPositionId] || p.defaultPositionId, +avg.toFixed(2), ind.length, Math.min(...ind), Math.max(...ind)];
      }
      return m;
    };
    const rankOut = {}, ownOut = {};
    const ppr = await get(3), std = await get(1);
    espn = Object.keys(ppr).filter(k => ppr[k][2] > 0.5).map(k => [ppr[k][0], ppr[k][1], ppr[k][2], std[k] ? std[k][2] : ppr[k][2]].join('|')).join('\n');
    if (!espn) throw new Error('ESPN returned no projections');
    espnRanks = Object.values(rankOut).map(r => r.join('|')).join('\n');
    espnOwn = Object.values(ownOut).map(r => r.join('|')).join('\n');
    log(`ESPN projections: ${espn.split('\n').length}, analyst rankings: ${Object.keys(rankOut).length}`);
  } catch (e) {
    log(`ESPN failed (${e.message}); ${prevEspn && prevEspn.week === week ? 'keeping last copy' : 'leaving empty'}`);
    espn = prevEspn && prevEspn.week === week ? prevEspn.text : '';
  }

  // --- schedule ---
  const teams = [...new Set(sch.flatMap(g => [g.home, g.away]))].sort();
  const opp = {};
  teams.forEach(t => opp[t] = Array(18).fill('BYE'));
  sch.forEach(g => { if (g.week >= 1 && g.week <= 18) { opp[g.home][g.week - 1] = g.away; opp[g.away][g.week - 1] = '@' + g.home; } });
  const wkGames = sch.filter(g => g.week === week), done = wkGames.filter(g => g.status === 'complete').length;

  // --- weekly stats, weeks 1..current ---
  const wk = {};
  for (let w = 1; w <= week; w++) wk[w] = await fetchJson(`https://api.sleeper.app/stats/nfl/${season}/${w}?season_type=regular&${qs}`);
  const weeks = Object.keys(wk).map(Number);

  const F = ['pts_ppr','pts_half_ppr','pts_std','off_snp','tm_off_snp','pass_att','pass_cmp','pass_yd','pass_td','pass_int','pass_air_yd','pass_rz_att','pass_sack','rush_att','rush_yd','rush_td','rush_yac','rush_btkl','rush_rz_att','rush_fd','rec_tgt','rec','rec_yd','rec_td','rec_air_yd','rec_yar','rec_rz_tgt','rec_drop','rec_fd','fum_lost','fgm','fga','fgm_50p','xpm','xpa','def_sack','def_int','def_fum_rec','def_td','pts_allow'];
  const TF = ['pass_att','rush_att','rec_tgt','rec_air_yd','rush_rz_att','rec_rz_tgt'];
  const team = {};
  for (const w of weeks) for (const e of wk[w]) {
    const s = e.stats || {}, pos = e.player?.position;
    if (!e.team || pos === 'DEF' || pos === 'K') continue;
    const k = w + e.team; team[k] = team[k] || {};
    for (const f of TF) team[k][f] = (team[k][f] || 0) + (s[f] || 0);
  }
  const P = {}, dst = {};
  for (const w of weeks) for (const e of wk[w]) {
    const s = e.stats || {}, pl = e.player;
    if (!pl || !POS.includes(pl.position)) continue;
    if (pl.position === 'DEF' && e.team && !(s.pts_allow == null && !s.gp)) {
      const d = dst[e.team] = dst[e.team] || [0, 0, 0, 0, 0, 0];
      d[0] += s.sack || 0; d[1] += s.int || 0; d[2] += s.fum_rec || 0; d[3] += s.yds_allow || 0; d[4] += (s.def_td || 0) + (s.st_td || 0); d[5] += s.safe || 0;
    }
    const played = (s.gp || 0) > 0 || (pl.position === 'DEF' && s.pts_allow != null) || (s.off_snp || 0) > 0;
    if (!played) continue;
    const id = e.player_id;
    const p = P[id] = P[id] || { name: ((pl.first_name || '') + ' ' + (pl.last_name || '')).trim(), pos: pl.position, team: e.team, gp: 0, t: {}, tm: {}, w: {} };
    p.team = e.team; p.gp++;
    for (const f of F) p.t[f] = (p.t[f] || 0) + (s[f] || 0);
    const tt = team[w + e.team] || {};
    for (const f of TF) p.tm[f] = (p.tm[f] || 0) + (tt[f] || 0);
    p.w[w] = [+(s.pts_ppr || 0).toFixed(1), s.rec || 0, s.pass_td || 0, s.tm_off_snp ? Math.round(100 * (s.off_snp || 0) / s.tm_off_snp) : ''];
  }
  const rows = Object.values(P).filter(p => p.t.pts_ppr >= 3 || p.pos === 'K' || p.pos === 'DEF')
    .map(p => [p.name, p.pos, p.team, p.gp, ...F.map(f => r1(p.t[f])), ...TF.map(f => r1(p.tm[f])),
      weeks.map(w => p.w[w] ? p.w[w].join(':') : '-').join(';')].join('|')).join('\n');
  const dstText = Object.entries(dst).map(([t, a]) => t + '|' + a.join('|')).join('\n');
  log(`Player stat rows: ${rows.split('\n').length}`);

  // --- fantasy points allowed by each defense, completed weeks only ---
  const al = {}, gm = {};
  for (const w of weeks.filter(w => w < week)) {
    const seen = new Set();
    for (const e of wk[w]) {
      const s = e.stats || {}, pos = e.player?.position;
      if (!POS.includes(pos) || !e.team) continue;
      if (!(s.gp > 0) && pos !== 'DEF') continue;
      if (pos === 'DEF' && s.pts_allow == null) continue;
      const o = (opp[e.team] || [])[w - 1];
      if (!o || o === 'BYE') continue;
      const def = o.replace('@', '');
      al[def] = al[def] || {}; al[def][pos] = (al[def][pos] || 0) + (s.pts_ppr || 0);
      const k = def + w; if (!seen.has(k)) { seen.add(k); gm[def] = (gm[def] || 0) + 1; }
    }
  }
  const ranks = {};
  POS.forEach(p => {
    teams.map(t => [t, (al[t]?.[p] || 0) / (gm[t] || 1)]).sort((a, b) => a[1] - b[1])
      .forEach(([t, v], i) => { ranks[t] = ranks[t] || {}; ranks[t][p] = [i + 1, +v.toFixed(1)]; });
  });

  // --- injuries ---
  const pl = await fetchJson('https://api.sleeper.app/v1/players/nfl');
  const inj = Object.values(pl)
    .filter(p => p.injury_status && POS.includes(p.position) && p.team && p.active !== false && (p.search_rank || 9999) < 600)
    .map(p => [p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim(), p.position, p.team, p.injury_status].join('|')).join('\n');

  const through = week === 1 && !done ? 'No games played yet'
    : done >= wkGames.length ? `Weeks 1–${week}`
    : `Weeks 1–${week - 1}` + (done ? ` plus ${done} of ${wkGames.length} week ${week} games` : '');

  return {
    season, week, through,
    sites: { week, sleeper, espn, espnRanks, espnOwn, yahoo: '' },
    stats: { through, fields: ['name', 'pos', 'team', 'gp', ...F, 'tm_pass_att', 'tm_rush_att', 'tm_tgt', 'tm_air', 'tm_rz_rush', 'tm_rz_tgt', 'weeks'], rows, dst: dstText },
    ctx: {
      sched: teams.map(t => t + '|' + opp[t].join(',')).join('\n'),
      ranks: teams.map(t => t + '|' + POS.map(p => ranks[t][p].join(':')).join(',')).join('\n'),
      inj,
      // Sleeper player ids, used for headshots on player pages
      ids: Object.entries(P).filter(([, p]) => p.pos !== 'DEF').map(([id, p]) => [p.name, p.pos, id].join('|')).join('\n')
    },
    espnCache: { week, text: espn }
  };
}

// UTC time of 3:30 AM in New York on a given calendar date (handles daylight saving).
function nyTime(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh + 5, mm);           // assume EST first
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess - (shown - Date.UTC(y, m - 1, d, hh, mm));
}
// The current week: the first week whose switch-over (Tuesday 3:30 AM ET after its last game) hasn't happened yet.
export function weekByCalendar(sch, now) {
  const last = {};
  for (const g of sch) { if (!g.date || !(g.week >= 1 && g.week <= 18)) continue; if (!last[g.week] || g.date > last[g.week]) last[g.week] = g.date; }
  if (!Object.keys(last).length) return null;
  for (let w = 1; w <= 18; w++) {
    if (!last[w]) continue;
    const [y, m, d] = last[w].split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0 = Sunday
    const add = ((2 - dow + 7) % 7) || 7;                      // the next Tuesday after the last game
    const t = new Date(Date.UTC(y, m - 1, d + add));
    if (now < nyTime(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 3, 30)) return w;
  }
  return 18;
}
