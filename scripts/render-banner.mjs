#!/usr/bin/env node
/**
 * Render the Pi-function banner.
 *
 * Pi mark: embedded exactly as published at https://pi.dev/logo-auto.svg
 * (three paths, official colours).
 *
 * "function": a 5x7 pixel font rendered as crisp rects. Letters are laid out
 * by **ink edge**, not by a fixed advance — every gap between two letters is
 * the same number of pixels, so "f u n c t i o n" no longer looks like
 * "f  u  n c t  i o  n". The animation is pure CSS inside the SVG and is
 * additive: any renderer that strips <style> (GitHub's README sanitiser does)
 * falls back to the fully visible, correctly spaced wordmark.
 *
 *   node scripts/render-banner.mjs            # animated banner
 *   node scripts/render-banner.mjs --static   # no <style> at all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WORD, CELL, GAP, TEXT_X, TEXT_Y, WIDTH, HEIGHT, RADIUS, PAD_X,
  BG, BORDER, INK, PI_FILLS, PI_MARK, layout, TIMING,
} from "./banner-geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");



const STATIC = process.argv.includes("--static");
const { letters, gaps, end } = layout();
const WORD_TOP = TEXT_Y;
const WORD_BOTTOM = TEXT_Y + 7 * CELL;
const GAP_MS = TIMING.columnStep * 1000;
const DELAY = (r, li) => Math.round(((r.x - TEXT_X) / CELL) * GAP_MS + li * TIMING.letterStep * 1000);

const style = STATIC
  ? ""
  : `  <style>
    /* 入场：从下往上逐列浮现；被剥离时这些属性等于没有，字仍然完整可见 */
    @keyframes rise { from { opacity: 0; transform: translateY(${TIMING.riseDistance}px) } to { opacity: 1; transform: none } }
    @keyframes breathe { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
    .px { animation: rise ${TIMING.rise}s cubic-bezier(.22,.61,.36,1) both }
    .dot { animation: breathe ${TIMING.breathe}s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce) {
      .px, .dot { animation: none }
    }
  </style>
`;

const wordmark = letters
  .flatMap((letter, li) =>
    letter.runs.map((r) => {
      const cls = STATIC ? "" : ` class="px" style="animation-delay:${DELAY(r, li)}ms"`;
      // data-letter 让测试能机械地断言“每个间隙一样宽”
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" data-letter="${li}"${cls}/>`;
    }),
  )
  .join(String.fromCharCode(10) + "    ");

const dots = PI_FILLS
  .map((fill, i) => {
    const x = WIDTH - 150 + i * 24;
    const cls = STATIC ? "" : ` class="dot" style="animation-delay:${Math.round(TIMING.dotDelay[i] * 1000)}ms"`;
    return `<rect x="${x}" y="${HEIGHT - 46}" width="16" height="16" fill="${fill}"${cls}/>`;
  })
  .join(String.fromCharCode(10) + "    ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Pi-function">
  <title>Pi-function</title>
${style}  <rect width="${WIDTH}" height="${HEIGHT}" rx="${RADIUS}" fill="${BG}"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="${RADIUS - 1}" fill="none" stroke="${BORDER}" stroke-width="2"/>

  <!-- Pi mark: official logo, unchanged -->
  <g transform="translate(${PAD_X},80) scale(0.45)">
    <path fill="#F09082" d="M165.29 165.29H517.36V400H400V282.65H165.29Z"/>
    <path fill="#4D9ABF" d="M165.29 282.65H282.65V400H400V517.36H282.65V634.72H165.29Z"/>
    <path fill="#F1BE58" d="M517.36 400H634.72V634.72H517.36Z"/>
  </g>

  <!-- function: 5x7 pixel wordmark; every letter-to-letter gap is ${GAP} cells (${GAP * CELL}px) -->
  <g fill="#FFFFFF" shape-rendering="crispEdges">
    ${wordmark}
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
  console.log(`letters: ${letters.map((l) => `${l.ch}@${l.x0}(w${l.width})`).join(" ")}`);
  console.log(`gaps: ${gaps.join(",")} (unique ${[...new Set(gaps)].join(",")})`);
}

const unique = [...new Set(gaps)];
console.log(
  `wrote assets/banner.svg (${svg.length} bytes) · ${letters.length} letters · ` +
    `gap ${unique.join(",")}px · inbox ${TEXT_X}..${end} · word ${WORD_BOTTOM - WORD_TOP}px tall`,
);
