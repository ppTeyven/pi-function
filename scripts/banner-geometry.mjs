/**
 * Shared geometry for the banner renderers (SVG + GIF).
 * Everything is derived here so the two outputs can never drift apart.
 */

export const WORD = "function";
export const CELL = 26; // one pixel of the wordmark, in SVG units
export const GAP = 1; // empty columns between the ink of two letters (1 cell = 26px)
export const TEXT_X = 536;
// 偶数：GIF 用 2×2 盒式滤波降采样，奇数起点会让每一行字边都掺进半像素灰
export const TEXT_Y = 168;
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

/**
 * Pi mark points in banner coordinates.
 * The polygons above are the raw 256-grid logo; the published banner places them
 * with `translate(96,80) scale(0.45)`. Apply that exactly once — the SVG emits it
 * as a <g transform>, the GIF renderer calls this directly.
 */
export function piPoints(polygon = null) {
  const { dx, dy, scale } = PI_MARK.transform;
  const place = ([x, y]) => [x * scale + dx, y * scale + dy];
  return polygon ? polygon.points.map(place) : PI_MARK.polygons.map((p) => p.points.map(place));
}

/** Bounding box of the placed Pi mark: [x0, y0, x1, y1]. */
export const PI_BOX = (() => {
  const pts = piPoints().flat();
  return [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ];
})();

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

/**
 * Animation timings shared by the SVG (CSS) and the GIF (raster).
 *
 * The motion is a travelling wave through the pixel grid itself: every 26px
 * block of the wordmark bobs on its own phase, so a single letter can have its
 * cells at different heights. The crest is dimmed towards grey, which is what
 * gives the wordmark its surface: blocks tilt and shade as the wave passes.
 * No appearing/disappearing, no cross-fade — a half-transparent column reads
 * as a bar covering the letters.
 */
export const TIMING = {
  wavePeriod: 2.6, // seconds for one full wave (the GIF loop is exactly this)
  // Almost fully in phase: the wordmark lifts and settles as one block, with a
  // 2px lag at the right edge so it feels alive instead of mechanical.
  // A real wavelength inside "function" (0.785) made letters bob independently;
  // 0.08 still tilted the whole line. This is the "one wave" reading.
  wavePhaseStep: 0.02,
  waveAmplitude: 26, // px the crest rises/sinks — one full pixel cell
  waveDim: 0.28, // how much darker the crest is than a letter at rest
  breathe: 2.6, // dots share the wave period so the loop is seamless
  dotDelay: [0, 0.2, 0.4], // seconds
};

/**
 * Wave state of one pixel column at time `t`: how far its blocks rise and how
 * bright they are. Driven per column, not per letter — that is what makes the
 * wave read as a surface passing through the glyphs instead of whole letters
 * bobbing. The lift is quantised to whole 2px steps so the 2x2 box filter never
 * blends half a pixel of grey into a stroke; the dimming is deliberate.
 */
export function waveAt(col, t) {
  const phase = (2 * Math.PI * t) / TIMING.wavePeriod - col * TIMING.wavePhaseStep;
  const s = Math.sin(phase);
  // Symmetric around rest: the crest rises, the trough sinks. Clamping at 0
  // (the old behaviour) made blocks jump upward and never settle down.
  const lift = Math.round((TIMING.waveAmplitude * s) / 2) * 2;
  return { dy: -lift, alpha: 1 - TIMING.waveDim * Math.max(0, s) };
}

/**
 * Which letter a block belongs to (0..7), not which pixel column.
 *
 * Waves are driven per letter on purpose: one glyph is 5 cells wide, and
 * driving each cell on its own phase made a single letter slope inside itself
 * — the wordmark looked chopped rather than moving. Per-letter keeps every
 * glyph rigid and lets the wave pass through the whole word.
 */
export function columnOf(x) {
  return Math.floor(Math.max(0, x - TEXT_X) / (CELL * 6));
}

/** Seconds of animation per loop (the GIF ships exactly this many frames). */
export const LOOP_SECONDS = TIMING.wavePeriod;
