// Checks the Home banner play (svg#hmPlay in index.html): every route and the pass must stay at least
// 7px (viewBox units) from every player and defender except the one it starts from. Exits 1 on a collision.
// Run: node scripts/play-check.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const GAP = 7;

// Sample points along an absolute-command path (M L H V Q C), which is all the banner uses.
export function samplePath(d, steps = 60) {
  const t = d.match(/[MLHVQC]|-?\d*\.?\d+/g), pts = [];
  let i = 0, cmd = '', x = 0, y = 0;
  const n = () => +t[i++];
  while (i < t.length) {
    if (/[A-Z]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M') { x = n(); y = n(); pts.push([x, y]); cmd = 'L'; continue; }
    const seg = cmd === 'L' ? [[n(), n()]] : cmd === 'H' ? [[n(), y]] : cmd === 'V' ? [[x, n()]]
      : cmd === 'Q' ? [[n(), n()], [n(), n()]] : cmd === 'C' ? [[n(), n()], [n(), n()], [n(), n()]] : null;
    if (!seg) throw new Error(`unsupported path command ${cmd} in ${d}`);
    const p = [[x, y], ...seg];
    for (let s = 1; s <= steps; s++) {   // de Casteljau works for lines (2 points) and curves alike
      let q = p, u = s / steps;
      while (q.length > 1) q = q.slice(1).map((b, k) => [q[k][0] + (b[0] - q[k][0]) * u, q[k][1] + (b[1] - q[k][1]) * u]);
      pts.push(q[0]);
    }
    [x, y] = seg[seg.length - 1];
  }
  return pts;
}

// Distance from a mark's edge to the nearest sampled point.
const gap = (pts, m) => Math.min(...pts.map(([x, y]) => Math.hypot(x - m.x, y - m.y))) - m.r;

export function collisions(svg) {
  const g = cls => (svg.match(new RegExp(`<g class="${cls}"[^>]*>([\\s\\S]*?)</g>`)) || [])[1] || '';
  const attr = (el, a) => +(el.match(new RegExp(`\\b${a}="([-\\d.]+)"`)) || [])[1];
  const marks = [];
  for (const c of g('hm-o').match(/<circle[^>]*>/g) || []) marks.push({ name: 'player', x: attr(c, 'cx'), y: attr(c, 'cy'), r: attr(c, 'r') });
  for (const c of g('hm-o').match(/<rect[^>]*>/g) || []) { const w = attr(c, 'width'); marks.push({ name: 'player', x: attr(c, 'x') + w / 2, y: attr(c, 'y') + w / 2, r: w / 2 }); }
  // each defender is drawn "M(x-h) (y-h)l2h 2h M(x+h) (y-h)l-2h 2h"; its reach is the tip of the X
  const xd = (g('hm-x').match(/d="([^"]*)"/) || [])[1] || '';
  for (const m of xd.matchAll(/M([-\d.]+) ([-\d.]+)l([-\d.]+) [-\d.]+M[-\d.]+ [-\d.]+l-[-\d.]+ [-\d.]+/g)) {
    const h = +m[3] / 2;
    marks.push({ name: 'defender', x: +m[1] + h, y: +m[2] + h, r: h * Math.SQRT2 });
  }
  const lines = [...(g('hm-r').match(/d="[^"]*"/g) || []), ...(svg.match(/<path[^>]*mask="[^"]*"[^>]*>/g) || []).map(p => p.match(/d="[^"]*"/)[0])]
    .map(a => a.slice(3, -1));
  const bad = [];
  for (const d of lines) {
    const pts = samplePath(d), own = marks.reduce((a, m) => (gap([pts[0]], m) < gap([pts[0]], a) ? m : a));
    for (const m of marks) if (m !== own && gap(pts, m) < GAP) bad.push(`${d} passes ${gap(pts, m).toFixed(1)}px from the ${m.name} at (${m.x},${m.y})`);
  }
  return { bad, lines: lines.length, marks: marks.length };
}

// self-check: a line straight through a player is caught, one well clear is not
assert.equal(collisions('<g class="hm-o"><circle cx="0" cy="50" r="9"/><circle cx="50" cy="0" r="9"/></g><g class="hm-r"><path d="M0 40V0H100"/></g>').bad.length, 1);
assert.equal(collisions('<g class="hm-o"><circle cx="0" cy="50" r="9"/><circle cx="50" cy="30" r="9"/></g><g class="hm-r"><path d="M0 40V0H100"/></g>').bad.length, 0);

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const svg = (html.match(/<svg class="hm-play"[\s\S]*?<\/svg>/) || [])[0];
if (!svg) { console.error('play-check: svg.hm-play not found in index.html'); process.exit(1); }
const { bad, lines, marks } = collisions(svg);
if (bad.length) { console.error(`play-check: ${bad.length} collision(s)\n  ` + bad.join('\n  ')); process.exit(1); }
console.log(`play-check: ok (${lines} lines clear of ${marks} players and defenders by ${GAP}px)`);
