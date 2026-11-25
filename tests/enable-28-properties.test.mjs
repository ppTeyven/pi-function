// 固定场景 × 工作流的公共入口矩阵，以及多选组合的不变量。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, makeProfile, emptyStore, modelPlan } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function makeEnv() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_a", "lens_b"]), ...pkgTools("pi-test", ["test_a"]), ...pkgTools("other", ["other_a"])];
  const { pi, state } = makePi({ tools });
  m.default(pi);
  return { pi, state, tools };
}

function assertToolChange(before, after, change, tools, label) {
  const registered = new Set(tools.map(t => t.name));
  const set = new Set(after);
  assert.deepEqual(change.enabled.toSorted(), after.filter(n => !before.includes(n)).toSorted(), label);
  assert.deepEqual(change.disabled.toSorted(), before.filter(n => !set.has(n)).toSorted(), label);
  assert.equal(set.size, after.length, label);
  for (const name of m.CORE_TOOLS) assert.ok(set.has(name), `${label}: 缺少核心工具 ${name}`);
  for (const name of after) assert.ok(registered.has(name), `${label}: 未注册工具 ${name}`);
  assert.ok(!set.has("other_a"), `${label}: 意外启用了无关工具`);
}

test("公共装配入口：所有固定场景 × 工作流均保留核心工具并回报真实变更", async () => {
  const { pi, state, tools } = makeEnv();
  const assemble = state.registeredTools.find(t => t.name === "assemble_scenario");
  for (const scene of m.SCENARIOS) for (const wf of m.WORKFLOWS) {
    const pair = `${scene.id} × ${wf.id}`;
    const before = [...pi.getActiveTools()];
    const result = await assemble.execute(pair, modelPlan({ scenario: scene.id, workflow: wf.id }), undefined, undefined, { ...makeCtx(state, { confirms: [true] }), cwd: process.env.PI_CODING_AGENT_DIR });
    assert.ok(!result.isError, `${pair}: ${result.content[0].text}`);
    assert.equal(result.details.id, scene.id, pair);
    assert.equal(result.details.workflow, wf.id, pair);
    const after = pi.getActiveTools();
    assertToolChange(before, after, result.details, tools, pair);
    assert.deepEqual(after, coreTools().map(t => t.name), `${pair}: 不得自动追加能力`);
    assert.deepEqual(state.entries.at(-1).d.tools, after, pair);
  }
});

test("场景禁用优先于工作流附带能力，但不删工作流步骤或允许的能力", () => {
  const { pi, state, tools } = makeEnv();
  const store = emptyStore();
  const codeSkill = "gate-lsp";
  m.hydrateCatalog(makeProfile(Object.fromEntries(Object.keys(m.CAPABILITIES).map(role => [role, {
    packages: [role === "code-intel" ? "pi-lens" : `gate-${role}`],
    skills: [role === "code-intel" ? codeSkill : `gate-skill-${role}`],
  }]))));
  for (const scenario of m.SCENARIOS) for (const workflow of m.WORKFLOWS) {
    const { missing, forbiddenHit } = m.auditCoverage(scenario, store, workflow);
    assert.deepEqual({ missing, forbiddenHit }, { missing: [], forbiddenHit: [] }, `${scenario.id} × ${workflow.id}`);
  }

  const article = m.SCENARIOS.find(s => s.id === "article");
  const debug = m.workflowById("debug");
  assert.ok(debug.plugins.includes("pi-lens"));
  assert.ok(debug.skills.includes(codeSkill));
  state.active = tools.map(t => t.name);
  const res = m.applyScenario(pi, makeCtx(state), { ...article }, store, debug);
  assert.ok(res.disabled.includes("lens_a"));
  assert.ok(!m.comboSkillIds(article, store, debug).includes(codeSkill));
  assert.ok(m.comboPackages(article, store, debug).includes("gate-testing"));
  const proposal = m.buildProposal(pi, article, store, debug);
  assert.match(proposal, /复现问题/);
  assert.match(proposal, /工作流跳过.*pi-lens.*gate-lsp/);

  const workflowOnly = m.workflowOnlyScenario(debug);
  m.applyScenario(pi, makeCtx(state), workflowOnly, store, debug);
  assert.ok(state.active.includes("lens_a"));
  assert.ok(m.comboSkillIds(workflowOnly, store, debug).includes(codeSkill));
  assert.doesNotMatch(m.buildProposal(pi, workflowOnly, store, debug), /工作流跳过/);
});

// 固定种子；不重复选同一个 ID，且必测最大与最小规模。
function* combinations() {
  let seed = 20261124;
  const sample = (entries, size) => {
    const pool = [...entries];
    return Array.from({ length: size }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return pool.splice(Math.floor(seed / 2 ** 32 * pool.length), 1)[0];
    });
  };
  for (let index = 0; index < 40; index++) {
    yield { scenes: sample(m.SCENARIOS, 2 + index % 2), workflows: sample(m.WORKFLOWS, Math.floor(index / 2) % 4) };
  }
}

test("多选装配：抽样 40 组，核对契约、工具差集、持久状态及重复装配", () => {
  for (const { scenes, workflows } of combinations()) {
    const scenario = { ...m.comboScenarios(scenes) };
    const workflow = m.comboWorkflows(workflows);
    const label = `${scenes.map(s => s.id).join("+")} × ${workflows.map(w => w.id).join("+") || "无"}`;
    const { pi, state, tools } = makeEnv();
    const ctx = makeCtx(state);
    const store = emptyStore();
    const wanted = m.toolsForScenario(pi, scenario, store, workflow);
    const before = [...state.active];
    const res = m.applyScenario(pi, ctx, scenario, store, workflow);
    assert.equal(scenario.id, scenes.map(s => s.id).join("+"), label);
    const required = new Set(scenes.flatMap(s => m.contractFor(s).required));
    assert.deepEqual(new Set(m.contractFor(scenario).required), required, label);
    if (workflow) {
      const expectedSteps = [...new Set(workflows.flatMap(w => w.steps))];
      assert.deepEqual(workflow.steps, expectedSteps, label);
    }
    assertToolChange(before, state.active, res, tools, label);
    for (const name of wanted) assert.ok(state.active.includes(name), `${label}: 组合漏掉 ${name}`);
    for (const added of res.autoAdded.filter(x => !x.startsWith("skill:"))) {
      assert.ok(tools.some(t => state.active.includes(t.name) && m.matchesPkg(t.sourceInfo, added)), `${label}: ${added} 仅在回执出现`);
    }
    assert.ok(res.coverage.missing.every(miss => !res.autoRoles.includes(miss.need)), label);
    assert.deepEqual(store.active.tools, state.active, label);
    assert.deepEqual([store.recent.scenario, store.recent.workflow], [scenario.id, workflow?.id || null], label);
    const after = [...state.active];
    const again = m.applyScenario(pi, ctx, scenario, store, workflow);
    assert.deepEqual(state.active.toSorted(), after.toSorted(), label);
    assert.deepEqual([again.enabled, again.disabled], [[], []], label);
  }
});
