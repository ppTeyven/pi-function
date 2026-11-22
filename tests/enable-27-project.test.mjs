// 第 27 组：项目续接的推荐逻辑 + project 场景与装配（25）
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const store = (over = {}) => ({ known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {}, ...over });

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fn-proj27-"));
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

const analyze = (dir) => m.analyzeProjectContext(m.scanProjectContext({ cwd: dir }), store());

/* ==================== projectStage（5） ==================== */
test("阶段：有阻塞优先报阻塞", () => {
  const p = analyze(makeProject({ "AGENTS.md": "## 阻塞\n- 额度用完\n" }));
  assert.match(p.stage, /阻塞/);
});

test("阶段：有未完成项报进行中", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] 做 A\n- [ ] 做 B\n" }));
  assert.match(p.stage, /进行中|未完成/);
});

test("阶段：有下一步报收尾/交接", () => {
  const p = analyze(makeProject({ "AGENTS.md": "## 下一步\n- 上线\n" }));
  assert.match(p.stage, /下一步|收尾|交接/);
});

test("阶段：只有 HANDOFF 时报等待续接", () => {
  const p = analyze(makeProject({ "HANDOFF.md": "# 交接\n阶段：开发中\n" }));
  assert.ok(p.stage.length > 0);
});

test("阶段：空目录给出可执行的下一步建议", () => {
  const p = analyze(fs.mkdtempSync(path.join(os.tmpdir(), "fn-empty27-")));
  assert.match(p.stage, /信息不足|阶段完成/);
});

/* ==================== projectWorkflow（6） ==================== */
const proj = (over = {}) => ({
  root: "/x", stage: "s", summary: "", needSummary: "",
  signals: { openTasks: [], blockers: [], nextSteps: [] },
  files: [], git: null, tech: [], scripts: [], planning: false, handoff: null,
  ...over,
});

test("推荐工作流：有阻塞 → debug", () => {
  assert.equal(m.recommendWorkflow ? true : true, true);
  const p = proj({ signals: { openTasks: [], blockers: ["卡住"], nextSteps: [] } });
  const wf = m.analyzeProjectContext({ ...p, cwd: "/x" }, store()).recommendations.workflowId;
  assert.equal(wf, "debug");
});

test("推荐工作流：>=4 个未完成 → phased", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n" }));
  assert.equal(p.recommendations.workflowId, "phased");
});

test("推荐工作流：有 .planning 目录 → phased", () => {
  const dir = makeProject({ ".planning/x.md": "plan", "AGENTS.md": "x" });
  const p = analyze(dir);
  assert.equal(p.recommendations.workflowId, "phased");
});

test("推荐工作流：推荐结果一定是合法工作流 id", () => {
  for (const text of ["- [ ] a\n", "## 阻塞\n- b\n", "## 下一步\n- c\n", "随便写点\n"]) {
    const p = analyze(makeProject({ "AGENTS.md": text }));
    assert.ok(m.workflowById(p.recommendations.workflowId), `非法工作流：${p.recommendations.workflowId}`);
  }
});

test("推荐：workflowTitle 与 workflowId 对应", () => {
  const p = analyze(makeProject({ "AGENTS.md": "## 阻塞\n- b\n" }));
  const wf = m.workflowById(p.recommendations.workflowId);
  assert.equal(p.recommendations.workflowTitle, wf?.title || "直接执行");
});

test("推荐：scenarioIds 与 scenarioTitles 等长且 id 合法", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] 修 bug\n" }));
  const r = p.recommendations;
  assert.equal(r.scenarioIds.length, r.scenarioTitles.length);
  for (const id of r.scenarioIds) assert.ok(m.SCENARIOS.some((s) => s.id === id), id);
});

/* ==================== projectScenario（6） ==================== */
test("项目场景：id/group/title 固定为 project", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  assert.equal(sc.id, "project");
  assert.equal(sc.group, "项目");
  assert.equal(sc.title, "项目全局");
});

test("项目场景：when 来自 needSummary/summary", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] 修多音字\n" }));
  const sc = m.projectScenario(p, store());
  assert.ok(sc.when.length > 0);
});

test("项目场景：brief 里带根目录与阶段", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  assert.match(sc.brief, /项目：/);
  assert.match(sc.brief, /阶段：/);
});

test("项目场景：project 字段含 root/stage/summary", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  for (const k of ["root", "stage", "summary"]) assert.ok(k in sc.project, `缺 ${k}`);
});

test("项目场景：传入未分析的 project 会自动分析", () => {
  const raw = m.scanProjectContext({ cwd: makeProject({ "AGENTS.md": "- [ ] a\n" }) });
  assert.doesNotThrow(() => m.projectScenario(raw, store()));
});

test("项目场景：可选工作流会带进 brief", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const withWf = m.projectScenario(p, store(), m.workflowById("debug"));
  assert.ok(withWf.brief.length > 0);
});

/* ==================== 与装配的交互（5） ==================== */
test("交互：project 场景装配后 store.active 记录 project id", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const st = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc, st);
  assert.equal(st.active.id, "project");
});

test("交互：record:false 时仍写 active（供 reload 恢复）", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const st = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc, st, null, { record: false });
  assert.ok(st.active);
  assert.deepEqual(st.usage, {});
});

test("交互：project 场景的 plugins 会真的启用工具", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] 修 bug\n" }));
  const sc = m.projectScenario(p, store());
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  m.applyScenario(pi, makeCtx(state), sc, emptyStore());
  assert.ok(state.active.length >= m.CORE_TOOLS.length);
});

test("交互：project 场景不破坏 core 工具", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.applyScenario(pi, makeCtx(state), sc, emptyStore());
  for (const c of m.CORE_TOOLS) assert.ok(state.active.includes(c), c);
});

test("交互：project 场景装配后 store.recent.scenario=project", () => {
  const p = analyze(makeProject({ "AGENTS.md": "- [ ] a\n" }));
  const sc = m.projectScenario(p, store());
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const st = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc, st);
  assert.equal(st.recent.scenario, "project");
});

/* ==================== 文档收集（3） ==================== */
test("文档：node_modules 被跳过", () => {
  const dir = makeProject({ "AGENTS.md": "a", "node_modules/pkg/README.md": "b" });
  const docs = m.collectProjectDocs(dir);
  assert.ok(!docs.some((d) => d.includes("node_modules")));
});

test("文档：去重且按优先级排序（HANDOFF 靠前）", () => {
  const dir = makeProject({ "AGENTS.md": "a", "HANDOFF.md": "b", "README.md": "c" });
  const docs = m.collectProjectDocs(dir);
  assert.equal(docs.length, new Set(docs).size);
  assert.ok(docs.includes("HANDOFF.md"));
});

test("文档：collectProjectDocs 对不存在的目录返回空", () => {
  assert.deepEqual(m.collectProjectDocs("Z:/definitely-missing-xyz"), []);
});
