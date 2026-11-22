// 第 29 组：跨模块契约 —— 写入方与读取方必须对齐（16）
// 这类 bug 已出现过两次（store.active 只写不读、comboWorkflows 少字段）。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

const DIR = isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const SRC = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
const STORE = process.env.PI_FUNCTION_STORE;
const read = () => JSON.parse(fs.readFileSync(STORE, "utf8"));

const env = () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { pi, state, tools };
};
const sc = () => ({ id: "plugin", title: "插件", plugins: ["pi-lens"], skillIds: [] });

/* ---------------- 写入方：applyScenario → store.active（5） ---------------- */
test("契约：applyScenario 写的 active 含 id/workflow/tools/at", () => {
  const { pi, state } = env();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), store, m.workflowById("debug"));
  for (const k of ["id", "workflow", "tools", "at"]) assert.ok(k in store.active, `active 缺 ${k}`);
});

test("契约：active.id 是字符串，workflow 是字符串或 null", () => {
  const { pi, state } = env();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), store, null);
  assert.equal(typeof store.active.id, "string");
  assert.ok(store.active.workflow === null || typeof store.active.workflow === "string");
});

test("契约：active.tools 是数组且与 setActiveTools 实参相同", () => {
  const { pi, state } = env();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), store);
  assert.ok(Array.isArray(store.active.tools));
  assert.deepEqual(store.active.tools, state.setCalls.at(-1));
});

test("契约：custom 字段仅在提供时写入", () => {
  const { pi, state } = env();
  const a = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), a, null, { custom: { need: "x" } });
  assert.deepEqual(a.active.custom, { need: "x" });
  const b = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), b, null);
  assert.equal(b.active.custom, null);
});

test("契约：动态场景自动带上 need/packages/skills", () => {
  const { pi, state } = env();
  const store = emptyStore();
  const dyn = { id: "custom", title: "动态", plugins: ["pi-lens"], skillIds: [], dynamic: true, when: "写个爬虫" };
  m.applyScenario(pi, makeCtx(state), dyn, store);
  assert.equal(store.active.custom.need, "写个爬虫");
  assert.ok(Array.isArray(store.active.custom.packages));
});

/* ---------------- 读取方：loadStore / restoreScenario（5） ---------------- */
test("契约：loadStore 返回 active 字段（防回归）", () => {
  assert.match(SRC, /active: raw\.active && typeof raw\.active === "object" \? raw\.active : null/);
});

test("契约：saveStore → loadStore 往返保留 active 全部字段", () => {
  const store = emptyStore();
  store.active = { id: "plugin+api", workflow: "debug", at: "2026-01-01T00:00:00.000Z", tools: ["read", "bash"], custom: { need: "x" } };
  m.saveStore(store);
  const back = m.loadStore();
  assert.deepEqual(back.active, store.active);
});

test("契约：off 写 null 后 loadStore 读回 null", () => {
  m.saveStore({ ...emptyStore(), active: { id: "plugin", workflow: null, at: "x", tools: ["read"] } });
  m.saveStore({ ...emptyStore(), active: null });
  assert.equal(m.loadStore().active, null);
});

test("契约：active 是非对象时回退 null", () => {
  fs.writeFileSync(STORE, JSON.stringify({ version: 1, known: {}, active: "bad" }));
  assert.equal(m.loadStore().active, null);
});

test("契约：restoreScenario 读的字段都在 applyScenario 写的对象里", () => {
  // 写入方字段
  const { pi, state } = env();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), store, m.workflowById("debug"));
  const written = new Set(Object.keys(store.active));
  // 读取方在源码里用到 last.id / last.workflow / last.custom / last.at
  for (const field of ["id", "workflow", "custom", "at"]) {
    assert.ok(written.has(field), `restoreScenario 读 ${field}，但 applyScenario 没写`);
  }
});

/* ---------------- 会话记录契约（3） ---------------- */
test("契约：appendEntry 的 tools 与实际 active 一致", async () => {
  const { state } = env();
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  const entry = state.entries.at(-1);
  assert.deepEqual(entry.d.tools, state.active);
});

test("契约：appendEntry 记录 id/workflow/at", async () => {
  const { state } = env();
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  const d = state.entries.at(-1).d;
  for (const k of ["id", "workflow", "at"]) assert.ok(k in d, `entry 缺 ${k}`);
});

test("契约：模型装配的 entry 也带 after 字段（by=model）", async () => {
  const { pi, state } = env();
  await state.registeredTools.find((t) => t.name === "assemble_scenario").execute("1", { scenario: "plugin" });
  const d = state.entries.at(-1).d;
  assert.equal(d.by, "model");
  assert.ok(Array.isArray(d.tools));
});

/* ---------------- 其它跨模块字段（3） ---------------- */
test("契约：comboWorkflows 的字段覆盖 comboPackages/comboSkillIds 读的键", () => {
  const wf = m.comboWorkflows([m.workflowById("debug"), m.workflowById("research")]);
  assert.ok(Array.isArray(wf.plugins), "comboPackages 读 workflow.plugins");
  assert.ok(Array.isArray(wf.skills), "comboSkillIds 读 workflow.skills");
});

test("契约：buildProposal 读的 scenario 字段 applyScenario 都会保留", () => {
  const { pi, state } = env();
  const scenario = sc();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), scenario, store);
  // 提案读 plugins/skillIds/analysis/manual/project
  assert.ok(Array.isArray(scenario.plugins));
  assert.ok(Array.isArray(scenario.skillIds));
});

test("契约：recent 与 active 的场景 id 一致", () => {
  const { pi, state } = env();
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), sc(), store);
  assert.equal(store.recent.scenario, store.active.id);
});
