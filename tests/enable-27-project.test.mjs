// 项目证据的判定优先级、文档边界和续接装配的实际效果。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function makeProject(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fn-project-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

test("项目阶段和工作流：阻塞优先，其次待办、下一步和交接", (t) => {
  const cases = [
    ["阻塞优先", { "HANDOFF.md": "- [ ] 验收\n## 阻塞\n- 服务未就绪\n## 下一步\n- 发布" }, /有阻塞/, "debug"],
    ["未完成", { "AGENTS.md": "- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n## 下一步\n- 发布" }, /进行中（4 项/, "phased"],
    ["下一步", { "HANDOFF.md": "## 下一步\n- 上线" }, /有明确下一步/, "phased"],
    ["交接", { "HANDOFF.md": "阶段：开发中" }, /等待续接/, "phased"],
    ["计划", { ".planning/x.md": "plan", "AGENTS.md": "- [ ] a" }, /进行中/, "phased"],
    ["缺少证据", { "README.md": "# 项目说明" }, /信息不足/, null],
    ["空目录", {}, /信息不足/, "direct"],
  ];
  for (const [label, files, stage, workflow] of cases) {
    const cwd = makeProject(t, files);
    const p = m.analyzeProjectContext(m.scanProjectContext({ cwd }), emptyStore());
    assert.match(p.stage, stage, label);
    if (workflow) assert.equal(p.recommendations.workflowId, workflow, label);
    assert.equal(p.recommendations.workflowTitle, m.workflowById(p.recommendations.workflowId)?.title, label);
    assert.deepEqual(p.recommendations.scenarioTitles, p.recommendations.scenarioIds.map(id => m.SCENARIOS.find(s => s.id === id).title), label);
  }
});

test("续接场景从未分析的证据取出工作，并实际启用推荐插件", (t) => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const cwd = makeProject(t, { "HANDOFF.md": "- [ ] 修 bug、补测试与回归" });
  const store = emptyStore();
  const scene = m.projectScenario(m.scanProjectContext({ cwd }), store, m.workflowById("debug"));
  assert.equal(scene.id, "project");
  assert.equal(scene.title, "项目全局");
  assert.match(scene.when, /修 bug/);
  assert.equal(scene.project.root, cwd);
  assert.match(scene.brief, /阶段：进行中/);
  assert.ok(scene.plugins.includes("pi-lens"));
  const { pi, state } = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])], active: ["read"] });
  m.applyScenario(pi, { ...makeCtx(state), cwd }, scene, store);
  assert.ok(state.active.includes("lens_diagnostics"));
  assert.equal(store.active.id, "project");
  assert.deepEqual(store.active.tools, state.active);
});

test("项目报告从 package.json 提取技术栈和脚本名", async (t) => {
  const cwd = makeProject(t, { "package.json": JSON.stringify({ name: "fixture", scripts: { test: "node --test", build: "node build.js" } }) });
  const { pi, state } = makePi({ tools: coreTools() });
  m.default(pi);
  await state.commands.get("function").handler("resume", { ...makeCtx(state, { hasUI: false }), cwd });
  const report = state.messages.find(x => x.customType === "function-project")?.content || "";
  assert.match(report, /技术 \/ 脚本：Node \(fixture\)/);
  assert.match(report, /scripts:.*test.*build/);
});

test("项目文档：交接优先，不扫描依赖，目录不存在时返回空", (t) => {
  const cwd = makeProject(t, { "AGENTS.md": "a", "HANDOFF.md": "b", "README.md": "c", "node_modules/pkg/HANDOFF.md": "ignore" });
  assert.deepEqual(m.collectProjectDocs(cwd), ["HANDOFF.md", "AGENTS.md", "README.md"]);
  assert.deepEqual(m.collectProjectDocs(path.join(cwd, "missing")), []);
});
