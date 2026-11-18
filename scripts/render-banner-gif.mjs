#!/usr/bin/env node
/**
 * Render assets/banner.gif — the animated banner GitHub will actually play.
 *
 * GitHub strips <style> from SVGs, so the CSS animation in banner.svg only
 * runs in a browser/editor. A GIF carries its own timing, so the wordmark
 * really does rise into place on the README.
 *
 * No dependencies: the banner is flat colours and rectangles, so this script
 * rasterises the same geometry as the SVG (scripts/banner-geometry.mjs) and
 * writes a GIF89a by hand (LZW + NETSCAPE loop). Shapes stay crisp; the only
 * blending is the fade, which uses palette entries pre-mixed with the
 * background, so no dithering is needed.
 *
 *   node scripts/render-banner-gif.mjs           # assets/banner.gif
 *   node scripts/render-banner-gif.mjs --png      # also dump first/settled as PNG
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  CELL, TEXT_X, TEXT_Y, WIDTH, HEIGHT, RADIUS, BG, BORDER, INK, PI_FILLS, PI_MARK, PI_BOX, piPoints,
  layout, TIMING, waveAt, columnOf, LOOP_SECONDS,
} from "./banner-geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SS = 2; // supersample: render at 2x then box-filter down
const W = WIDTH / SS;
const H = HEIGHT / SS;
const FPS = 25; // 2.6s loop -> exactly 65 frames of 40ms, seamless
const STEP = 1 / FPS;

const { letters, gaps } = layout();

// ---------------------------------------------------------------- palette
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const bg = hex(BG);
const PALETTE = [null]; // 0 = transparent
const key = new Map();
const addColor = (rgb) => {
  const k = rgb.map((v) => Math.round(v)).join(",");
  if (key.has(k)) return key.get(k);
  const idx = PALETTE.length;
  PALETTE.push(k.split(",").map(Number));
  key.set(k, idx);
  return idx;
};
const mix = (fg, a) => [0, 1, 2].map((i) => bg[i] + (fg[i] - bg[i]) * a);
const LEVELS = 12;
addColor(bg);
addColor(hex(BORDER));
for (const fg of [INK, ...PI_FILLS]) {
  for (let i = 1; i <= LEVELS; i++) addColor(mix(hex(fg), i / LEVELS));
}
const nearest = (() => {
  const cache = new Map();
  return (r, g, b) => {
    const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    let best = 1, bestD = Infinity;
    for (let i = 1; i < PALETTE.length; i++) {
      const p = PALETTE[i];
      const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache.set(k, best);
    return best;
  };
})();

// ---------------------------------------------------------------- raster
/** Point-in-polygon (even-odd) on the supersampled canvas. */
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Same placement the SVG gets from its <g transform="translate(96,80) scale(.45)">.
const PI = PI_MARK.polygons.map((polygon) => {
  const fill = hex(polygon.fill);
  const pts = piPoints(polygon);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    fill,
    pts,
    box: [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))],
  };
});

const DOTS = PI_FILLS.map((fill, i) => ({
  x: WIDTH - 150 + i * 24,
  y: HEIGHT - 46,
  size: 16,
  fill: hex(fill),
  phase: TIMING.dotDelay[i],
}));

// The SVG canvas (1854x520) IS the raster grid; SS=2 is only the box-filter
// factor used when shrinking it to the GIF's 927x260.
const SW = WIDTH;
const SH = HEIGHT;

/** Composite one frame at time t (seconds) on the supersampled canvas. */
function render(t) {
  const buf = new Uint8ClampedArray(SW * SH * 4);
  const put = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    const o = (y * SW + x) * 4;
    const inv = 1 - a;
    buf[o] = buf[o] * inv + rgb[0] * a;
    buf[o + 1] = buf[o + 1] * inv + rgb[1] * a;
    buf[o + 2] = buf[o + 2] * inv + rgb[2] * a;
    buf[o + 3] = Math.min(255, buf[o + 3] + a * 255);
  };

  const bgc = hex(BG);
  const borderc = hex(BORDER);

  // card: rounded rect (geometry in SVG units, sampling at supersampled centres)
  for (let y = 0; y < SH; y++) {
    const py = y + 0.5;
    for (let x = 0; x < SW; x++) {
      const px = x + 0.5;
      let inside = true;
      const nearCorner = (px < RADIUS || px > WIDTH - RADIUS) && (py < RADIUS || py > HEIGHT - RADIUS);
      if (nearCorner) {
        const ccx = px < RADIUS ? RADIUS : WIDTH - RADIUS;
        const ccy = py < RADIUS ? RADIUS : HEIGHT - RADIUS;
        inside = (px - ccx) ** 2 + (py - ccy) ** 2 <= RADIUS * RADIUS;
      }
      if (!inside) continue;
      const o = (y * SW + x) * 4;
      buf[o] = bgc[0]; buf[o + 1] = bgc[1]; buf[o + 2] = bgc[2]; buf[o + 3] = 255;
    }
  }

  // 2px border ring just inside the card edge
  for (let y = 0; y < SH; y++) {
    const py = y + 0.5;
    if (py < 1 || py > HEIGHT - 1) continue;
    for (let x = 0; x < SW; x++) {
      const px = x + 0.5;
      if (px < 1 || px > WIDTH - 1) continue;
      const o = (y * SW + x) * 4;
      if (buf[o + 3] === 0) continue;
      if (px > 3 && px < WIDTH - 3 && py > 3 && py < HEIGHT - 3) continue;
      buf[o] = borderc[0]; buf[o + 1] = borderc[1]; buf[o + 2] = borderc[2];
    }
  }

  // wordmark: one whole letter at a time, and always fully opaque — a
  // half-transparent column looked like a bar sliding over the letters.
  const white = hex(INK);
  const fillRect = (x, y, w, h, a = 1) => {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) put(xx, yy, white, a);
  };
  // 波浪：字始终在屏幕上，只有起伏与明暗；波峰往上抬 6px 并压暗
  // 每个 26px 方块按自己的列相位起伏：同一字母的格子可以不在同一高度
  for (const letter of letters) {
    for (const r of letter.runs) {
      const { dy, alpha } = waveAt(columnOf(r.x), t);
      fillRect(r.x, r.y + dy, r.w, r.h, alpha);
    }
  }

  // Pi mark: static
  for (const poly of PI) {
    const [x0, y0, x1, y1] = poly.box;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!inPoly(poly.pts, x + 0.5, y + 0.5)) continue;
        put(x, y, poly.fill, 1);
      }
    }
  }

  // breathing dots
  for (const d of DOTS) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (t + d.phase)) / TIMING.breathe));
    for (let y = d.y; y < d.y + d.size; y++) for (let x = d.x; x < d.x + d.size; x++) put(x, y, d.fill, a);
  }

  return buf;
}

