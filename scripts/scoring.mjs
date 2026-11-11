// One scoring standard for projections and grading: ESPN default (PPR).
// Must match DEF_SC in index.html; scoring.test.mjs fails if the two drift apart.
export const ESPN = { rec: 1, te: 0, py: 25, ptd: 4, int: -2, yd: 10, td: 6, fl: -2,
  k39: 3, k40: 4, k50: 5, k60: 6, kmiss: -1, xp: 1, xpmiss: 0,
  dsack: 1, dint: 2, dfr: 2, dtd: 6, dsafe: 2, dblk: 2, pa0: 5, pa1: 4, pa7: 3, pa14: 1, pa18: 0, pa28: -1, pa35: -3, pa46: -5 };

// The rules each outside site's published numbers already use, where they differ from Sleeper's
// (pass TD 4, interception -1). The page reads this table from SITE_DATA.base to convert each site
// to the visitor's scoring. Checked 2026-11-11:
//   espn    - ESPN default leagues: interception -2.
//   cbs     - fitted from its Week 10 QB projection table (28 QBs): pass TD 6.0, interception -2.0.
//   fp      - FantasyPros' QB projection table fits pass TD 4, interception about -1 (10 QBs). The site uses
//             FantasyPros' rank-based points (r2p_pts), which publish no stat line, so this is the nearest evidence.
export const BASELINE = { sleeper: {}, espn: { int: -2 }, cbs: { ptd: 6, int: -2 }, fp: {} };

const paPts = pa => pa === '' || pa == null ? 0 : pa <= 0 ? ESPN.pa0 : pa <= 6 ? ESPN.pa1 : pa <= 13 ? ESPN.pa7 : pa <= 17 ? ESPN.pa14
  : pa <= 27 ? ESPN.pa18 : pa <= 34 ? ESPN.pa28 : pa <= 45 ? ESPN.pa35 : ESPN.pa46;

// ESPN-default PPR points for one week of a stats row (the "ppr:rec:ptd:snap:py:int:..." text split on ":").
// Offense: Sleeper's points plus the one rule that differs (interception -1 there, -2 here), which keeps
// two-point conversions and return scores that the short stat line does not carry.
// Kickers and defenses: scored from their stat lines, the same way the page does.
export function espnPoints(pos, f) {
  const v = i => +f[i] || 0, x = f.slice(11);
  if (pos === 'K' && x.length >= 7) return v(11) * ESPN.k39 + v(12) * ESPN.k40 + v(13) * ESPN.k50 + v(14) * ESPN.k60 + v(15) * ESPN.kmiss + v(16) * ESPN.xp + v(17) * ESPN.xpmiss;
  if ((pos === 'DEF' || pos === 'DST') && x.length >= 7) return v(11) * ESPN.dsack + v(12) * ESPN.dint + v(13) * ESPN.dfr + v(14) * ESPN.dtd + v(15) * ESPN.dsafe + v(16) * ESPN.dblk + paPts(f[17] === '' ? '' : +f[17]);
  if (pos === 'K' || pos === 'DEF' || pos === 'DST') return v(0);   // old rows without a stat line
  return v(0) + (ESPN.int + 1) * v(5);
}
