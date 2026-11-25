// 用户看到的提案/回执，以及模型实际收到的能力与执行流程。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, noticeText, skillInfo, modelPlan } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, commands: [
    { name: "lens-toggle", source: "extension", sourceInfo: { path: "/x/node_modules/pi-lens/a.js", source: "npm:pi-lens" } },
    { name: "skill:pi-lens-lsp-navigation", source: "skill", sourceInfo: skillInfo("pi-lens-lsp-navigation"), description: "LSP diagnostics and code navigation" },
  ] });
  m.default(pi);
  const ctx = makeCtx(state, { confirms: [true] });
  const run = (args) => state.commands.get("function").handler(args, ctx);
  const prompt = async () => (await state.handlers.before_agent_start[0]({ systemPrompt: "BASE" }, ctx))?.systemPrompt ?? "BASE";
  return { pi, state, ctx, run, prompt };
}

test("系统提示：确认装配后追加工作流、实际能力和开工门槛，同时保留原提示", async () => {
  const { run, prompt } = env();
  await run("scenario plugin");
  const text = await prompt();
  for (const expected of [
    /^BASE/, /当前组合（\/function 装配）/, /流程：.*→/, /检查点：/, /完成标准：/,
    /本次装配已启用的能力/, /插件 `pi-lens`：1 个工具（lens_diagnostics）/, /命令 \/lens-toggle/,
    /技能：.*pi-lens-lsp-navigation/, /以宿主当前活动工具清单为准/,
    /开工前先问清/, /先给一句话说明你打算怎么做/, /只使用当前已启用的工具/,
  ]) assert.match(text, expected);
});

test("系统提示：仅工作流不绑定任务；off 后恢复原系统提示", async () => {
  const { run, prompt } = env();
  await run("debug");
  const text = await prompt();
  assert.match(text, /当前组合.*排查修复/);
  assert.doesNotMatch(text, /^### 任务：/m);
  await run("off");
  assert.equal(await prompt(), "BASE");
});

test("没有持久化装配时，启动模型不追加提示", async () => {
  m.saveStore({ version: 1, known: {}, overrides: {}, active: null });
  assert.equal(await env().prompt(), "BASE");
});

test("装配状态显示版本和实际技能", async () => {
  const { state, run } = env();
  await run("scenario plugin");
  await run("status");
  const text = noticeText(state);
  assert.ok(text.includes(`扩展版本：v${m.EXT_VERSION}`));
  assert.match(text, /当前技能：.*pi-lens-lsp-navigation/);
});

test("组合工作流提案：两种执行方式的标题和步骤同时可见", () => {
  const { pi } = env();
  const workflow = m.comboWorkflows([m.workflowById("debug"), m.workflowById("research")]);
  const proposal = m.buildProposal(pi, { id: "plugin", title: "插件", plugins: [], skillIds: [] }, { known: {}, overrides: {} }, workflow);
  assert.match(proposal, /排查修复 \+ 证据先行/);
  assert.match(proposal, /复现问题.*拆出必须回答的问题/s);
});

test("模型装配：可见提案包含流程和验收，回执列实际工具、用途、技能数和还原入口", async () => {
  const { state, ctx } = env();
  const assemble = state.registeredTools.find(t => t.name === "assemble_scenario");
  const plan = modelPlan({ scenario: "plugin", workflow: "debug", plugins: ["npm:pi-lens"], tools: ["lens_diagnostics"], skills: ["pi-lens-lsp-navigation"] });
  const result = await assemble.execute("1", plan, undefined, undefined, ctx);
  assert.ok(!result.isError, result.content[0].text);
  assert.deepEqual(state.messages.map(x => x.customType), ["function-proposal", "function-assembled"]);
  const [proposal, outcome] = state.messages;
  assert.equal(proposal.display, true);
  assert.equal(outcome.display, true);
  assert.match(proposal.content, /^## 模型装配提案：/);
  assert.match(proposal.content, /步骤：复现问题/);
  assert.match(proposal.content, /检查点：/);
  assert.match(proposal.content, /完成标准：/);
  assert.match(outcome.content, /^## 已装配：/);
  assert.ok(outcome.content.includes(`当前 ${state.active.length} 个工具可用`));
  assert.match(outcome.content, /`npm:pi-lens`：1 个活动工具；LSP/);
  const count = outcome.content.match(/会话技能（(\d+) 个）/);
  const rows = outcome.content.split("\n").filter(line => /`pi-lens-lsp-navigation`/.test(line));
  assert.ok(Number(count?.[1]) >= rows.length && rows.length === 1);
  assert.match(outcome.content, /还原 \/function off/);
});
