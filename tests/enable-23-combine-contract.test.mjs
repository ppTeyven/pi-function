// 第 23 组：组合 / 工作流 / 契约 / 预算（25）
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] }, writing: { skills: ["grill"] } });

const byId = (id) => m.SCENARIOS.find((s) => s.id === id);

/* ---------------- 组合（8） ---------------- */
test("组合：两个场景 id 用 + 连接", () => {
  const c = m.comboScenarios([byId("plugin"), byId("api")]);
  assert.equal(c.id, "plugin+api");
  assert.deepEqual(c.comboIds, ["plugin", "api"]);
});

test("组合：七个场景仍能合并", () => {
  const list = ["plugin", "api", "docs", "data", "webapp", "tool", "maintain"].map(byId);
  assert.equal(m.comboScenarios(list).comboIds.length, 7);
});

test("组合：plugins 去重", () => {
  const a = { ...byId("plugin"), plugins: ["x", "y"] };
  const b = { ...byId("api"), plugins: ["y", "z"] };
  assert.deepEqual(m.comboScenarios([a, b]).plugins, ["x", "y", "z"]);
});

test("组合：skillIds 去重", () => {
  const a = { ...byId("plugin"), skillIds: ["s1", "s2"] };
  const b = { ...byId("api"), skillIds: ["s2", "s3"] };
  assert.deepEqual(m.comboScenarios([a, b]).skillIds, ["s1", "s2", "s3"]);
});

test("工作流组合：steps 去重且保序", () => {
  const a = { id: "a", title: "A", steps: ["1", "2"], plugins: [], skills: [] };
  const b = { id: "b", title: "B", steps: ["2", "3"], plugins: [], skills: [] };
  assert.deepEqual(m.comboWorkflows([a, b]).steps, ["1", "2", "3"]);
});

test("工作流组合：plugins/skills 去重", () => {
  const a = { id: "a", title: "A", steps: [], plugins: ["p1"], skills: ["s1"] };
  const b = { id: "b", title: "B", steps: [], plugins: ["p1", "p2"], skills: ["s1", "s2"] };
  const c = m.comboWorkflows([a, b]);
  assert.deepEqual(c.plugins, ["p1", "p2"]);
  assert.deepEqual(c.skills, ["s1", "s2"]);
});

test("组合：单元素返回原对象（不做拷贝）", () => {
  const one = byId("plugin");
  assert.equal(m.comboScenarios([one]), one);
});

test("组合：空数组返回 null", () => {
  assert.equal(m.comboScenarios([]), null);
  assert.equal(m.comboWorkflows([]), null);
});

/* ---------------- 契约（6） ---------------- */
test("契约：组合 required 取并集", () => {
  const c = m.contractFor({ comboIds: ["plugin", "api"] });
  const a = m.contractFor(byId("plugin")).required;
  const b = m.contractFor(byId("api")).required;
  for (const r of [...a, ...b]) assert.ok(c.required.includes(r), r);
});

test("契约：组合 forbidden 只保留都禁止的", () => {
  const c = m.contractFor({ comboIds: ["plugin", "api"] });
  const a = m.contractFor(byId("plugin")).forbidden;
  const b = m.contractFor(byId("api")).forbidden;
  const both = a.filter((x) => b.includes(x));
  assert.deepEqual(c.forbidden, both);
});

test("契约：单场景原样返回", () => {
  const s = byId("plugin");
  assert.deepEqual(m.contractFor(s), m.SCENARIO_CONTRACTS.plugin);
});

test("契约：未知场景返回空契约", () => {
  assert.deepEqual(m.contractFor({ id: "nope" }), { required: [], optional: [], forbidden: [] });
});

test("契约：每个场景的 required 都是已知角色", () => {
  for (const [id, c] of Object.entries(m.SCENARIO_CONTRACTS)) {
    for (const r of c.required) assert.ok(m.CAPABILITIES[r], `${id}.required 含未知角色 ${r}`);
  }
});

test("契约：forbidden 与 required 不重叠", () => {
  for (const [id, c] of Object.entries(m.SCENARIO_CONTRACTS)) {
    for (const f of c.forbidden) assert.ok(!c.required.includes(f), `${id}: ${f} 同时出现在 required/forbidden`);
  }
});

/* ---------------- 预算与选择（5） ---------------- */
test("预算：DYNAMIC_LIMITS 三个上限都是正数", () => {
  assert.ok(m.LIMITS.packages > 0 && m.LIMITS.skills > 0 && m.LIMITS.perIntentSkills > 0);
});

test("预算：selectByCoverage 不超过 limit", () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, score: 20 - i }));
  assert.ok(m.selectByCoverage(list, 5, []).length <= 5);
});

test("预算：selectByCoverage 空清单返回空", () => {
  assert.deepEqual(m.selectByCoverage([], 5, ["r1"]), []);
});

test("预算：analyzeNeed 的 packages 不超过上限", () => {
  const a = m.analyzeNeed("写个报表并整理文档再做数据分析", { known: {} });
  assert.ok(a.packages.length <= m.LIMITS.packages);
});

test("预算：analyzeNeed 的 skills 不超过上限", () => {
  const a = m.analyzeNeed("做个报告，写文案，还要图表", { known: {} });
  assert.ok(a.skills.length <= m.LIMITS.skills);
});

/* ---------------- 场景/工作流数据完整性（6） ---------------- */
test("数据：34 个场景 id 唯一", () => {
  const ids = m.SCENARIOS.map((s) => s.id);
  assert.equal(ids.length, 34);
  assert.equal(new Set(ids).size, 34);
});

test("数据：每个场景都有非空 keywords", () => {
  for (const s of m.SCENARIOS) assert.ok(s.keywords.length > 0, s.id);
});

test("数据：每个工作流都有 picker 文案", () => {
  for (const w of m.WORKFLOWS) assert.ok(w.picker, w.id);
});

test("数据：SCENARIO_CAPABILITIES 的键都在 SCENARIOS 里", () => {
  const ids = new Set(m.SCENARIOS.map((s) => s.id));
  for (const k of Object.keys(m.SCENARIO_CAPABILITIES)) assert.ok(ids.has(k), k);
});

test("数据：WORKFLOW_CAPABILITIES 的键都在 WORKFLOWS 里", () => {
  const ids = new Set(m.WORKFLOWS.map((w) => w.id));
  for (const k of Object.keys(m.WORKFLOW_CAPABILITIES)) assert.ok(ids.has(k), k);
});

test("数据：CAPABILITIES 每个角色都有 label", () => {
  for (const [id, def] of Object.entries(m.CAPABILITIES)) assert.ok(def.label, id);
});
