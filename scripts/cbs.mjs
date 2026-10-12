// CBS Sports: weekly expert rankings (Jamey Eisenberg, Dave Richard, Heath Cummings + consensus)
// and weekly projections. Parsed from the public pages with plain string matching.
const NICK = { ARI: 'cardinals', ATL: 'falcons', BAL: 'ravens', BUF: 'bills', CAR: 'panthers', CHI: 'bears', CIN: 'bengals', CLE: 'browns',
  DAL: 'cowboys', DEN: 'broncos', DET: 'lions', GB: 'packers', HOU: 'texans', IND: 'colts', JAX: 'jaguars', KC: 'chiefs', LAC: 'chargers',
  LAR: 'rams', LV: 'raiders', MIA: 'dolphins', MIN: 'vikings', NE: 'patriots', NO: 'saints', NYG: 'giants', NYJ: 'jets', PHI: 'eagles',
  PIT: 'steelers', SEA: 'seahawks', SF: '49ers', TB: 'buccaneers', TEN: 'titans', WAS: 'commanders' };
const FIX = { JAC: 'JAX', WSH: 'WAS', LA: 'LAR', GNB: 'GB', KAN: 'KC', NOR: 'NO', SFO: 'SF', TAM: 'TB', NWE: 'NE' };
const CITY = { arizona: 'ARI', atlanta: 'ATL', baltimore: 'BAL', buffalo: 'BUF', carolina: 'CAR', chicago: 'CHI', cincinnati: 'CIN', cleveland: 'CLE',
  dallas: 'DAL', denver: 'DEN', detroit: 'DET', 'green bay': 'GB', houston: 'HOU', indianapolis: 'IND', jacksonville: 'JAX', 'kansas city': 'KC',
  'l.a. chargers': 'LAC', 'l.a. rams': 'LAR', 'los angeles chargers': 'LAC', 'los angeles rams': 'LAR', 'las vegas': 'LV', miami: 'MIA', minnesota: 'MIN',
  'new england': 'NE', 'new orleans': 'NO', 'n.y. giants': 'NYG', 'n.y. jets': 'NYJ', 'new york giants': 'NYG', 'new york jets': 'NYJ', philadelphia: 'PHI',
  pittsburgh: 'PIT', seattle: 'SEA', 'san francisco': 'SF', 'tampa bay': 'TB', tennessee: 'TEN', washington: 'WAS' };
const NICK2ABBR = Object.fromEntries(Object.entries(NICK).map(([a, n]) => [n, a]));
// Defenses: CBS rankings use nicknames ("Texans"), projections use cities ("L.A. Rams")
function dstAbbr(name, team) {
  if (NICK[team]) return team;
  const n = String(name).toLowerCase().trim();
  if (CITY[n]) return CITY[n];
  const last = n.split(/\s+/).pop();
  return NICK2ABBR[last] || null;
}
const tm = t => { t = String(t || '').trim().toUpperCase(); return FIX[t] || t; };
const dec = h => String(h).replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const txt = h => dec(String(h).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseCbsRanks(html) {
  const experts = [...html.matchAll(/FantasyRankingsTable-expertName"[^>]*>([^<]+)</g)].map(m => m[1].trim());
  const rows = html.split(/<tr class="FightTable-row FantasyRankingsTable-row"/).slice(1);
  const out = [];
  for (const r of rows) {
    const seg = r.slice(0, r.indexOf('</tr>') + 5);
    const first = (seg.match(/FantasyRankingsTable-firstName">([^<]*)</) || [])[1] || '';
    const last = (seg.match(/FantasyRankingsTable-firstInitial">[^<]*<\/span>([^<]*)</) || [])[1] || '';
    const team = tm((seg.match(/FantasyRankingsTable-teamPosition">([^<]*)</) || [])[1]);
    const tds = [...seg.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => txt(m[1]));
    if (tds.length < 4) continue;
    const name = dec(first + last).replace(/\s+/g, ' ').trim() || tds[1];
    const ranks = tds.slice(3).map(v => parseInt(v, 10)).filter(Number.isFinite);
    out.push({ name, team, opp: tm(tds[2].replace(/^@/, '')), rank: parseInt(tds[0], 10), experts: ranks });
  }
  return { experts: experts.slice(0, out[0]?.experts.length || experts.length), rows: out };
}

export function parseCbsProj(html) {
  const out = [];
  const rows = html.split('<tr class="TableBase-bodyTr').slice(1);
  for (const r of rows) {
    const seg = r.slice(0, r.indexOf('</tr>') + 5);
    const long = seg.match(/CellPlayerName--long[\s\S]*?<a [^>]*>([^<]+)<\/a>[\s\S]*?CellPlayerName-team">\s*([A-Z]+)\s*</);
    const short = seg.match(/<a [^>]*>([^<]+)<\/a>/);
    const nums = [...seg.matchAll(/TableBase-bodyTd--number[^>]*>([\s\S]*?)<\/td>/g)].map(m => parseFloat(txt(m[1])));
    if (nums.length < 2) continue;
    const fpts = nums[nums.length - 2];
    if (!Number.isFinite(fpts)) continue;
    out.push({ name: dec(long ? long[1].trim() : (short ? short[1].trim() : '')), team: long ? tm(long[2]) : '', pts: fpts });
  }
  return out;
}

// Fetch every position for one week; key rows with the site's player key function.
export async function buildCbs({ fetchText, season, week, nkey, games, log = () => {} }) {
  const POS = [['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'], ['TE', 'TE'], ['K', 'K'], ['DST', 'DST']];
  const ranks = {}, proj = {}, experts = new Set();
  let checked = 0, match = 0;
  for (const [pos, cbsPos] of POS) {
    const key = (name, team) => { if (pos !== 'DST') return nkey(name, pos); const a = dstAbbr(name, team); return a ? 'def:' + NICK[a] : null; };
    try {
      const r = parseCbsRanks(await fetchText(`https://www.cbssports.com/fantasy/football/rankings/ppr/${cbsPos}/weekly/`));
      r.experts.forEach(e => experts.add(e));
      for (const x of r.rows) {
        const g = games[x.team]; if (g) { checked++; if (g.opp === x.opp) match++; }
        const k = key(x.name, x.team); if (k && !ranks[k]) ranks[k] = [x.rank, ...x.experts];
      }
    } catch (e) { log(`CBS ${pos} rankings failed: ${e.message}`); }
    try {
      for (const x of parseCbsProj(await fetchText(`https://www.cbssports.com/fantasy/football/stats/${cbsPos}/${season}/${week}/projections/ppr/`))) {
        const k = key(x.name, x.team); if (k && proj[k] == null) proj[k] = x.pts;
      }
    } catch (e) { log(`CBS ${pos} projections failed: ${e.message}`); }
  }
  const current = checked > 0 && match / checked > 0.6;
  return { experts: [...experts], ranks: current ? ranks : {}, ranksCurrent: current, proj };
}
