// 横幅：字母间距必须均匀，动画必须是“可剥离”的（剥离后仍是完整静态字）。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const SVG = fs.readFileSync(new URL("../assets/banner.svg", import.meta.url), "utf8");

const px = (attr, tag) => Number(tag.match(new RegExp(`${attr}="(-?\\d+)"`))?.[1]);
const rects = [...SVG.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]);
const wordRaw = rects.filter((r) => r.includes("data-letter="));
const wordRects = wordRaw
  .map((r) => ({
    letter: Number(r.match(/data-letter="(\d+)"/)[1]),
    x: px("x", r),
    y: px("y", r),
    w: px("width", r),
    h: px("height", r),
  }));

test("B1 每个字母的墨迹范围可算出来，且相邻字母的间隙完全一致", () => {
  assert.ok(wordRects.length > 30, `rect 太少：${wordRects.length}`);
  const byLetter = new Map();
  for (const r of wordRects) {
    const cur = byLetter.get(r.letter) || { min: Infinity, max: -Infinity };
    cur.min = Math.min(cur.min, r.x);
    cur.max = Math.max(cur.max, r.x + r.w);
    byLetter.set(r.letter, cur);
  }
  const letters = [...byLetter.keys()].sort((a, b) => a - b);
  assert.deepEqual(letters, [0, 1, 2, 3, 4, 5, 6, 7], "function 应有 8 个字母");

  const gaps = [];
  for (let i = 1; i < letters.length; i++) {
    gaps.push(byLetter.get(letters[i]).min - byLetter.get(letters[i - 1]).max);
  }
  assert.equal(new Set(gaps).size, 1, `间隙不均：${gaps.join(",")}`);
  assert.ok(gaps[0] > 0, `字母重叠：${gaps[0]}px`);
});

test("B2 字母按顺序从左到右，没有重叠或倒序", () => {
  const x0 = (letter) => Math.min(...wordRects.filter((r) => r.letter === letter).map((r) => r.x));
  const xs = [0, 1, 2, 3, 4, 5, 6, 7].map(x0);
  const sorted = [...xs].sort((a, b) => a - b);
  assert.deepEqual(xs, sorted);
  assert.equal(new Set(xs).size, xs.length, "两个字母起点相同 = 叠在一起了");
});

test("B3 动画是可剥离的：rect 自身不带 opacity / fill=none，剥掉 <style> 仍是完整字", () => {
  for (const r of wordRaw) {
    assert.doesNotMatch(r, /opacity=/, `rect 自带 opacity，剥离样式后会消失：${r}`);
    assert.doesNotMatch(r, /fill="none"/, `rect 不可见：${r}`);
    assert.doesNotMatch(r, /display="none"/);
  }
  assert.match(SVG, /<g fill="#FFFFFF"/);
});

