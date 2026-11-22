// 第 7 组：取消不能丢需求原文 + 需求按「词」而不是「碎片」解析
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, hydrate, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

hydrate(m, {
  "code-intel": { packages: ["pi-lens"] },
  testing: { packages: ["pi-test"] },
});

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { state, pi, run: (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts)) };
}

const NEED = "把拼音转换器的多音字处理改一下";

/* ==================== A. 需求文本交给模型（3） ==================== */
test("交给模型：需求文本会发成一条消息给模型", async () => {
  const { state, run } = env();
  await run(NEED);
  assert.equal(state.userMessages.length, 1);
});

test("交给模型：消息里带需求原文与装配指引", async () => {
  const { state, run } = env();
  await run(NEED);
  const text = state.userMessages[0].text;
  assert.ok(text.includes(NEED), "要带原文");
  assert.match(text, /suggest_scenario/);
  assert.match(text, /assemble_scenario/);
});

test("交给模型：只弹工作流选择，不弹场景选择，本地不装配", async () => {
  const { state, run } = env();
  await run(NEED);
  const titles = state.selectCalls.map((c) => c.title).join(" | ");
  assert.match(titles, /选工作流/, "用户先定执行方式");
  assert.ok(!/选任务场景/.test(titles), "场景由模型判断，不再让用户选");
  assert.equal(state.setCalls.length, 0, "本地不替模型装配");
});

/* ==================== B. 需求解析：词级而非碎片（8） ==================== */
test("解析：真词被保留（解析 / 需求 / 理解）", () => {
  const terms = m.needTerms("解析用户需求，更好地理解用户");
  for (const w of ["解析", "需求", "理解"]) assert.ok(terms.includes(w), `缺「${w}」：${terms.join(",")}`);
});

test("解析：不再产生 2 字滑窗碎片（解用 / 用户需）", () => {
  const terms = m.needTerms("解析用户需求");
  for (const frag of ["解用", "户需", "析用", "户需求"]) {
    assert.ok(!terms.includes(frag), `不该出现碎片「${frag}」`);
  }
});

test("解析：相邻的真词会拼成复合词（用户需求）", () => {
  assert.ok(m.needTerms("解析用户需求").includes("用户需求"), "应有复合词「用户需求」");
});

test("解析：不拼接含单字的组合（目前最 / 得目）", () => {
  const terms = m.needTerms("目前最需要改进的是解析");
  assert.ok(!terms.includes("目前最"), "单字拼接是噪声");
  assert.ok(!terms.includes("得目"));
});

test("解析：英文 token 照常保留（webgpu / pdf）", () => {
  const terms = m.needTerms("用 webgpu 渲染 pdf");
  assert.ok(terms.includes("webgpu"));
  assert.ok(terms.includes("pdf"));
});

test("解析：空输入返回空数组", () => {
  assert.deepEqual(m.needTerms(""), []);
  assert.deepEqual(m.needTerms("   "), []);
});

test("解析：虚词开头的碎片被过滤（这个 / 做个）", () => {
  const terms = m.needTerms("做个这个功能");
  assert.ok(!terms.includes("做个"));
  assert.ok(!terms.includes("这个"));
});

test("解析：词数量受控（不再爆炸）", () => {
  const need = "我还是觉得目前最需要改进的是解析用户需求这一块，用户的一整个需求是连贯的整体，不能仅凭短语来判断";
  const terms = m.needTerms(need);
  assert.ok(terms.length < 45, `切出 ${terms.length} 个 term，太多了`);
});

/* ==================== C. 泛词降权（3） ==================== */
test("降权：单个 2 字泛词不足以选中插件（< 1.5 门槛）", () => {
  const hit = m.termScoreDistinct(["理解"], "capability-aware vision understanding");
  assert.ok(hit.score < 1.5, `单个泛词得分 ${hit.score}，仍会误选`);
});

test("降权：两个 2 字泛词仍不足以选中插件", () => {
  const hit = m.termScoreDistinct(["理解", "需求"], "vision understanding for needs");
  assert.ok(hit.score < 1.5, `两个泛词得分 ${hit.score}`);
});

test("降权：具体长词仍然能选中（拼音转换器）", () => {
  const hit = m.termScoreDistinct(["拼音转换器"], "把拼音转换器做成工具");
  assert.ok(hit.score >= 1.5, `长词得分 ${hit.score} 太低`);
});
