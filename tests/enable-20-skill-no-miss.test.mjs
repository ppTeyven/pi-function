// 第 20 组：skill / 命令 也不能漏（10）
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

const sc = (over = {}) => ({ id: "plugin", title: "插件", plugins: [], skillIds: [], ...over });

/* ---------------- 技能补全要真正落地（3） ---------------- */
test("技能不会漏：由 scenarioSkillIds 从角色自动带入组合", () => {
  hydrate(m, { "code-intel": { skills: ["pi-lens-lsp"] } });
  const scenario = sc({ plugins: [] });
  assert.ok(m.comboSkillIds(scenario, emptyStore()).includes("pi-lens-lsp"));
});

test("补全技能：补完后 comboSkillIds 能看到它", () => {
  hydrate(m, { "code-intel": { skills: ["pi-lens-lsp"] } });
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const scenario = sc({ plugins: [] });
  m.applyScenario(pi, makeCtx(state), scenario, emptyStore());
  assert.ok(m.comboSkillIds(scenario, emptyStore()).includes("pi-lens-lsp"));
});

test("技能不会重复：两次装配后 comboSkillIds 仍只有一个", () => {
  hydrate(m, { "code-intel": { skills: ["pi-lens-lsp"] } });
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const scenario = sc({ plugins: [] });
  m.applyScenario(pi, makeCtx(state), scenario, emptyStore());
  m.applyScenario(pi, makeCtx(state), scenario, emptyStore());
  const ids = m.comboSkillIds(scenario, emptyStore());
  assert.equal(ids.filter((x) => x === "pi-lens-lsp").length, 1);
});

/* ---------------- 系统提示要列出“到底开了什么”（4） ---------------- */
async function assembledWith(hydration) {
  hydrate(m, hydration);
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({
    tools,
    active: tools.map((t) => t.name),
    commands: [{ name: "lens-toggle", source: "extension", sourceInfo: { path: "/x/node_modules/pi-lens/a.js", source: "npm:pi-lens" } }],
  });
  m.default(pi);
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  return state;
}

test("提示：新增「本次装配已启用的能力」段", async () => {
  const state = await assembledWith({ "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /本次装配已启用的能力/);
});

test("提示：列出技能名（模型才知道有它可用）", async () => {
  const state = await assembledWith({ "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /技能：/);
  assert.match(out.systemPrompt, /pi-lens-lsp/);
});

test("提示：列出插件命令（命令也是能力）", async () => {
  const state = await assembledWith({ "code-intel": { packages: ["pi-lens"] } });
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /命令 \/lens-toggle/);
});

test("提示：明确“没列出的就是没启用，不要假装能用”", async () => {
  const state = await assembledWith({ "code-intel": { packages: ["pi-lens"] } });
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /没列出的插件\/技能就是没启用/);
});

/* ---------------- 可见性（3） ---------------- */
test("模型装配：有自动补全时返回文本会说明补了什么", async () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  m.default(pi);
  // default 会按临时 store 重建画像，这里再灌一次测试画像
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  // 模拟“场景没把该包列进来”的漏用风险：清空场景插件，契约 required 仍在
  const scene = m.SCENARIOS.find((x) => x.id === "plugin");
  const backup = scene.plugins;
  scene.plugins = [];
  const asm = state.registeredTools.find((t) => t.name === "assemble_scenario");
  let res;
  try {
    res = await asm.execute("1", { scenario: "plugin" });
  } finally {
    scene.plugins = backup;
  }
  assert.match(res.content[0].text, /已自动补全（避免漏用）：pi-lens/);
});

test("status：列出当前技能", async () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  await state.commands.get("function").handler("status", makeCtx(state));
  assert.match(noticeText(state), /当前技能：/);
});

test("提案：技能段也列出全部（不只工具）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });
  const { pi } = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["a"])] });
  const text = m.buildProposal(pi, sc({ plugins: ["pi-lens"], skillIds: ["pi-lens-lsp"] }), emptyStore(), null);
  assert.match(text, /\*\*技能\*\*/);
  assert.match(text, /pi-lens-lsp/);
});
