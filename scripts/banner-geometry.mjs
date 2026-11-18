/**
 * Shared geometry for the banner renderers (SVG + GIF).
 * Everything is derived here so the two outputs can never drift apart.
 */

export const WORD = "function";
export const CELL = 26; // one pixel of the wordmark, in SVG units
export const GAP = 2; // empty columns between the ink of two letters
export const TEXT_X = 536;
export const TEXT_Y = 169;
export const WIDTH = 1854;
export const HEIGHT = 520;
export const RADIUS = 36;
export const PAD_X = 96;

export const BG = "#0B0E14";
export const BORDER = "#1E2634";
export const INK = "#FFFFFF";
export const PI_FILLS = ["#F09082", "#4D9ABF", "#F1BE58"];

export const GLYPHS = {
  f: ["..XX.", "..X..", "XXXX.", "..X..", "..X..", "..X..", "..X.."],
  u: [".....", ".....", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  n: [".....", ".....", "XXXX.", "X...X", "X...X", "X...X", "X...X"],
  c: [".....", ".....", ".XXX.", "X....", "X....", "X....", ".XXX."],
  t: ["..X..", "..X..", "XXXX.", "..X..", "..X..", "..X..", "..XX."],
  i: ["..X..", ".....", "..X..", "..X..", "..X..", "..X..", "..X.."],
  o: [".....", ".....", ".XXX.", "X...X", "X...X", "X...X", ".XXX."],
};

/** The Pi mark, exactly as published at https://pi.dev/logo-auto.svg. */
export const PI_MARK = {
  transform: { dx: PAD_X, dy: 80, scale: 0.45 },
  polygons: [
    {
      fill: PI_FILLS[0],
      points: [
        [165.29, 165.29], [517.36, 165.29], [517.36, 400], [400, 400], [400, 282.65], [165.29, 282.65],
      ],
    },
    {
      fill: PI_FILLS[1],
      points: [
        [165.29, 282.65], [282.65, 282.65], [282.65, 400], [400, 400], [400, 517.36], [282.65, 517.36], [282.65, 634.72], [165.29, 634.72],
      ],
    },
    { fill: PI_FILLS[2], points: [[517.36, 400], [634.72, 400], [634.72, 634.72], [517.36, 634.72]] },
  ],
};

/** Ink box of one glyph: min/max column and row that actually contain ink. */
export function inkBox(glyph) {
  let minCol = 5, maxCol = -1, minRow = 7, maxRow = -1;
  glyph.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch !== "X") return;
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    });
  });
  return { minCol, maxCol, minRow, maxRow };
}

/** Letters laid out by ink edge → every letter-to-letter gap is identical. */
export function layout() {
  const letters = [];
  const gaps = [];
  let cursor = TEXT_X;
  for (const ch of WORD) {
    const glyph = GLYPHS[ch];
    const box = inkBox(glyph);
    const originX = cursor - box.minCol * CELL;
    const runs = [];
    glyph.forEach((line, row) => {
      let col = 0;
      while (col < 5) {
        if (line[col] !== "X") { col++; continue; }
        let end = col;
        while (end < 5 && line[end] === "X") end++;
        runs.push({ x: originX + col * CELL, y: TEXT_Y + row * CELL, w: (end - col) * CELL, h: CELL, row, col });
        col = end;
      }
    });
    letters.push({ ch, runs, x0: cursor, ink: (box.maxCol - box.minCol + 1) * CELL });
    cursor += (box.maxCol - box.minCol + 1) * CELL;
    gaps.push(GAP * CELL);
    cursor += GAP * CELL;
  }
  gaps.pop();
  return { letters, gaps, end: cursor - GAP * CELL };
}

/** Animation timings shared by the SVG (CSS) and the GIF (raster). */
export const TIMING = {
  rise: 0.42, // seconds, one pixel rising into place
  columnStep: 0.045, // seconds of stagger per wordmark column
  letterStep: 0.012,
  riseDistance: 10, // px of upward travel
  breathe: 3.2, // seconds per dot cycle
  dotDelay: [0, 0.26, 0.52], // seconds
};
