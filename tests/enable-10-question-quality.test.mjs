// 第 10 组：提问质量 —— 只对“像能力”的词发问（25）
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

/* ---------------- 虚词短语不问（6） ---------------- */
test("虚词短语：含「的」的短语不问（优化的点）", () => {
  assert.equal(m.isAskableTerm("优化的点"), false);
});

test("虚词短语：含「得/地」不问", () => {
  assert.equal(m.isAskableTerm("做得快"), false);
  assert.equal(m.isAskableTerm("慢慢地"), false);
});

test("虚词短语：含「了/着/过」不问", () => {
  assert.equal(m.isAskableTerm("做完了"), false);
  assert.equal(m.isAskableTerm("跟着走"), false);
});

test("虚词短语：含语气词「吗/呢/吧」不问", () => {
  assert.equal(m.isAskableTerm("行吗"), false);
  assert.equal(m.isAskableTerm("好吧"), false);
});

test("虚词短语：整句疑问式短语不问（能不能好一点）", () => {
  assert.equal(m.isAskableTerm("能不能好一点"), false);
});

test("虚词短语：截图里那句需求不再产生提问", () => {
  const words = { unmatched: ["优化的点"], unmatchedPhrases: ["优化的点"] };
  assert.deepEqual(m.unknownWordAsks(words, 3), []);
});

/* ---------------- 模态/否定词不问（6） ---------------- */
test("模态词：不能 / 能不能 不问", () => {
  assert.equal(m.isAskableTerm("不能"), false);
  assert.equal(m.isAskableTerm("能不能"), false);
});

test("模态词：是不是 / 有没有 不问", () => {
  assert.equal(m.isAskableTerm("是不是"), false);
  assert.equal(m.isAskableTerm("有没有"), false);
});

test("模态词：行不行 / 好不好 不问", () => {
  assert.equal(m.isAskableTerm("行不行"), false);
  assert.equal(m.isAskableTerm("好不好"), false);
});

test("模态词：要不要 / 会不会 / 该不该 / 对不对 不问", () => {
  for (const w of ["要不要", "会不会", "该不该", "对不对"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("模态词：可不可以 / 怎么样 不问", () => {
  assert.equal(m.isAskableTerm("可不可以"), false);
  assert.equal(m.isAskableTerm("怎么样"), false);
});

test("模态词：以否定/模态开头的 4 字以内短词不问", () => {
  for (const w of ["不织", "没做", "别动", "要改"]) assert.equal(m.isAskableTerm(w), false, w);
});

/* ---------------- 数字/碎片不问（6） ---------------- */
test("数字：50 / 100 / 3.5 不问", () => {
  for (const w of ["50", "100", "3.5"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("数字：3个 / 5天 / 2份 不问", () => {
  for (const w of ["3个", "5天", "2份"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("碎片：3d / 2k / d建模 不问", () => {
  for (const w of ["3d", "2k", "d建模"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("碎片：量词开头（首歌 / 个方案 / 次机会）不问", () => {
  for (const w of ["首歌", "个方案", "次机会"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("碎片：单字与 1-2 字母缩写不问", () => {
  for (const w of ["水", "a", "ui", "ok"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("碎片：空格/空串/null 不问", () => {
  for (const w of ["", "   ", null, undefined]) assert.equal(m.isAskableTerm(w), false);
});

/* ---------------- 真缺口仍然要问（4） ---------------- */
test("真缺口：水印 / 配音 / 字幕 都问", () => {
  for (const w of ["水印", "配音", "字幕"]) assert.equal(m.isAskableTerm(w), true, w);
});

test("真缺口：具体技术词问（webgpu）", () => {
  assert.equal(m.isAskableTerm("webgpu"), true);
});

test("真缺口：长能力词问（拼音转换器）", () => {
  assert.equal(m.isAskableTerm("拼音转换器"), true);
});

test("真缺口：数据分析 不被开头停用词误杀", () => {
  assert.equal(m.isAskableTerm("数据分析"), true, "以「数据」开头，不是停用动词");
});

/* ---------------- 提问行为（3） ---------------- */
test("提问：多个真词合并成一次", () => {
  const asks = m.unknownWordAsks({ unmatched: ["水印", "配音"], unmatchedPhrases: [] }, 3);
  assert.equal(asks.length, 1);
  assert.ok(asks[0].id.startsWith("words:"));
});

test("提问：合并后的 label 用、连接且去重", () => {
  const [ask] = m.unknownWordAsks({ unmatched: ["水印", "水印", "配音"], unmatchedPhrases: [] }, 3);
  assert.equal(ask.label, "水印、配音");
});

test("提问：超长短语（>10 字）不问", () => {
  const words = { unmatched: [], unmatchedPhrases: ["这是一个特别特别长的连续短语超过十个字"] };
  assert.deepEqual(m.unknownWordAsks(words, 3), []);
});
