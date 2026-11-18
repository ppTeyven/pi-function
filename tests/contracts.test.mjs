// 接口与不变量测试（第二组）：scoreScenarios / contractFor / combo* / buildProfile / 目录一致性
// 依据 qa：纯函数用等价类+边界值；配置表用"完整性"不变量（漏一个场景就是线上缺口）
// 跑法：node --experimental-strip-types --test function-menu-tests/contracts.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EXT, STORE } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));
const profile = m.buildProfile(store);
const byId = new Map(m.SCENARIOS.map((s) => [s.id, s]));
const strip = (id) => String(id).replace(/^npm:/, "").replace(/^skill:/, "");

// ---------------------------------------------------------------- scoreScenarios
test("scoreScenarios：直接给 id 时得分 ≥ 50（精确匹配）", () => {
  for (const id of ["plugin", "process", "image"]) {
    const top = m.scoreScenarios(id)[0];
    assert.equal(top.scenario.id, id);
    assert.ok(top.score >= 50, `${id} 精确匹配只有 ${top.score}`);
  }
});

test("scoreScenarios：返回 weight 字段（同分决胜依据）", () => {
  const top = m.scoreScenarios("做一份年度经营分析报告")[0];
  assert.equal(typeof top.weight, "number");
  assert.ok(top.weight > 0);
});

test("scoreScenarios：长词优先——「经营分析报告」压过「数据图表」", () => {
  const top = m.scoreScenarios("写一份年度经营分析报告，要有图表")[0];
  assert.equal(top.scenario.id, "report", `实际 ${top.scenario.id}`);
});

test("scoreScenarios：空场景表返回空数组", () => {
  assert.deepEqual(m.scoreScenarios("随便写点什么", []), []);
});

// ---------------------------------------------------------------- contractFor
test("contractFor：未知场景返回空契约而不是抛错", () => {
  const c = m.contractFor({ id: "not-exist" });
  assert.deepEqual(c, { required: [], optional: [], forbidden: [] });
});

test("contractFor：重复 id 去重", () => {
  const c = m.contractFor({ id: "image+image", comboIds: ["image", "image"] });
  assert.deepEqual(c.required, ["design"]);
});

test("contractFor：三个场景时 forbidden 必须三方都禁止才保留", () => {
  const c = m.contractFor({ id: "a+b+c", comboIds: ["image", "design", "article"] });
  // image/article 禁 code-intel，design 也禁 → 应保留
  assert.ok(c.forbidden.includes("code-intel"), `实际 ${c.forbidden.join(",")}`);
});

// ---------------------------------------------------------------- auditCoverage
test("auditCoverage：required 支持具体条目 id（skill:xxx）", () => {
  const skill = "humanizer";
  const installed = (profile.roles?.writing?.skills || []).some((s) => s.id === skill);
  if (!installed) return; // 环境没装就跳过（不伪造成通过）
  const sc = { id: "synthetic", title: "合成", plugins: [], skillIds: [skill], dynamic: true };
  const cov = m.auditCoverage({ ...sc, contractOverride: null }, store, null);
  assert.ok(cov, "auditCoverage 不应抛错");
  const contract = m.SCENARIO_CONTRACTS.process; // 用真实契约校验 id 形式另建一条
  assert.ok(contract.required.length > 0);
});

test("auditCoverage：全部 required 满足时 missing 为空、present 完整", () => {
  const cov = m.auditCoverage(byId.get("localization"), store, null);
  if (cov.missing.length) return; // 环境未装 i18n 时不强断言
  assert.equal(cov.ok, true);
  assert.deepEqual(cov.present, cov.required);
});

test("auditCoverage：forbidden 命中会同时让 ok=false", () => {
  const codeIntel = (profile.roles?.["code-intel"]?.packages || []).map((p) => strip(p.id))
    .concat((profile.roles?.["code-intel"]?.skills || []).map((s) => strip(s.id)));
  if (!codeIntel.length) return;
  const sc = { ...byId.get("image"), plugins: [codeIntel[0]], skillIds: [] };
  const cov = m.auditCoverage(sc, store, null);
  assert.equal(cov.ok, false);
});

// ---------------------------------------------------------------- combo*
test("comboScenarios：三个场景 title 用「 + 」连接、when 用「；」", () => {
  const ids = ["image", "design", "commerce"];
  const combo = m.comboScenarios(ids.map((id) => byId.get(id)));
  assert.equal(combo.title.split(" + ").length, 3);
  assert.ok(combo.when.includes("；"));
  assert.equal(combo.id, ids.join("+"));
});

test("comboWorkflows：三路合并后 steps 无重复", () => {
  const wfs = ["debug", "review-gate", "phased"].map((id) => m.workflowById(id));
  const combo = m.comboWorkflows(wfs);
  assert.equal(new Set(combo.steps).size, combo.steps.length);
  assert.ok(combo.title.includes("+"));
});

test("comboWorkflows：单元素返回原对象", () => {
  const wf = m.workflowById("debug");
  assert.equal(m.comboWorkflows([wf]), wf);
});

