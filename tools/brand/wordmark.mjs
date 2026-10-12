// Generates the Sofatap wordmark (src/assets/sofatap-wordmark.svg) as fixed outlines.
// Each letter is drawn as a centre line and expanded into a filled outline here, so the
// SVG needs no font, <text> element or network reference and looks the same everywhere.
// Usage: node tools/brand/wordmark.mjs [--out <file>]
//
// Design: a monoline, rounded lowercase "ofatap" with a geometric capital S, set at the
// weight of the app's rounded UI. Two custom touches echo the product:
//   - the counter of the "o" holds a mint dot, a fingertip touching the surface;
//   - the t's foot curls into the a beside it, so "tap" reads as one movement.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = 12.5; // stroke weight
const H = W / 2;
const XH = 52; // x-height (outer)
const CAP = 74; // cap height / ascender (outer)
const DESC = -22; // descender (outer)
const R = (XH - W) / 2; // centre-line radius of a full bowl
const BOWL_Y = XH / 2; // bowl centre height

// ---- geometry helpers (y up) ----
const arc = (cx, cy, rx, ry, from, to, step = 3) => {
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / step));
  for (let i = 0; i <= n; i += 1) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};
const line = (x1, y1, x2, y2) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
};
const join = (...parts) => parts.reduce((all, p) => all.concat(all.length ? p.slice(1) : p), []);
const area = (poly) => poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0) / 2;
const orient = (poly, positive) => ((area(poly) > 0) === positive ? poly : poly.slice().reverse());

// Expands an open centre line into a closed outline with round caps.
function stroke(pts, half = H) {
  const normals = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
  const left = pts.map((p, i) => [p[0] + normals[i][0] * half, p[1] + normals[i][1] * half]);
  const right = pts.map((p, i) => [p[0] - normals[i][0] * half, p[1] - normals[i][1] * half]);
  const cap = (p, n, forward) => {
    const base = Math.atan2(n[1], n[0]);
    const out = [];
    for (let k = 1; k < 12; k += 1) {
      const a = base + (forward ? -1 : 1) * (Math.PI * k) / 12;
      out.push([p[0] + Math.cos(a) * half, p[1] + Math.sin(a) * half]);
    }
    return forward ? out : out;
  };
  const last = pts.length - 1;
  const endCap = cap(pts[last], normals[last], true);
  const startCap = cap(pts[0], [-normals[0][0], -normals[0][1]], true);
  return orient([...left, ...endCap, ...right.reverse(), ...startCap], true);
}
// A full ring: outer and inner circles with opposite winding, so the counter stays open.
function ring(cx, cy, r, half = H) {
  return [orient(arc(cx, cy, r + half, r + half, 0, 360, 2).slice(0, -1), true), orient(arc(cx, cy, r - half, r - half, 0, 360, 2).slice(0, -1), false)];
}
const disc = (cx, cy, r) => orient(arc(cx, cy, r, r, 0, 360, 4).slice(0, -1), true);

// ---- letters: each returns { shapes, accent, left, right } in its own x space ----
function letterS() {
  // Two stacked bowls of an ellipse, slightly wider at the bottom for balance.
  const top = { cx: 0.5, cy: 52.5, rx: 16, ry: 15.25 };
  const bot = { cx: 0, cy: 21.75, rx: 18, ry: 15.5 };
  const spine = join(
    arc(top.cx, top.cy, top.rx, top.ry, 32, 270),
    arc(bot.cx, bot.cy, bot.rx, bot.ry, 90, -148),
  );
  return { shapes: [stroke(spine)], left: -bot.rx - H, right: bot.rx + H };
}
function letterO() {
  return { shapes: ring(0, BOWL_Y, R), accent: [disc(0, BOWL_Y, 4.6)], left: -R - H, right: R + H };
}
function letterF() {
  const x = 0;
  const hook = join(line(x, H, x, 56), arc(x + 13, 56, 13, 13, 180, 90), line(x + 13, 69, x + 19, 69));
  const bar = line(x - 10, XH - H, x + 15, XH - H);
  return { shapes: [stroke(hook), stroke(bar)], left: x - 10 - H, right: x + 19 + H, overhangRight: 10 };
}
function letterA() {
  const shapes = [...ring(0, BOWL_Y, R), stroke(line(R, XH - H, R, H))];
  return { shapes, left: -R - H, right: R + H };
}
function letterT(footReach) {
  const x = 0;
  const body = join(line(x, 66, x, 18), arc(x + 12, 18, 12, 12, 180, 270), line(x + 12, H, x + 12 + footReach, H));
  const bar = line(x - 10, XH - H, x + 15, XH - H);
  return { shapes: [stroke(body), stroke(bar)], left: x - 10 - H, right: x + 15 + H };
}
function letterP() {
  const shapes = [...ring(0, BOWL_Y, R), stroke(line(-R, XH - H, -R, DESC + H))];
  return { shapes, left: -R - H, right: R + H };
}

// ---- set the word with optical spacing (gaps between ink, by letter pair) ----
const glyphs = [
  ['S', letterS()],
  ['o', letterO()],
  ['f', letterF()],
  ['a', letterA()],
  ['t', letterT(4)],
  ['a', letterA()],
  ['p', letterP()],
];
// Gap from the previous glyph's right edge to this glyph's left edge.
const GAP = { 'S-o': 4.5, 'o-f': 2, 'f-a': -4, 'a-t': 3, 't-a': 0.5, 'a-p': 5.5 };

let pen = 0;
const placed = [];
glyphs.forEach(([ch, g], i) => {
  const prev = glyphs[i - 1];
  const gap = prev ? GAP[`${prev[0]}-${ch}`] : 0;
  const dx = prev ? pen + gap - g.left : -g.left;
  placed.push({ ch, g, dx });
  pen = dx + g.right;
});

const MARGIN = 2;
const minX = 0 - MARGIN;
const maxX = pen + MARGIN;
const top = CAP + MARGIN;
const bottom = DESC - MARGIN;
const width = maxX - minX;
const height = top - bottom;
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const toPath = (polys, dx) => polys.map((poly) => `M${poly.map(([x, y]) => `${fmt(x + dx - minX)} ${fmt(top - y)}`).join('L')}Z`).join('');

export function wordmarkSvg({ ink = '#F0F5F3', accent = '#98E9C4', title = 'Sofatap' } = {}) {
  const letters = placed.map((p) => toPath(p.g.shapes, p.dx)).join('');
  const dots = placed.filter((p) => p.g.accent).map((p) => toPath(p.g.accent, p.dx)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" role="img" aria-labelledby="sofatap-wordmark-title">`
    + `<title id="sofatap-wordmark-title">${title}</title>`
    + `<path fill="${ink}" fill-rule="nonzero" d="${letters}"/>`
    + `<path fill="${accent}" d="${dots}"/>`
    + '</svg>\n';
}

export const WORDMARK = { width, height, baseline: top, xHeight: XH };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'src', 'assets', 'sofatap-wordmark.svg');
  await writeFile(out, wordmarkSvg());
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${fmt(width)} x ${fmt(height)})`);
}
