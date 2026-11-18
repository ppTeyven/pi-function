#!/usr/bin/env node
/**
 * Render the Pi-function banner as SVG.
 *
 * Pi mark: embedded exactly as published at https://pi.dev/logo-auto.svg
 * (three paths, official colours).
 *
 * "function": a 5x7 pixel font rendered as crisp rects. Letters are laid out
 * by **ink edge**, not by a fixed advance — every gap between two letters is
 * the same number of pixels, so "f u n c t i o n" no longer looks like
 * "f  u  n  c  t  i  o  n".
 *
 * Motion is stepwise on purpose: the three Pi blocks land, then the wordmark
 * types in letter by letter with a block caret. Nothing fades or slides at
 * partial opacity over the text — the earlier per-column fade read as a
 * translucent bar covering the letters. The animation is additive: a renderer
 * that strips <style> (GitHub's README sanitiser does) falls back to the fully
 * visible, correctly spaced wordmark.
 *
 * The README uses the GIF (scripts/render-banner-gif.mjs) because GitHub strips
 * <style>; both renderers follow the same timeline from banner-geometry.mjs.
 *
 *   node scripts/render-banner.mjs            # animated banner
 *   node scripts/render-banner.mjs --static   # no <style> at all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WORD, CELL, GAP, TEXT_X, TEXT_Y, WIDTH, HEIGHT, RADIUS, PAD_X,
  BG, BORDER, INK, PI_FILLS, PI_MARK, layout, TIMING, letterAt, entranceEnd,
} from "./banner-geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATIC = process.argv.includes("--static");
const { letters, gaps, end } = layout();
const WORD_TOP = TEXT_Y;
const WORD_BOTTOM = TEXT_Y + 7 * CELL;
const ms = (seconds) => Math.round(seconds * 1000);

const style = STATIC
  ? ""
  : `  <style>
    /* 打字式入场：整块出现（steps），没有任何半透明覆盖 */
    @keyframes type { from { opacity: 0 } to { opacity: 1 } }
    @keyframes caretOn { 0%, 49.9% { opacity: 1 } 50%, 100% { opacity: 0 } }
    @keyframes off { to { opacity: 0 } }
    @keyframes breathe { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
    .px { opacity: 0; animation: type 1ms steps(1) forwards }
    .caret { opacity: 0; animation: caretOn ${ms(TIMING.caretBlink)}ms steps(1) infinite, off 1ms steps(1) forwards }
    .dot { animation: breathe ${ms(TIMING.breathe)}ms ease-in-out infinite }
    @media (prefers-reduced-motion: reduce) {
      .px { animation: none; opacity: 1 }
      .caret { display: none }
      .dot { animation: none }
    }
  </style>
`;

const cls = (name, delay) =>
  STATIC ? "" : ` class="${name}" style="animation-delay:${delay}"`;

// 三块 Pi 依次落位
const mark = PI_MARK.polygons
  .map((poly, k) => {
    const d = poly.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("") + "Z";
    return `<path fill="${poly.fill}" d="${d}"${cls("px", `${ms(k * TIMING.markStep)}ms`)}/>`;
  })
  .join(String.fromCharCode(10) + "    ");

const wordmark = letters
  .flatMap((letter, li) =>
    letter.runs.map((r) => {
      // 整个字母共用一个延迟：一次出现，不是逐列浮现
      const c = cls("px", `${ms(letterAt(li))}ms`);
      // data-letter 让测试能机械地断言“每个间隙一样宽”
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" data-letter="${li}"${c}/>`;
    }),
  )
  .join(String.fromCharCode(10) + "    ");

// 打字光标：每个位置一个 rect，只在它的时间窗里闪
const carets = STATIC
  ? ""
  : Array.from({ length: letters.length }, (_, i) => i + 1) // 光标位置 p = 已打出的字母数
      .map((p) => {
        const last = letters[p - 1];
        const x = p >= letters.length ? last.x0 + last.ink + (GAP * CELL) / 2 : letters[p].x0;
        const from = letterAt(p - 1);
        const to = p >= letters.length ? entranceEnd() : letterAt(p);
        return (
          `<rect class="caret" x="${x}" y="${TEXT_Y + 2 * CELL}" width="${CELL - 8}" height="${3 * CELL}" ` +
          `fill="${INK}" style="animation-delay:${ms(from)}ms,${ms(to)}ms"/>`
        );
      })
      .join(String.fromCharCode(10) + "    ");

const dots = PI_FILLS
  .map((fill, i) => {
    const x = WIDTH - 150 + i * 24;
    const c = cls("dot", `${ms(TIMING.dotDelay[i])}ms`);
    return `<rect x="${x}" y="${HEIGHT - 46}" width="16" height="16" fill="${fill}"${c}/>`;
  })
  .join(String.fromCharCode(10) + "    ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Pi-function">
  <title>Pi-function</title>
${style}  <rect width="${WIDTH}" height="${HEIGHT}" rx="${RADIUS}" fill="${BG}"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="${RADIUS - 1}" fill="none" stroke="${BORDER}" stroke-width="2"/>

  <!-- Pi mark: official logo, unchanged -->
  <g transform="translate(${PAD_X},${PI_MARK.transform.dy}) scale(${PI_MARK.transform.scale})">
    ${mark}
  </g>

  <!-- function: 5x7 pixel wordmark; every letter-to-letter gap is ${GAP} cells (${GAP * CELL}px) -->
  <g fill="#FFFFFF" shape-rendering="crispEdges">
    ${wordmark}
  </g>

  <!-- typing caret -->
  <g shape-rendering="crispEdges">
    ${carets}
  </g>

  <!-- three pixels from the Pi palette -->
  <g shape-rendering="crispEdges">
    ${dots}
  </g>
</svg>
`;

fs.writeFileSync(path.join(root, "assets", "banner.svg"), svg);

if (process.argv.includes("--preview")) {
  const cols = (end - TEXT_X) / CELL;
  const grid = Array.from({ length: 7 }, () => Array(cols).fill(" "));
  for (const letter of letters) {
    for (const r of letter.runs) {
      const c0 = Math.round((r.x - TEXT_X) / CELL);
      for (let c = c0; c < c0 + r.w / CELL; c++) grid[r.row][c] = "#";
    }
  }
  console.log(grid.map((row) => "|" + row.join("") + "|").join(String.fromCharCode(10)));
  console.log(`letters: ${letters.map((l) => `${l.ch}@${l.x0}(w${l.ink})`).join(" ")}`);
  console.log(`gaps: ${gaps.join(",")} (unique ${[...new Set(gaps)].join(",")})`);
}

const unique = [...new Set(gaps)];
console.log(
  `wrote assets/banner.svg (${svg.length} bytes) · ${letters.length} letters · ` +
    `gap ${unique.join(",")}px · inbox ${TEXT_X}..${end} · word ${WORD_BOTTOM - WORD_TOP}px tall · ` +
    `typing ${ms(letterAt(letters.length - 1))}ms + caret to ${ms(entranceEnd())}ms (${WORD})`,
);
