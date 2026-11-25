// 模型负责选组合；插件只列事实、验证、确认并应用显式清单。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, skillInfo, modelPlan } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics", "read_symbol"]), ...pkgTools("pi-test", ["test_run"])];
  const active = [...coreTools().map(t => t.name), "test_run", "read_symbol"];
  const { pi, state } = makePi({ tools, active, commands: [{ name: "skill:proof", source: "skill", sourceInfo: skillInfo("proof"), description: "Verification skill" }] });
  m.default(pi);
  const invoke = (input, ctx = makeCtx(state, { confirms: [true] })) => state.registeredTools.find(t => t.name === "assemble_scenario").execute("fixture", input, undefined, undefined, ctx);
  return { pi, state, invoke, active };
}

const complete = (over = {}) => modelPlan({ scenario: "plugin+docs", workflow: "debug+research", plugins: ["npm:pi-lens"], tools: ["lens_diagnostics"], skills: ["proof"], ...over });

test("直接模型提案：只应用明确选择的单个工具，记录真实差集，绝不补选同插件其它工具", async () => {
  const { state, invoke, active } = env();
  const context = makeCtx(state);
  context.ui.confirm = async (title, content) => {
    assert.match(title, /排查修复.*证据先行/);
    assert.match(content, /保留或启用的插件：npm:pi-lens/);
    assert.match(content, /工具将新增启用：lens_diagnostics/);
    assert.match(content, /工具将停用：.*read_symbol.*test_run/);
    assert.deepEqual(state.active, active);
    return true;
  };
  const result = await invoke(complete(), context);
  assert.ok(!result.isError, result.content[0].text);
  assert.deepEqual(result.details.enabled, ["lens_diagnostics"]);
  assert.deepEqual(result.details.disabled, ["read_symbol", "test_run"]);
  assert.deepEqual(state.active, [...coreTools().map(t => t.name), "lens_diagnostics"]);
  assert.deepEqual(state.entries.at(-1).d.tools, state.active);
  assert.equal(state.entries.at(-1).d.by, "model");
  assert.equal(state.entries.at(-1).d.workflow, "debug+research");
  assert.match(result.content[0].text, /还原 \/function off/);
  assert.match(result.content[0].text, /会话技能（1 个）：proof/);
});

test("明确空清单有效：即使场景或工作流有插件套餐，也不得自动增加能力", async () => {
  const { state, invoke } = env();
  const approved = await invoke(modelPlan({ scenario: "plugin", workflow: "debug" }));
  assert.ok(!approved.isError, approved.content[0].text);
  assert.deepEqual(state.active, coreTools().map(t => t.name));
  assert.deepEqual(m.loadStore().active.custom.plan.skills, []);
});

test("错误的模型 ID、越界或不完整的提案不能打开确认或改变状态", async () => {
  const { invoke, state, active } = env();
  const ctx = makeCtx(state);
  ctx.ui.confirm = async () => assert.fail("无效清单不得确认");
  for (const [input, msg] of [
    [complete({ standalone: undefined }), /没有已绑定的项目回合/],
    [{ standalone: true, scenario: "plugin" }, /工作流/],
    [complete({ scenario: "not-a-scene" }), /未知场景/],
    [complete({ workflow: "nope" }), /未知工作流/],
    [complete({ scenario: "plugin+docs+api+report" }), /最多 3/],
    [complete({ plugins: ["npm:ghost"] }), /插件不可用/],
    [complete({ tools: ["nonexistent"] }), /工具不可用/],
    [complete({ skills: ["fake"] }), /技能不可用/],
    [complete({ tools: ["read"] }), /工具不可用/],
    [complete({ plugins: [], tools: ["lens_diagnostics"] }), /没有保留该插件/],
  ]) {
    const failure = await invoke(input, ctx);
    assert.equal(failure.isError, true);
    assert.match(failure.content[0].text, msg);
  }
  assert.deepEqual(state.active, active);
  assert.equal(state.entries.length, 0);
});

test("尊重用户手动排除；无确认界面也不应用直接提案", async (t) => {
  t.after(() => fs.rmSync(process.env.PI_FUNCTION_STORE, { force: true }));
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, overrides: { "npm:pi-lens": "none" } }));
  const { invoke, state } = env();
  const excluded = await invoke(complete());
  assert.match(excluded.content[0].text, /插件不可用/);
  const headless = await invoke(modelPlan(), makeCtx(state, { hasUI: false }));
  assert.match(headless.content[0].text, /没有交互确认界面/);
  assert.deepEqual(state.setCalls, []);
});

test("宿主未应用整个提案时回滚工具，不保存或宣称成功", async () => {
  const { pi, invoke, state, active } = env();
  const original = pi.setActiveTools;
  pi.setActiveTools = (names) => original(names.filter(name => name !== "lens_diagnostics"));
  const result = await invoke(modelPlan({ plugins: ["npm:pi-test"], tools: ["test_run"] }), makeCtx(state, { confirms: [false] }));
  assert.equal(result.details.cancelled, true);
  assert.deepEqual(state.active, active);
  // 只拒绝计划新增的工具；原清单可完整恢复。
  const failed = await invoke(complete());
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /已恢复原工具集/);
  assert.deepEqual(state.active, active);
  assert.equal(state.entries.length, 0);
  assert.equal(state.messages.some(x => x.customType === "function-assembled"), false);
});
