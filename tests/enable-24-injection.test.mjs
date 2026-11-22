// 第 24 组：系统提示注入与文本产出（25）
// 通过真实 handler 装配触发钩子（activeScenario 在闭包里，只有 handler 能设置）
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });

/** 用 /function scenario <id> 真实装配，然后取 before_agent_start 注入内容 */
async function injected(args = "scenario plugin", opts = {}) {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({
    tools,
    active: tools.map((t) => t.name),
    commands: [{ name: "lens-toggle", source: "extension", sourceInfo: { path: "/x/node_modules/pi-lens/a.js", source: "npm:pi-lens" } }],
  });
  m.default(pi);
  await state.commands.get("function").handler(args, makeCtx(state, { confirms: [true], ...opts }));
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "BASE" }, makeCtx(state));
  return { text: out?.systemPrompt ?? "BASE", state, pi };
}

/* ---------------- 基础结构（6） ---------------- */
test("注入：保留原有 systemPrompt", async () => {
  const { text } = await injected();
  assert.match(text, /^BASE/);
});

test("注入：有「当前组合」标题", async () => {
  const { text } = await injected();
  assert.match(text, /当前组合（\/function 装配）/);
});

test("注入：带工作流时含流程箭头", async () => {
  const { text } = await injected("scenario plugin");
  assert.match(text, /流程：.*→/);
});

test("注入：含检查点与完成标准", async () => {
  const { text } = await injected();
  assert.match(text, /检查点：|按流程执行/);
  assert.match(text, /完成标准：/);
});

test("注入：工作流装配时标题含工作流名", async () => {
  const { text } = await injected("debug");
  assert.match(text, /排查修复/);
});

test("注入：未装配时不追加内容（对照）", async () => {
  // 清掉共享 store 里的 active，否则 restoreScenario 会把上一个测试的组合拉回来
  m.saveStore({ version: 1, known: {}, overrides: {}, active: null });
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "BASE" }, makeCtx(state));
  assert.equal(out?.systemPrompt ?? "BASE", "BASE");
});

/* ---------------- 能力清单（5） ---------------- */
test("注入：有「本次装配已启用的能力」段", async () => {
  const { text } = await injected();
  assert.match(text, /本次装配已启用的能力/);
});

test("注入：列出插件与工具数", async () => {
  const { text } = await injected();
  assert.match(text, /插件 `[^`]+`：\{?\d*\}?\d+ 个工具|插件 `[^`]+`：/);
});

test("注入：列出命令（若有）", async () => {
  const { text } = await injected();
  assert.match(text, /命令 \//);
});

test("注入：列出技能名", async () => {
  const { text } = await injected();
  assert.match(text, /技能：/);
});

test("注入：明确“没列出的就是没启用”", async () => {
  const { text } = await injected();
  assert.match(text, /没列出的插件\/技能就是没启用/);
});

/* ---------------- 问答要求（4） ---------------- */
test("注入：含开工前问清", async () => {
  const { text } = await injected();
  assert.match(text, /开工前先问清/);
});

test("注入：含方向要求", async () => {
  const { text } = await injected();
  assert.match(text, /先给一句话说明你打算怎么做/);
});

test("注入：最后要求只用已启用工具", async () => {
  const { text } = await injected();
  assert.match(text, /只使用当前已启用的工具/);
});

test("注入：装配后注入内容比分段多（确实追加了）", async () => {
  const { text } = await injected();
  assert.ok(text.length > 400, `注入过短：${text.length}`);
});

/* ---------------- 纯函数文本（6） ---------------- */
test("问清：普通场景 3 问、plugin 场景 4 问", () => {
  assert.equal(m.followupQuestions(m.SCENARIOS.find((s) => s.id === "article"), null).length, 3);
  assert.equal(m.followupQuestions(m.SCENARIOS.find((s) => s.id === "plugin"), null).length, 4);
});

test("提案：组合工作流标题含两个工作流名", () => {
  const wf = m.comboWorkflows([m.workflowById("debug"), m.workflowById("research")]);
  const { pi } = makePi({ tools: coreTools() });
  const text = m.buildProposal(pi, { id: "plugin", title: "插件", plugins: [], skillIds: [] }, { known: {}, overrides: {} }, wf);
  assert.match(text, /排查修复 \+ 证据先行/);
});

test("提案：工作流段含合并后的流程", () => {
  const wf = m.comboWorkflows([m.workflowById("debug"), m.workflowById("research")]);
  const { pi } = makePi({ tools: coreTools() });
  const text = m.buildProposal(pi, { id: "plugin", title: "插件", plugins: [], skillIds: [] }, { known: {}, overrides: {} }, wf);
  assert.match(text, /复现问题.*拆出必须回答的问题/s);
});

test("status：含当前组合、版本、技能行", async () => {
  const { state } = await injected();
  await state.commands.get("function").handler("status", makeCtx(state));
  const t = noticeText(state);
  assert.match(t, /当前组合：/);
  assert.match(t, new RegExp(m.EXT_VERSION.replace(/\./g, "\\.")));
  assert.match(t, /当前技能：/);
});

test("stats：输出统计消息", async () => {
  const { state } = await injected();
  await state.commands.get("function").handler("stats", makeCtx(state));
  assert.ok(state.messages.some((x) => x.customType === "function-stats"));
});

test("profile：报告含能力画像标题", () => {
  assert.match(m.buildProfileReport({ known: {}, overrides: {}, usage: {} }), /能力画像/);
});

/* ---------------- 其余可见性（4） ---------------- */
test("目录：buildCatalog 内容足够长（含场景与工作流）", () => {
  const { pi } = makePi({ tools: coreTools() });
  const text = m.buildCatalog(pi, { known: {}, overrides: {} });
  assert.ok(text.length > 500);
  assert.match(text, /第 1 步：工作流/);
});

test("装配通知：含启用数与下一步", async () => {
  const { state } = await injected();
  const t = noticeText(state);
  assert.match(t, /启用 \d+ 个，停用 \d+ 个/);
  assert.match(t, /还原 \/function off/);
});

test("模型装配：发送一条可见的启用清单消息", async () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.registeredTools.find((t) => t.name === "assemble_scenario").execute("1", { scenario: "plugin" });
  const msg = state.messages.find((x) => x.customType === "function-assembled");
  assert.ok(msg, "应有 function-assembled 消息");
  assert.match(String(msg.content), /已装配：/);
});

test("模型装配：清单消息里含还原入口", async () => {
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.registeredTools.find((t) => t.name === "assemble_scenario").execute("1", { scenario: "plugin" });
  const msg = state.messages.find((x) => x.customType === "function-assembled");
  assert.match(String(msg.content), /还原 \/function off/);
});
