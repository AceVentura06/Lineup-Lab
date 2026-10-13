// Recent news for each player: headlines from ESPN (tagged by player) plus NFL feeds from
// CBS Sports, Yahoo Sports and ProFootballTalk (matched by full name). Links go to the source.
import { nkey } from './adv.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const RSS = [
  ['CBS Sports', 'https://www.cbssports.com/rss/headlines/nfl/'],
  ['Yahoo Sports', 'https://sports.yahoo.com/nfl/rss/'],
  ['ProFootballTalk', 'https://profootballtalk.nbcsports.com/feed/'],
];
const MAX_AGE = 30 * 864e5, PER_PLAYER = 3;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
const clean = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const blurb = s => { s = clean(s); return s.length > 180 ? s.slice(0, 177).replace(/\s+\S*$/, '') + '…' : s; };
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };

function parseRss(xml, source) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([it]) => ({
    title: clean(tag(it, 'title')), url: clean(tag(it, 'link')) || clean(tag(it, 'guid')),
    date: Date.parse(clean(tag(it, 'pubDate')) || clean(tag(it, 'dc:date'))), text: blurb(tag(it, 'description')), source,
  })).filter(a => a.title && /^https?:\/\//.test(a.url) && Number.isFinite(a.date));
}

// players: [{ name, pos }] (offense, kickers). Returns { key: [[title, source, url, isoDate, blurb], ...] }
export async function buildNews({ fetchJson, fetchText, players, log = () => {} }) {
  // full-name lookup; names shared by two players are skipped to avoid wrong matches
  const count = new Map();
  for (const p of players) if (p.pos !== 'DEF' && p.pos !== 'DST') { const k = nkey(p.name, p.pos); count.set(k, (count.get(k) || 0) + 1); }
  const byName = new Map([...count].filter(([, n]) => n === 1).map(([k]) => [k, k]));
  const out = {}, seen = new Set(), now = Date.now(), stats = {};
  const add = (key, a) => {
    if (!byName.has(key) || now - a.date > MAX_AGE) return;
    const id = key + '|' + a.url; if (seen.has(id)) return; seen.add(id);
    (out[key] = out[key] || []).push(a); stats[a.source] = (stats[a.source] || 0) + 1;
  };

  // ESPN: league feed and every team's feed; articles are tagged with the players they cover
  let espnN = 0;
  try {
    const teams = (await fetchJson(`${ESPN}/teams`)).sports[0].leagues[0].teams.map(t => t.team.id);
    const feeds = [`${ESPN}/news?limit=100`, ...teams.map(id => `${ESPN}/news?team=${id}&limit=50`)];
    for (const u of feeds) {
      let d; try { d = await fetchJson(u); } catch { continue; }
      for (const x of d.articles || []) {
        const url = x.links?.web?.href, date = Date.parse(x.published || x.lastModified);
        if (!url || !Number.isFinite(date)) continue;
        espnN++;
        const a = { title: clean(x.headline), url, date, text: blurb(x.description), source: 'ESPN' };
        for (const c of x.categories || []) if (c.type === 'athlete' && c.description) add(nkey(c.description, ''), a);
      }
    }
  } catch (e) { log(`ESPN news failed: ${e.message}`); }

  // RSS feeds: match full names in the headline or summary
  const names = [...byName.keys()].map(k => [k, new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s.\'’-]+')}\\b`, 'i')]);
  for (const [source, url] of RSS) {
    try {
      const items = parseRss(await fetchText(url), source);
      for (const a of items) {
        const hay = (a.title + ' ' + a.text).toLowerCase().replace(/[.'’]/g, '');
        for (const [k, re] of names) if (re.test(hay)) add(k, a);
      }
    } catch (e) { log(`${source} news failed: ${e.message}`); }
  }

  const res = {};
  for (const [k, list] of Object.entries(out)) {
    // newest first; one article per headline
    const uniq = new Map();
    for (const a of list.sort((x, y) => y.date - x.date)) if (!uniq.has(a.title.toLowerCase())) uniq.set(a.title.toLowerCase(), a);
    res[k] = [...uniq.values()].slice(0, PER_PLAYER).map(a => [a.title, a.source, a.url, new Date(a.date).toISOString(), a.text]);
  }
  const detail = `${Object.keys(res).length} players with news (ESPN ${espnN} articles scanned; ${Object.entries(stats).map(([s, n]) => `${s} ${n}`).join(', ') || 'no matches'})`;
  return { news: res, detail };
}
