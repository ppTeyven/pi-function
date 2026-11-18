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
