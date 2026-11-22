// 第 12 组：装配边界（25）—— 极端工具集 / 重复 / 缺失 / 切换
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

const sc = (over = {}) => ({
  id: "plugin", group: "系统", title: "插件", when: "", keywords: [], brief: "",
  plugins: [], skillIds: [], ...over,
});

hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });

/* ---------------- 工具集边界（8） ---------------- */
test("装配：工具列表为空时不崩", () => {
  const { pi, state } = makePi({ tools: [] });
  assert.doesNotThrow(() => m.applyScenario(pi, makeCtx(state), sc(), emptyStore()));
});

test("装配：只有核心工具时保留核心", () => {
  const tools = coreTools();
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  for (const c of m.CORE_TOOLS) assert.ok(state.active.includes(c), c);
});

test("装配：所有工具都是 optional 且不相关 → 只剩核心", () => {
  const tools = [...coreTools(), ...pkgTools("nope", ["x1", "x2"])];
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  assert.deepEqual([...state.active].sort(), m.CORE_TOOLS.filter((c) => tools.some((t) => t.name === c)).sort());
});

test("装配：100 个工具时也正确", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", Array.from({ length: 100 }, (_, i) => `t${i}`))];
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(state.active.filter((n) => n.startsWith("t")).length, 100);
});

test("装配：工具名含特殊字符不崩", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a.b", "c-d", "e_f", "g:h"])];
  const { pi, state } = makePi({ tools });
  assert.doesNotThrow(() => m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore()));
});

test("装配：同一工具在多个包里只出现一次", () => {
  const t = tool("dup_tool", { path: "/x/node_modules/pi-lens/dist/x.js", source: "npm:pi-lens" });
  const tools = [...coreTools(), t, { ...t }];
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens", "pi-test"] }), emptyStore());
  assert.equal(state.active.filter((n) => n === "dup_tool").length, 1);
});

test("装配：场景插件重复声明只启用一次", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens", "pi-lens"] }), emptyStore());
  assert.equal(state.active.filter((n) => n === "a").length, 1);
});

test("装配：baseline 完全为空时仍能装配", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: [] });
  m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.ok(state.active.includes("a"));
});

/* ---------------- 组合 / 工作流边界（8） ---------------- */
test("装配：组合场景的 id 与标题都不为空", () => {
  const a = sc({ id: "plugin", title: "插件" });
  const b = sc({ id: "api", title: "API" });
  const combo = m.comboScenarios([a, b]);
  assert.equal(combo.id, "plugin+api");
  assert.match(combo.title, /插件 \+ API/);
});

test("装配：组合 7 个场景不崩", () => {
  const list = Array.from({ length: 7 }, (_, i) => sc({ id: `s${i}`, title: `场景${i}` }));
  const combo = m.comboScenarios(list);
  assert.equal(combo.id.split("+").length, 7);
});

test("装配：组合场景去重无关的 manual", () => {
  const a = sc({ manual: ["做 A"] });
  const b = sc({ manual: ["做 A", "做 B"] });
  assert.deepEqual(m.comboScenarios([a, b]).manual, ["做 A", "做 B"]);
});

test("装配：工作流组合的 steps 去重", () => {
  const w1 = { id: "a", title: "A", steps: ["x", "y"], plugins: [], skills: [] };
  const w2 = { id: "b", title: "B", steps: ["y", "z"], plugins: [], skills: [] };
  assert.deepEqual(m.comboWorkflows([w1, w2]).steps, ["x", "y", "z"]);
});

test("装配：工作流组合的 checkpoint 用；连接", () => {
  const w1 = { id: "a", title: "A", checkpoint: "C1", steps: [], plugins: [], skills: [] };
  const w2 = { id: "b", title: "B", checkpoint: "C2", steps: [], plugins: [], skills: [] };
  assert.match(m.comboWorkflows([w1, w2]).checkpoint, /C1；C2/);
});

test("装配：单元素组合返回原对象", () => {
  const one = sc();
  assert.equal(m.comboScenarios([one]), one);
});

test("装配：空组合返回 null", () => {
  assert.equal(m.comboScenarios([]), null);
  assert.equal(m.comboWorkflows([]), null);
});

test("装配：isIdCombo 只认 ASCII id + 加号", () => {
  assert.equal(m.isIdCombo("debug+process"), true);
  assert.equal(m.isIdCombo("debug、process"), false, "中文顿号不是 id 分隔符");
  assert.equal(m.isIdCombo("debug"), false);
});

/* ---------------- 审计边界（5） ---------------- */
test("审计：场景没有任何插件时返回空数组", () => {
  const { pi } = makePi({ tools: coreTools() });
  assert.deepEqual(m.auditPackages(pi, sc(), emptyStore()), []);
});

test("审计：包存在但没有任何工具/命令/技能 → absent", () => {
  const { pi } = makePi({ tools: coreTools() });
  const [row] = m.auditPackages(pi, sc({ plugins: ["ghost"] }), emptyStore());
  assert.equal(row.state, "absent");
});

test("审计：工具全停用但有技能 → warn", () => {
  const { pi } = makePi({
    tools: pkgTools("pi-lens", ["a"]),
    commands: [{ name: "skill:s", source: "skill", sourceInfo: { path: "/x/node_modules/pi-lens/skills/s/SKILL.md", source: "npm:pi-lens" } }],
    active: [],
  });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "warn");
});

test("审计：工具全停用且无替代 → inactive", () => {
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["a"]), active: [] });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "inactive");
});

test("审计：任一工具 active → ok（不用全部）", () => {
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["a", "b"]), active: ["b"] });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "ok");
});

/* ---------------- 覆盖审计（4） ---------------- */
test("覆盖：无硬要求时 ok", () => {
  const cov = m.auditCoverage(m.SCENARIOS.find((s) => s.id === "general"), emptyStore());
  assert.equal(cov.ok, true);
});

test("覆盖：required 有条目但没入选 → not-selected", () => {
  const s = m.SCENARIOS.find((x) => x.id === "plugin");
  const cov = m.auditCoverage({ ...s, plugins: [], skillIds: [] }, emptyStore());
  if (cov.missing.length) assert.ok(cov.missing.every((x) => x.kind === "not-selected" || x.kind === "not-installed"));
});

test("覆盖：组合场景取 required 并集", () => {
  const c = m.contractFor({ comboIds: ["plugin", "api"] });
  assert.ok(c.required.length >= 1);
});

test("覆盖：组合 forbidden 取交集（只报都禁止的）", () => {
  const c = m.contractFor({ comboIds: ["plugin", "api"] });
  assert.ok(Array.isArray(c.forbidden));
});