/** Box-filter 2x2 → indexed pixels of the target palette. */
function downsample(buf, rect = { x: 0, y: 0, w: SW, h: SH }) {
  const { x, y, w, h } = rect;
  const out = new Uint8Array((w / SS) * (h / SS));
  for (let oy = 0; oy < h / SS; oy++) {
    for (let ox = 0; ox < w / SS; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y + oy * SS + sy) * SW + (x + ox * SS + sx)) * 4;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2]; a += buf[o + 3];
        }
      }
      const n = SS * SS;
      out[oy * (w / SS) + ox] = a / n < 128 ? 0 : nearest(r / n, g / n, b / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------- GIF writer
function lzwEncode(indices, minCodeSize = 8) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let dict = new Map();
  let next = eoi + 1;
  let codeSize = minCodeSize + 1;
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(cur & 0xff); cur >>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const kk = prefix * 256 + k;
    if (dict.has(kk)) { prefix = dict.get(kk); continue; }
    emit(prefix);
    dict.set(kk, next++);
    if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    if (next > 4095) { emit(clear); dict = new Map(); next = eoi + 1; codeSize = minCodeSize + 1; }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

function blockify(bytes) {
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    blocks.push(Buffer.from([chunk.length, ...chunk]));
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

const u16 = (n) => Buffer.from([n & 0xff, (n >> 8) & 0xff]);

function gif({ width, height, palette, frames }) {
  const parts = [Buffer.from("GIF89a"), u16(width), u16(height), Buffer.from([0xf7, 0, 0])];
  const gct = Buffer.alloc(256 * 3);
  palette.forEach((c, i) => { if (c) gct.set(c, i * 3); });
  parts.push(gct);
  // NETSCAPE loop forever
  parts.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from("NETSCAPE2.0"), Buffer.from([0x03, 0x01, 0, 0, 0]));
  for (const f of frames) {
    const delay = Math.max(2, Math.round(f.delay / 10)); // centiseconds
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x05, ...u16(delay), 0, 0])); // disposal 1 (keep), transparent 0
    parts.push(Buffer.from([0x2c]), u16(f.x), u16(f.y), u16(f.w), u16(f.h), Buffer.from([0x00]));
    parts.push(Buffer.from([8]), blockify(Buffer.from(lzwEncode(f.indices, 8))));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- build
const frames = [];
for (let t = 0; t < LOOP_SECONDS; t += STEP) {
  frames.push({ x: 0, y: 0, w: W, h: H, delay: STEP * 1000, indices: downsample(render(t)) });
}

const out = gif({ width: W, height: H, palette: PALETTE, frames });
fs.writeFileSync(path.join(root, "assets", "banner.gif"), out);

if (process.argv.includes("--png")) {
  const png = (indices, w, h) => {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
      raw[o++] = 0;
      for (let x = 0; x < w; x++) {
        const c = PALETTE[indices[y * w + x]] || bg;
        raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body), 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ]);
  };
  const first = frames[0];
  fs.writeFileSync(path.join(root, ".tmp-frame-first.png"), png(first.indices, first.w, first.h));
  const settled = frames[Math.floor(frames.length * 0.25)];
  console.log(`  preview: .tmp-frame-first.png / .tmp-frame-settled.png`);
  fs.writeFileSync(path.join(root, ".tmp-frame-settled.png"), png(settled.indices, settled.w, settled.h));
}

console.log(
  `wrote assets/banner.gif (${out.length} bytes) · ${frames.length} frames · ${W}x${H} · ` +
    `loop ${LOOP_SECONDS.toFixed(2)}s · wave ${TIMING.waveAmplitude}px dim ${TIMING.waveDim} · ${PALETTE.length - 1} colours · gap ${gaps[0]}px`,
);
