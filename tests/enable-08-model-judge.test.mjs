// 第 8 组：完全交给模型决策 —— assemble_scenario 工具（模型可真正装配）
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const tool = (name) => state.registeredTools.find((t) => t.name === name);
  return { state, pi, tool, tools };
}

/* ---------------------- 工具注册（3） ---------------------- */
test("模型装配：注册了 assemble_scenario 工具", () => {
  const { tool } = env();
  assert.ok(tool("assemble_scenario"), "缺 assemble_scenario");
});

test("模型装配：工具参数要求 scenario 必填", () => {
  const { tool } = env();
  const t = tool("assemble_scenario");
  assert.deepEqual(t.parameters.required, ["scenario"]);
});

test("模型装配：suggest_scenario 仍然存在且只读", async () => {
  const { tool, state } = env();
  const before = [...state.active];
  const res = await tool("suggest_scenario").execute("1", { text: "写个爬虫" });
  assert.ok(res.content[0].text.length > 0);
  assert.deepEqual(state.active, before);
});

/* ---------------------- 装配成功（5） ---------------------- */
test("模型装配：单个场景真的改变工具集", async () => {
  const { tool, state } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  assert.ok(!res.isError, res.content[0].text);
  assert.ok(state.setCalls.length > 0, "应调用 setActiveTools");
});

test("模型装配：写入会话记录，by=model", async () => {
  const { tool, state } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  const entry = state.entries.at(-1);
  assert.equal(entry.type, "function-scenario");
  assert.equal(entry.d.by, "model");
  assert.deepEqual(entry.d.tools, state.active);
});

test("模型装配：组合场景 id 用 + 连接", async () => {
  const { tool, state } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin+api" });
  assert.equal(state.entries.at(-1).d.id, "plugin+api");
});

test("模型装配：可以指定工作流", async () => {
  const { tool, state } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin", workflow: "debug" });
  assert.equal(state.entries.at(-1).d.workflow, "debug");
});

test("模型装配：不指定工作流时按场景推荐", async () => {
  const { tool, state } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  assert.ok(state.entries.at(-1).d.workflow, "应带上推荐工作流");
});

/* ---------------------- 拒绝非法输入（4） ---------------------- */
test("模型装配：未知场景 id 返回错误且不改工具集", async () => {
  const { tool, state } = env();
  const before = [...state.active];
  const res = await tool("assemble_scenario").execute("1", { scenario: "not-a-scene" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /未知场景 id/);
  assert.deepEqual(state.active, before);
});

test("模型装配：未知工作流 id 返回错误", async () => {
  const { tool, state } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "plugin", workflow: "nope" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /未知工作流 id/);
});

test("模型装配：缺 scenario 参数返回错误", async () => {
  const { tool } = env();
  const res = await tool("assemble_scenario").execute("1", {});
  assert.equal(res.isError, true);
});

test("模型装配：错误信息里给出可用 id（便于模型自我纠正）", async () => {
  const { tool } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "zzz" });
  assert.match(res.content[0].text, /可用 id：/);
});

/* ---------------------- 返回给模型的内容（3） ---------------------- */
test("模型装配：返回文本含启用数量与还原入口", async () => {
  const { tool } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  const text = res.content[0].text;
  assert.match(text, /当前 \d+ 个工具可用/);
  assert.match(text, /还原 \/function off/);
});

test("模型装配：返回文本列出插件与技能", async () => {
  const { tool } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  const text = res.content[0].text;
  assert.match(text, /插件：/);
  assert.match(text, /技能：/);
});

test("模型装配：reason 会回显给用户", async () => {
  const { tool } = env();
  const res = await tool("assemble_scenario").execute("1", { scenario: "plugin", reason: "需要代码检查" });
  assert.match(res.content[0].text, /依据：需要代码检查/);
});

/* ---------------------- 与 off 的配合（2） ---------------------- */
test("模型装配：装配后 /function off 重置为全局常开", async () => {
  const { tool, state, tools } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  await state.commands.get("function").handler("off", makeCtx(state));
  const expected = tools.filter((t) => String(t.sourceInfo?.path || "").startsWith("builtin:")).map((t) => t.name);
  assert.deepEqual([...state.active].sort(), [...expected].sort());
});

test("模型装配：连续装配两次不膨胀", async () => {
  const { tool, state } = env();
  await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  const first = [...state.active].sort();
  await tool("assemble_scenario").execute("1", { scenario: "plugin" });
  assert.deepEqual([...state.active].sort(), first);
});
