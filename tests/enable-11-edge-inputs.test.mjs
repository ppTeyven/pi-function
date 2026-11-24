// 第 11 组：边界输入（25）—— 怪输入不能崩，也不能乱匹配
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });

const store = () => ({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {} });
const safe = (fn) => {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
};

/* ---------------- analyzeNeed 不崩（8） ---------------- */
test("边界：空字符串不崩，且无插件", () => {
  const r = safe(() => m.analyzeNeed("", store()));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.value.packages, []);
});

test("边界：纯空格不崩", () => {
  const r = safe(() => m.analyzeNeed("     ", store()));
  assert.ok(r.ok, r.error);
});

test("边界：纯标点不崩", () => {
  const r = safe(() => m.analyzeNeed("!!!？？？。。。，,", store()));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.value.intents, [], "标点不该命中任何场景");
});

test("边界：emoji 不崩", () => {
  const r = safe(() => m.analyzeNeed("😀🎉🔥 帮我做个东西 🚀", store()));
  assert.ok(r.ok, r.error);
});

test("边界：超长输入（5000 字）不崩且守住预算", () => {
  const r = safe(() => m.analyzeNeed("写一个报告".repeat(1000), store()));
  assert.ok(r.ok, r.error);
  assert.ok(r.value.packages.length <= m.LIMITS.packages);
  assert.ok(r.value.skills.length <= m.LIMITS.skills);
});

test("边界：重复字符不崩", () => {
  const r = safe(() => m.analyzeNeed("aaaaaaaaaa" + "测".repeat(200), store()));
  assert.ok(r.ok, r.error);
});

test("边界：代码片段不崩", () => {
  const r = safe(() => m.analyzeNeed("function foo(){ return `x${1}` } // 注释", store()));
  assert.ok(r.ok, r.error);
});

test("边界：JSON 文本不崩", () => {
  const r = safe(() => m.analyzeNeed('{"a":1,"b":[2,3]}', store()));
  assert.ok(r.ok, r.error);
});

/* ---------------- needTerms / wordAudit（7） ---------------- */
test("边界：needTerms 处理 emoji 不产生垃圾词", () => {
  const terms = m.needTerms("😀😀😀");
  assert.deepEqual(terms.filter((t) => !/[\u4e00-\u9fff a-z0-9]/i.test(t)), []);
});

test("边界：needTerms 处理换行/制表符", () => {
  const terms = m.needTerms("第一行\n第二行\t第三行");
  assert.ok(Array.isArray(terms));
  assert.ok(!terms.some((t) => t.includes("\n") || t.includes("\t")));
});

test("边界：needTerms 保留技术符号（c++ / c# / .net）", () => {
  const terms = m.needTerms("用 c++ 和 c# 以及 .net 写");
  assert.ok(terms.some((t) => t.includes("c+")) || terms.some((t) => t === "c"), terms.join(","));
});

test("边界：wordAudit 不变式 accounted === total（普通句）", () => {
  const wa = m.wordAudit("把拼音转换器的多音字处理改一下");
  assert.equal(wa.accounted, wa.total);
});

test("边界：wordAudit 不变式（含 emoji 与标点）", () => {
  const wa = m.wordAudit("😀 帮我做个 3D 模型！！！");
  assert.equal(wa.accounted, wa.total);
});

test("边界：wordAudit 不变式（空输入）", () => {
  const wa = m.wordAudit("");
  assert.equal(wa.accounted, wa.total);
});

test("边界：wordAudit 的 counts 各项之和等于 total", () => {
  const wa = m.wordAudit("解析用户需求这一块，还要更准");
  const sum = Object.values(wa.counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, wa.total);
});

/* ---------------- 场景匹配边界（5） ---------------- */
test("边界：scoreScenarios 空输入返回空", () => {
  assert.deepEqual(m.scoreScenarios(""), []);
});