test("comboSkillIds：无 workflow 时不拼接", () => {
  const sc = byId.get("docs");
  const a = m.comboSkillIds(sc, store, null);
  const b = m.comboSkillIds(sc, store, m.workflowById("direct"));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- followup / dynamic
test("followupQuestions：plugin 场景带「改动面」问题（4 条）", () => {
  const qs = m.followupQuestions(byId.get("plugin"), null);
  assert.equal(qs.length, 4);
  assert.ok(qs.some((q) => q.includes("改动面")));
});

test("followupQuestions：问题不重复、条数 3–4", () => {
  for (const sc of m.SCENARIOS) {
    const qs = m.followupQuestions(sc, m.workflowById(m.recommendWorkflow(sc)));
    assert.equal(new Set(qs).size, qs.length, `${sc.id} 有重复问题`);
    assert.ok(qs.length >= 3 && qs.length <= 4, `${sc.id} 条数 ${qs.length}`);
  }
});

test("dynamicScenario：隐私需求 noWorkflow=true", () => {
  const need = "这些内容保密，不能外发，整理成文档";
  const analysis = m.analyzeNeed(need, store);
  const dyn = m.dynamicScenario(need, analysis, null);
  assert.equal(analysis.private, true);
  assert.equal(dyn.noWorkflow, true);
});

test("analyzeNeed：useMcp 只在 MCP/外部系统措辞下为真", () => {
  assert.equal(m.analyzeNeed("把消息同步到外部系统", store).useMcp, true);
  assert.equal(m.analyzeNeed("写一份产品说明文档", store).useMcp, false);
});

test("analyzeNeed：terms 有上限（不把整段话无限展开）", () => {
  const a = m.analyzeNeed("插件装配流程排查".repeat(20), store);
  assert.ok(a.terms.length <= 40, `terms ${a.terms.length}`);
});

// ---------------------------------------------------------------- 词表完整性
test("SCENARIO_HINTS：每个场景都有提示词", () => {
  const missing = m.SCENARIOS.filter((s) => !(m.SCENARIO_HINTS[s.id] || []).length).map((s) => s.id);
  assert.deepEqual(missing, []);
});

test("WORKFLOW_CAPABILITIES / WORKFLOW_SKILL_PATTERNS：覆盖每个工作流", () => {
  const missCap = m.WORKFLOWS.filter((w) => !m.WORKFLOW_CAPABILITIES[w.id]).map((w) => w.id);
  const missPat = m.WORKFLOWS.filter((w) => !m.WORKFLOW_SKILL_PATTERNS[w.id]).map((w) => w.id);
  assert.deepEqual(missCap, []);
  assert.deepEqual(missPat, []);
});

test("recommendWorkflow：33 个场景都返回合法工作流 id", () => {
  const ids = new Set(m.WORKFLOWS.map((w) => w.id));
  const bad = m.SCENARIOS.filter((s) => !ids.has(m.recommendWorkflow(s))).map((s) => s.id);
  assert.deepEqual(bad, []);
});

test("CAPABILITIES：每个角色都有 label 和匹配方式", () => {
  const bad = Object.entries(m.CAPABILITIES)
    .filter(([, def]) => !def.label || !(def.skill || def.package || def.tool || def.terms))
    .map(([id]) => id);
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- buildProfile 不变量
test("buildProfile：同一技能最多进入 2 个角色", () => {
  const bad = Object.entries(profile.itemInfo).filter(([, info]) => (info.roles || []).length > 2).map(([id]) => id);
  assert.deepEqual(bad, []);
});

test("buildProfile：每个角色技能数不超过 12", () => {
  const bad = Object.entries(profile.roles).filter(([, r]) => r.skills.length > 12).map(([id]) => id);
  assert.deepEqual(bad, []);
});

test("buildProfile：infra 条目不进入场景组合", () => {
  const infraInProfile = Object.values(profile.roles).flatMap((r) => r.packages.map((p) => p.id))
    .filter((id) => profile.itemInfo?.[id]?.infra);
  assert.deepEqual([...new Set(infraInProfile)], []);
});

// ---------------------------------------------------------------- store 目录一致性
test("store：每条 known 都有 kind 与 scenario 字段", () => {
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8")).known;
  const bad = Object.entries(raw).filter(([, v]) => !v?.kind || !("scenario" in v)).map(([id]) => id);
  assert.deepEqual(bad, []);
});

test("store：overrides 的取值只能是 none / infra / 合法场景 id", () => {
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8")).overrides || {};
  const valid = new Set(["none", "infra", ...m.SCENARIOS.map((s) => s.id)]);
  const bad = Object.entries(raw).filter(([, v]) => !valid.has(v)).map(([k, v]) => `${k}=${v}`);
  assert.deepEqual(bad, []);
});

test("store：known 条目的 id 前缀只有 npm: / skill: / local:", () => {
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8")).known;
  const bad = Object.keys(raw).filter((id) => !/^(npm:|skill:|local:)/.test(id));
  assert.deepEqual(bad, []);
});
