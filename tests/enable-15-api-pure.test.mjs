// 第 15 组：纯函数 API 全量校验（25）
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, coreTools, pkgTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] }, writing: { skills: ["grill"] } });

/* ---------------- 文本扩写与别名（4） ---------------- */
test("aliasesFor：单边命中时补另一边（watermark → 水印）", () => {
  assert.ok(m.aliasesFor("watermark").includes("水印"));
  assert.ok(m.aliasesFor("水印").includes("watermark"));
});

test("aliasesFor：两边都出现时不重复补", () => {
  assert.deepEqual(m.aliasesFor("watermark 水印"), []);
});

test("expandItemText：展开后不丢原词", () => {
  const out = m.expandItemText("watermark");
  assert.ok(out.includes("watermark"));
});

test("aliasVariants：返回变体集合（可为空）", () => {
  assert.ok(Array.isArray(m.aliasVariants("水印")));
});

test("tagRoleHits：空文本返回空对象", () => {
  assert.deepEqual(m.tagRoleHits(""), {});
});

/* ---------------- 打分与选择（6） ---------------- */
test("termScore：不做过长匹配过滤（与 termScoreDistinct 的差别）", () => {
  const a = m.termScore(["需求"], "需求解析");
  const b = m.termScoreDistinct(["需求"], "需求解析");
  assert.ok(a.score >= b.score, `termScore ${a.score} 应 ≥ distinct ${b.score}`);
});

test("termScoreDistinct：通用词不计分", () => {
  assert.equal(m.termScoreDistinct(["工具"], "工具 插件").score, 0);
});

test("selectByCoverage：无可覆盖需求时按分数保留", () => {
  const out = m.selectByCoverage([{ id: "a", score: 2 }, { id: "b", score: 1 }], 2, []);
  assert.deepEqual(out.map((x) => x.id), ["a", "b"]);
});

test("selectByCoverage：一个候选覆盖两个需求时只取它", () => {
  const out = m.selectByCoverage(
    [
      { id: "a", score: 3, roles: ["r1"] },
      { id: "b", score: 2, roles: ["r1", "r2"] },
      { id: "c", score: 2, roles: ["r2"] },
    ],
    2,
    ["r1", "r2"],
  );
  assert.deepEqual(out.map((x) => x.id), ["b"], "b 一次覆盖 r1+r2，需求覆盖完就停");
});

test("selectByCoverage：limit 为 0 返回空", () => {
  assert.deepEqual(m.selectByCoverage([{ id: "a", score: 1 }], 0, []), []);
});

test("selectByCoverage：不超过 limit", () => {
  const list = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, score: 10 - i }));
  assert.equal(m.selectByCoverage(list, 3, []).length, 3);
});

/* ---------------- 使用反馈（4） ---------------- */
test("usageBoost：无场景返回 0", () => {
  assert.equal(m.usageBoost({}, null, "pi-lens"), 0);
});

test("usageBoost：真实调用次数加分且不超过上限", () => {
  const store = { itemUse: { plugin: { "pi-lens": 1000 } } };
  assert.ok(m.usageBoost(store, "plugin", "pi-lens") <= m.USAGE_BOOST_CAP);
});

test("usageBoost：手动指定加分更高（0.8）", () => {
  const a = m.usageBoost({ manualAdds: { plugin: { x: 1 } } }, "plugin", "x");
  const b = m.usageBoost({ usage: { plugin: { x: 1 } } }, "plugin", "x");
  assert.ok(a > b);
});

test("usageBoost：npm: 前缀等价于同名", () => {
  const s = { usage: { plugin: { "pi-lens": 5 } } };
  assert.equal(m.usageBoost(s, "plugin", "npm:pi-lens"), m.usageBoost(s, "plugin", "pi-lens"));
});

