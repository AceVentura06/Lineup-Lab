// The fewest rows each source should return. A download that "works" but comes back empty or nearly
// empty used to count as success; now it is treated as a failure of that source.
export const MIN_ROWS = {
  'Sleeper projections': 150, 'Sleeper player list': 1000, 'ESPN projections': 150, 'Betting lines': 10,
  'FantasyPros consensus': 100, 'FantasyPros rest of season': 100, 'CBS Sports': 100,
  // season-to-date files: only checked from Week 3, once they have had time to fill
  'Sleeper stats': 150, 'nflverse stats': 300, 'Next Gen Stats receiving': 20, 'Next Gen Stats rushing': 10, 'Next Gen Stats passing': 10,
  'Play-by-play': 300, 'FTN charting': 1000, 'Expected points': 300, 'Snap counts': 300,
};
const SEASON_TO_DATE = new Set(['Sleeper stats', 'nflverse stats', 'Next Gen Stats receiving', 'Next Gen Stats rushing', 'Next Gen Stats passing',
  'Play-by-play', 'FTN charting', 'Expected points', 'Snap counts']);

// Returns n, or throws if the source came back with too few rows.
export function minRows(name, n, week) {
  if (!(name in MIN_ROWS)) throw new Error(`no minimum set for "${name}"`);
  const need = SEASON_TO_DATE.has(name) && week < 3 ? 0 : MIN_ROWS[name];
  if (!(n >= need)) throw new Error(`only ${n} rows (expected at least ${need})`);
  return n;
}