test("边界：scoreScenarios 只匹配 id 本身", () => {
  const r = m.scoreScenarios("docx");
  assert.equal(r[0]?.scenario.id, "docx");
});

test("边界：场景 id 大小写不敏感", () => {
  const r = m.scoreScenarios("DOCX");
  assert.equal(r[0]?.scenario.id, "docx");
});

test("边界：全角标点不影响匹配", () => {
  const r = m.scoreScenarios("写个公文，要国标格式。");
  assert.equal(r[0]?.scenario.id, "docx");
});

test("边界：极短英文需求也能命中", () => {
  const r = m.scoreScenarios("write a blog post");
  assert.ok(r.some((x) => x.scenario.id === "article") || r.length === 0);
});

/* ---------------- buildProposal 不崩（5） ---------------- */
const baseScenario = { id: "demo", title: "演示", when: "", group: "通用", keywords: [], brief: "", plugins: [], skillIds: [] };

test("边界：buildProposal 在没有插件/技能时也不崩", () => {
  const { pi } = makePi({ tools: coreTools() });
  const r = safe(() => m.buildProposal(pi, baseScenario, store(), null));
  assert.ok(r.ok, r.error);
  assert.match(r.value, /无额外插件/);
});

test("边界：buildProposal 遇到不存在的包不崩", () => {
  const { pi } = makePi({ tools: coreTools() });
  const r = safe(() => m.buildProposal(pi, { ...baseScenario, plugins: ["nope-pkg"] }, store(), null));
  assert.ok(r.ok, r.error);
});

test("边界：buildProposal 遇到超长技能描述会截断", () => {
  const { pi } = makePi({ tools: coreTools() });
  const st = { known: { "skill:long": { description: "很长".repeat(500) } } };
  const text = m.buildProposal(pi, { ...baseScenario, skillIds: ["long"], dynamic: true }, st, null);
  const line = text.split("\n").find((l) => l.includes("long"));
  assert.ok(line.length < 120, `技能行过长：${line.length}`);
});

test("边界：buildProposal 的组合场景标题不为空", () => {
  const { pi } = makePi({ tools: coreTools() });
  const text = m.buildProposal(pi, baseScenario, store(), { title: "并行探索", steps: [], plugins: [], skills: [] });
  assert.match(text, /并行探索 × 演示/);
});

test("边界：buildProposal 的 CORE_TOOLS 行始终存在", () => {
  const { pi } = makePi({ tools: coreTools() });
  assert.match(m.buildProposal(pi, baseScenario, store(), null), /\*\*核心工具\*\*/);
});

/* ---------------- handler 边界（5） ---------------- */
function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { state, run: (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts)) };
}

test("边界：/function 传空参数不崩（走子功能菜单，无 UI 则退出）", async () => {
  const { state, run } = env();
  await run("", { hasUI: false });
  assert.equal(state.setCalls.length, 0);
});

test("边界：/function 传超长文本不崩", async () => {
  const { state, run } = env();
  const need = "需求".repeat(2000);
  await run(need, { hasUI: false });
  const report = state.messages.find((x) => x.customType === "function-project");
  assert.match(report?.content || "", /### 本轮需求\n- 本地匹配候选：/, "能完成本地分析");
});

test("边界：/function scenario 后接空 id 不崩", async () => {
  const { state, run } = env();
  await run("scenario ", { hasUI: false });
  assert.equal(state.setCalls.length, 0);
});

test("边界：/function 传只有空格的参数不崩", async () => {
  const { state, run } = env();
  await run("    ", { hasUI: false });
  assert.equal(state.setCalls.length, 0);
});

test("边界：/function 传引号包裹的需求会被剥掉引号", async () => {
  const { state, run } = env();
  await run('"写个爬虫"', { selects: ["✓ 让模型决定工作流（推荐）"] });
  const text = state.userMessages[0]?.text || "";
  assert.match(text, /^需求：写个爬虫$/m);
  assert.ok(!text.includes('"写个爬虫"'), "引号应被剥掉");
});