/* ---------------- 摘要与文案（4） ---------------- */
test("summarizeSkills：gsd 技能折叠成一句", () => {
  const s = m.summarizeSkills(["a", "gsd-x", "gsd-y"]);
  assert.match(s, /GSD 阶段技能 2 个/);
  assert.match(s, /a/);
});

test("summarizeSkills：空数组返回空串", () => {
  assert.equal(m.summarizeSkills([]), "");
});

test("followupQuestions：普通场景 3 问", () => {
  assert.equal(m.followupQuestions({ id: "article" }, null).length, 3);
});

test("followupQuestions：plugin/api/webapp/maintain 多一问改动面", () => {
  const qs = m.followupQuestions({ id: "plugin" }, null);
  assert.equal(qs.length, 4);
  assert.ok(qs.some((q) => /改动面/.test(q)));
});

test("followupQuestions：流程场景 4 问", () => {
  const qs = m.followupQuestions({ id: "process" }, null);
  assert.equal(qs.length, 4);
});

/* ---------------- 工作流选择（4） ---------------- */
test("recommendWorkflow：maintain 场景 → debug", () => {
  assert.equal(m.recommendWorkflow(m.SCENARIOS.find((s) => s.id === "maintain")), "debug");
});

test("recommendWorkflow：report 场景 → research", () => {
  assert.equal(m.recommendWorkflow(m.SCENARIOS.find((s) => s.id === "report")), "research");
});

test("recommendWorkflow：空场景兜底 direct", () => {
  assert.equal(m.recommendWorkflow(null), "direct");
});

test("workflowById / normalizeWorkflowId：别名归一", () => {
  assert.equal(m.workflowById("debug")?.id, "debug");
  assert.equal(m.normalizeWorkflowId("debug"), "debug");
  assert.equal(m.workflowById("不存在"), null);
});

/* ---------------- 契约与目录完整性（3） ---------------- */
test("契约：每个场景都有 required/optional/forbidden", () => {
  for (const s of m.SCENARIOS) {
    const c = m.SCENARIO_CONTRACTS[s.id];
    assert.ok(c, `${s.id} 缺契约`);
    assert.ok(Array.isArray(c.required) && Array.isArray(c.optional) && Array.isArray(c.forbidden), s.id);
  }
});

test("目录：每个场景都有 group/title/when/brief/keywords", () => {
  for (const s of m.SCENARIOS) {
    assert.ok(s.group && s.title && s.when && s.brief, s.id);
    assert.ok(Array.isArray(s.keywords), s.id);
  }
});

test("目录：9 个工作流都有 steps/checkpoint/doneWhen", () => {
  assert.equal(m.WORKFLOWS.length, 9);
  for (const w of m.WORKFLOWS) {
    assert.ok(w.steps?.length, `${w.id} 缺 steps`);
    assert.ok(w.checkpoint, `${w.id} 缺 checkpoint`);
    assert.ok(w.doneWhen, `${w.id} 缺 doneWhen`);
  }
});

/* ---------------- 菜单选项（3） ---------------- */
test("menuOptions：每个场景一条，文本含 id 与插件数", () => {
  const opts = m.menuOptions({ overrides: {}, usage: {} });
  assert.equal(opts.length, m.SCENARIOS.length);
  assert.match(opts[0], /·/);
  assert.match(opts.join("\n"), /个插件|无需插件/);
});

test("menuOptions：overrides 归入的技能会出现在场景行里", () => {
  const store = { overrides: { "skill:grill": "plugin" }, usage: {} };
  const row = m.menuOptions(store).find((x) => x.startsWith("plugin · "));
  assert.ok(row, "应有 plugin 行");
  assert.match(row, /技能/);
});

test("workflowOptions：推荐工作流排第一且带 ★ 标记", () => {
  const opts = m.workflowOptions("debug");
  assert.equal(opts.length, m.WORKFLOWS.length);
  assert.match(opts[0], /^debug · /);
  assert.match(opts[0], /★ 推荐/);
});
