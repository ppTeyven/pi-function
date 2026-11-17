#!/usr/bin/env node
/**
 * Render the Pi-function banner.
 *
 * The Pi mark is embedded exactly as published at https://pi.dev/logo-auto.svg
 * (three paths, official colors). The "function" wordmark is drawn as a
 * 5x7 pixel font in white so it reads as the same blocky family.
 *
 *   node scripts/render-banner.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GLYPHS = {
  f: ["..XX.", ".X...", "XXXX.", ".X...", ".X...", ".X...", ".X..."],
  u: [".....", ".....", "X...X", "X...X", "X...X", "X..XX", ".XX.X"],
  n: [".....", ".....", "XXXX.", "X...X", "X...X", "X...X", "X...X"],
  c: [".....", ".....", ".XXXX", "X....", "X....", "X....", ".XXXX"],
  t: [".X...", ".X...", "XXXX.", ".X...", ".X...", ".X...", "..XX."],
  i: [".X...", ".....", "XX...", ".X...", ".X...", ".X...", "XXX.."],
  o: [".....", ".....", ".XXX.", "X...X", "X...X", "X...X", ".XXX."],
};

const WORD = "function";
const CELL = 26;
const ADVANCE = CELL * 6;
const PAD_X = 96;
const WIDTH = 1854;
const HEIGHT = 520;
const TEXT_X = 536;
const TEXT_Y = 169;

function wordmark() {
  const runs = [];
  for (let i = 0; i < WORD.length; i++) {
    const g = GLYPHS[WORD[i]];
    const gx = TEXT_X + i * ADVANCE;
    for (let row = 0; row < 7; row++) {
      const line = g[row];
      let col = 0;
      while (col < 5) {
        if (line[col] !== "X") { col++; continue; }
        let end = col;
        while (end < 5 && line[end] === "X") end++;
        runs.push(
          `<rect x="${gx + col * CELL}" y="${TEXT_Y + row * CELL}" width="${(end - col) * CELL}" height="${CELL}"/>`,
        );
        col = end;
      }
    }
  }
  return runs.join("\n    ");
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Pi-function">
  <title>Pi-function</title>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="36" fill="#0B0E14"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="35" fill="none" stroke="#1E2634" stroke-width="2"/>

  <!-- Pi mark: official logo, unchanged -->
  <g transform="translate(${PAD_X},80) scale(0.45)">
    <path fill="#F09082" d="M165.29 165.29H517.36V400H400V282.65H165.29Z"/>
    <path fill="#4D9ABF" d="M165.29 282.65H282.65V400H400V517.36H282.65V634.72H165.29Z"/>
    <path fill="#F1BE58" d="M517.36 400H634.72V634.72H517.36Z"/>
  </g>

  <!-- function: pixel wordmark, white -->
  <g fill="#FFFFFF" shape-rendering="crispEdges">
    ${wordmark()}
  </g>

  <!-- three pixels from the Pi palette -->
  <g shape-rendering="crispEdges">
    <rect x="${WIDTH - 150}" y="${HEIGHT - 46}" width="16" height="16" fill="#F09082"/>
    <rect x="${WIDTH - 126}" y="${HEIGHT - 46}" width="16" height="16" fill="#4D9ABF"/>
    <rect x="${WIDTH - 102}" y="${HEIGHT - 46}" width="16" height="16" fill="#F1BE58"/>
  </g>
</svg>
`;

fs.writeFileSync(path.join(root, "assets", "banner.svg"), svg);
console.log(`wrote assets/banner.svg (${svg.length} bytes)`);
