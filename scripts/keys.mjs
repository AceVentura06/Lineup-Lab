// The one place player keys are made. Players are matched across sources by cleaned-up name
// (defenses by nickname), so every script and the page must build keys the same way.
// The page gets ALIAS through SITE_DATA.alias; keys.test.mjs checks its key function against this one.
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

// Different spellings of one player -> one key.
export const ALIAS = { 'mitchell tinsley': 'mitch tinsley', 'marquise brown': 'hollywood brown', 'gabe davis': 'gabriel davis',
  'chigoziem okonkwo': 'chig okonkwo', 'josh palmer': 'joshua palmer', 'matthew hibner': 'matt hibner' };

export function nkey(name, pos) {
  if (pos === 'DEF' || pos === 'DST') { const w = String(name).replace(/D\/ST/i, '').trim().split(/\s+/); return 'def:' + w[w.length - 1].toLowerCase(); }
  const k = String(name).toLowerCase().replace(/[.'’]/g, '').replace(SUFFIX, '').replace(/\s+/g, ' ').trim();
  return ALIAS[k] || k;
}

// Two different players that land on the same key would silently share stats and projections.
// rows: the stats file's "name|pos|team|..." lines. Returns [[key, ['Name (POS, TEAM)', ...]], ...].
export function collisions(rows) {
  const seen = new Map();
  for (const line of String(rows || '').split('\n')) {
    if (!line) continue;
    const [name, pos, team] = line.split('|'), k = nkey(name, pos);
    seen.set(k, [...(seen.get(k) || []), `${name} (${pos}, ${team})`]);
  }
  return [...seen].filter(([, who]) => who.length > 1);
}
