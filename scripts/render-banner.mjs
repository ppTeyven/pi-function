#!/usr/bin/env node
/**
 * Render the Pi-function banner as SVG.
 *
 * Pi mark: embedded exactly as published at https://pi.dev/logo-auto.svg
 * (three paths, official colours).
 *
 * "function": a 5x7 pixel font rendered as crisp rects. Letters are laid out
 * by **ink edge**, not by a fixed advance — every gap between two letters is
 * one cell (26px), so the word reads tight instead of "f  u  n  c  t  i  o  n".
 *
 * Motion is a travelling wave: every letter stays on screen for the whole
 * loop and only bobs six pixels, with the crest dimmed towards the background
 * (the only grey in the banner). Nothing appears, disappears or cross-fades —
 * a half-transparent column reads as a bar sliding over the letters.
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
  BG, BORDER, INK, PI_FILLS, PI_MARK, layout, TIMING, columnOf,
} from "./banner-geometry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATIC = process.argv.includes("--static");
const { letters, gaps, end } = layout();
const WORD_TOP = TEXT_Y;
const WORD_BOTTOM = TEXT_Y + 7 * CELL;
const ms = (seconds) => Math.round(seconds * 1000);
const DEG = Math.PI / 180;

/** Phase delay of pixel column `col`, in seconds (negative delay = phase offset). */
const phaseSeconds = (col) => (col * TIMING.wavePhaseStep) / (2 * Math.PI) * TIMING.wavePeriod;

const style = STATIC
  ? ""
  : `  <style>
    /* 波浪：只起伏与变暗，不出现/消失 */
    @keyframes bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-${TIMING.waveAmplitude}px) } }
    @keyframes dim { 0%, 100% { opacity: 1 } 50% { opacity: ${(1 - TIMING.waveDim).toFixed(2)} } }
    .wave { animation: bob ${TIMING.wavePeriod}s ease-in-out infinite, dim ${TIMING.wavePeriod}s ease-in-out infinite }
    .dot { animation: breathe ${TIMING.breathe}s ease-in-out infinite }
    @keyframes breathe { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
    @media (prefers-reduced-motion: reduce) {
      .wave, .dot { animation: none }
    }
  </style>
`;

const cls = (name, extra = "") => (STATIC ? "" : ` class="${name}"${extra}`);

// Pi 标记：静态，变换只套一次（与 GIF 同源）
const markTransform = `translate(${PAD_X},${PI_MARK.transform.dy}) scale(${PI_MARK.transform.scale})`;
// 原始 logo 坐标 + <g transform>：与 https://pi.dev/logo-auto.svg 完全一致
const mark = PI_MARK.polygons
  .map((poly) => {
    const d = poly.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join("") + "Z";
    return `<path fill="${poly.fill}" d="${d}"/>`;
  })
  .join(String.fromCharCode(10) + "    ");

// 每个 26px 方块一个 <g>：delay 由像素列号决定，所以同一字母内也会错峰
const wordmark = letters
  .flatMap((letter, li) =>
    letter.runs.map((r) => {
      const delay = phaseSeconds(columnOf(r.x)).toFixed(3);
      const c = STATIC ? "" : ` class="wave" style="animation-delay:-${delay}s"`;
      return `<g${c}><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" data-letter="${li}"/></g>`;
    }),
  )
  .join(String.fromCharCode(10) + "    ");

const dots = PI_FILLS
  .map((fill, i) => {
    const x = WIDTH - 150 + i * 24;
    const c = cls("dot", ` style="animation-delay:-${(TIMING.dotDelay[i] * 1).toFixed(2)}s"`);
    return `<rect x="${x}" y="${HEIGHT - 46}" width="16" height="16" fill="${fill}"${c}/>`;
  })
  .join(String.fromCharCode(10) + "    ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Pi-function">
  <title>Pi-function</title>
${style}  <rect width="${WIDTH}" height="${HEIGHT}" rx="${RADIUS}" fill="${BG}"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="${RADIUS - 1}" fill="none" stroke="${BORDER}" stroke-width="2"/>

  <!-- Pi mark: official logo, unchanged -->
  <g transform="${markTransform}">
    ${mark}
  </g>

  <!-- function: 5x7 pixel wordmark; every letter-to-letter gap is ${GAP} cell (${GAP * CELL}px) -->
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
  console.log(`letters: ${letters.map((l) => `${l.ch}@${l.x0}(w${l.ink})`).join(" ")}`);
  console.log(`gaps: ${gaps.join(",")} (unique ${[...new Set(gaps)].join(",")})`);
}

const unique = [...new Set(gaps)];
console.log(
  `wrote assets/banner.svg (${svg.length} bytes) · ${letters.length} letters · ` +
    `gap ${unique.join(",")}px · inbox ${TEXT_X}..${end} · word ${WORD_BOTTOM - WORD_TOP}px tall · ` +
    `wave ${TIMING.waveAmplitude}px / ${TIMING.wavePeriod}s / dim ${TIMING.waveDim} (${WORD})`,
);
