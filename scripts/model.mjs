// Runs the site's own projection model (the script inside index.html) in Node,
// so the updater can save exactly what the page would show. No dependencies.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const PAGE = new URL('../index.html', import.meta.url);

// A do-nothing stand-in for the browser page: any element, any method, any property.
function stub() {
  const store = {};
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'length') return 0;
      if (k === 'then') return undefined;
      return stub();
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return stub(); },
  });
}

// data: { SITE_DATA, STATS_DATA, CTX_DATA, ADV_DATA } as plain objects
export function loadModel(data) {
  const html = readFileSync(PAGE, 'utf8');
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(x => x.includes('const KEY'));
  if (!main) throw new Error('model script not found in index.html');
  const exposed = main.replace(/\}\)\(\);\s*$/, 'globalThis.__LL={S,realPlayers,weekProj,PL,SITEBY,siteVals,gameOf,onBye};})();');
  if (exposed === main) throw new Error('could not hook the model script');
  const doc = stub();
  doc.querySelectorAll = () => [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: doc, navigator: {}, location: { hash: '', search: '', href: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { replaceState() {}, pushState() {} },
    scrollTo() {}, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Image: function () {},
    ...data,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(exposed, ctx, { filename: 'index.html' });
  return ctx.__LL;
}

const SC = ['ppr', 'half', 'std'];
const r1 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;

// Every player's projection this week from each source, in all three scoring formats.
// Returns { week, players: { key: { n, pos, tm, src: { lab:[ppr,half,std], mod:[...], espn:[...], ... } } } }
export function projectAll(data) {
  const M = loadModel(data);
  const out = {};
  for (let i = 0; i < 3; i++) {
    M.S.scoring = SC[i];
    for (const p of M.realPlayers()) {
      if (M.onBye(p) || !p.opp) continue;
      const wp = M.weekProj(p);
      const o = out[p.key] = out[p.key] || { n: p.name, pos: p.pos, tm: p.team, src: {} };
      const put = (s, v) => { if (v == null || !(v > 0)) return; (o.src[s] = o.src[s] || [null, null, null])[i] = r1(v); };
      put('lab', wp.proj); put('mod', wp.model);
      const site = M.SITEBY.get(p.key);
      if (site && M.S.week === data.SITE_DATA.week) {
        const v = M.siteVals(site);
        put('espn', v.espn); put('sleeper', v.sleeper); put('cbs', v.cbs); put('fp', v.fp);
      }
      const g = M.gameOf(p);
      if (g && g.day && g.time && o.k == null) o.k = kickoff(g.day, g.time);
    }
  }
  for (const k in out) if (!Object.keys(out[k].src).length) delete out[k];
  return { week: M.S.week, players: out };
}

// Kickoff as a UTC timestamp from an Eastern date and time like "2026-10-18", "13:00".
export function kickoff(day, time) {
  const [y, m, d] = day.split('-').map(Number), [hh, mm] = String(time).split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh + 5, mm || 0);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  return guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Date.UTC(y, m - 1, d, hh, mm || 0));
}