test("B4 动画存在且有降级策略（逐列入场 + prefers-reduced-motion）", () => {
  assert.match(SVG, /@keyframes rise/);
  assert.match(SVG, /\.px \{ animation: rise/);
  assert.match(SVG, /animation-delay:\d+ms/);
  assert.match(SVG, /prefers-reduced-motion: reduce/);
  assert.match(SVG, /class="dot"/, "三个色点也在呼吸");
});

test("B5 画布 / Pi 标记 / 无障碍标签没被改动", () => {
  assert.match(SVG, /width="1854" height="520"/);
  assert.match(SVG, /aria-label="Pi-function"/);
  assert.match(SVG, /#F09082/);
  assert.match(SVG, /#4D9ABF/);
  assert.match(SVG, /#F1BE58/);
  assert.match(SVG, /translate\(96,80\) scale\(0\.45\)/);
});

// ---- GIF：GitHub 会剥掉 SVG 的 <style>，所以动图得是一张真 GIF ----
const GIF = fs.readFileSync(new URL("../assets/banner.gif", import.meta.url));

function gifInfo(buf) {
  const w = buf.readUInt16LE(6);
  const h = buf.readUInt16LE(8);
  let i = 13 + 256 * 3; // 逻辑屏幕描述符 + 全局色表
  const frames = [];
  while (i < buf.length) {
    if (buf[i] === 0x21) {
      const label = buf[i + 1];
      i += 2;
      let delay = null;
      if (label === 0xf9) {
        delay = buf.readUInt16LE(i + 2);
        i += buf[i] + 1;
      }
      while (buf[i] !== 0) i += buf[i] + 1;
      i++;
      if (delay !== null) frames.push({ kind: "gce", delay });
    } else if (buf[i] === 0x2c) {
      const fw = buf.readUInt16LE(i + 5);
      const fh = buf.readUInt16LE(i + 7);
      i += 10;
      i++; // 最小码长
      while (buf[i] !== 0) i += buf[i] + 1;
      i++;
      const last = frames.filter((f) => f.kind === "gce").pop();
      last.fw = fw;
      last.fh = fh;
    } else break;
  }
  return { w, h, frames: frames.filter((f) => f.kind === "gce") };
}

test("B6 动图是真的 GIF89a：无限循环、帧数够、宽高比与 SVG 一致", () => {
  assert.equal(GIF.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.ok(GIF.includes(Buffer.from("NETSCAPE2.0")), "缺循环扩展，只播一遍就停");
  const { w, h, frames } = gifInfo(GIF);
  assert.equal(GIF[GIF.length - 1], 0x3b, "缺 trailer");
  assert.ok(w <= 1200, `宽 ${w}px 太大，GitHub 会二次缩放`);
  assert.ok(Math.abs(w / h - 1854 / 520) < 0.01, `宽高比 ${w}x${h} 与 SVG 不一致`);
  assert.ok(frames.length >= 40, `帧太少（${frames.length}），看起来不会动`);
  assert.ok(frames.every((f) => f.delay >= 2 && f.delay <= 200), "帧延时异常");
  assert.ok(frames.some((f) => f.fw === w && f.fh === h), "没有整帧");
  assert.ok(
    frames.filter((f) => f.fw < w).length >= 10,
    "呼吸阶段应该只有小块局部帧，否则文件会很大",
  );
});

test("B7 体积在 GitHub 能接受的范围内（< 1.5MB）", () => {
  assert.ok(GIF.length > 40 * 1024, `文件只有 ${GIF.length} 字节，可能没画上东西`);
  assert.ok(GIF.length < 1.5 * 1024 * 1024, `文件 ${GIF.length} 字节，太大了`);
});

test("B8 GIF 与 SVG 是同一套排版（共享 banner-geometry）", async () => {
  const geometry = await import("../scripts/banner-geometry.mjs");
  const { letters, gaps } = geometry.layout();
  const fromSvg = new Set(wordRects.map((r) => `${r.x},${r.y},${r.w},${r.h}`));
  const fromGeom = new Set(letters.flatMap((l) => l.runs.map((r) => `${r.x},${r.y},${r.w},${r.h}`)));
  assert.deepEqual([...fromGeom].sort(), [...fromSvg].sort(), "几何与 SVG 不一致，改一处会漏另一处");
  assert.equal(new Set(gaps).size, 1, `几何里的间隙不一致：${gaps.join(",")}`);
  assert.equal(gaps[0], 52, "间隙应与 SVG 里的一模一样");
  assert.equal(geometry.WIDTH, 1854);
  assert.equal(geometry.HEIGHT, 520);
});

test("B9 Pi 标记与 SVG 用同一个变换：不重叠、不越界、留足边距", async () => {
  const g = await import("../scripts/banner-geometry.mjs");
  const [x0, y0, x1, y1] = g.PI_BOX;
  // 标记必须在卡片内留出边距（曾经因为没套 translate/scale 而放大 2.2 倍、被底边切掉）
  assert.ok(x0 >= 24 && y0 >= 24, `标记贴边：${x0},${y0}`);
  assert.ok(x1 <= g.WIDTH - 24 && y1 <= g.HEIGHT - 24, `标记越界：${x1},${y1}`);
  // 不能压到 wordmark 的墨迹起点
  assert.ok(x1 < g.TEXT_X - 32, `标记压住了字：标记右 ${Math.round(x1)}，字起 ${g.TEXT_X}`);
  // 尺寸要和原始 logo 的 469.43 网格一致（缩放过就不对）
  assert.ok(Math.abs(x1 - x0 - 211) < 1, `标记宽 ${Math.round(x1 - x0)}，应为 211`);
  // SVG 里写死的那行 transform 必须与几何一致，否则两边会各画各的
  const { PI_MARK, PAD_X } = g;
  const t = PI_MARK.transform;
  assert.ok(
    SVG.includes(`translate(${PAD_X},${t.dy}) scale(${t.scale})`),
    "SVG 的 <g transform> 与 PI_MARK.transform 不一致",
  );
});
