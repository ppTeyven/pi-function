// 启用验证 · 第 1 组：场景 → 工具名映射（谁该被调起）
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, coreTools, pkgTools, tool, builtinInfo, localInfo, npmInfo,
  hydrate, scenario,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

/* ------------------------------ matchesPkg ------------------------------ */
test("matchesPkg：npm 包路径（node_modules/<pkg>/）能匹配", () => {
  assert.equal(m.matchesPkg(npmInfo("pi-lens"), "pi-lens"), true);
});

test("matchesPkg：source 为 npm:<pkg> 时也能匹配", () => {
  assert.equal(m.matchesPkg({ path: "/nowhere/x.js", source: "npm:pi-lens" }, "pi-lens"), true);
});

test("matchesPkg：pkg 名带 npm: 前缀时等价于同名包", () => {
  assert.equal(m.matchesPkg(npmInfo("pi-lens"), "npm:pi-lens"), true);
});

test("matchesPkg：source 以 :<pkg> 结尾时匹配（local/内置约定）", () => {
  assert.equal(m.matchesPkg({ path: "/nowhere/y.js", source: "local:pi-lens" }, "pi-lens"), true);
});

test("matchesPkg：相似包名不得误匹配（pi-lens vs pi-lens-extra）", () => {
  const info = npmInfo("pi-lens-extra");
  assert.equal(m.matchesPkg(info, "pi-lens"), false, "前缀相同的另一个包不能算同类");
});

test("matchesPkg：sourceInfo 缺失或 pkg 为空时返回 false", () => {
  assert.equal(m.matchesPkg(null, "pi-lens"), false);
  assert.equal(m.matchesPkg({ path: "/x/y.js" }, ""), false);
});

test("matchesPkg：作用域包名 @scope/name 能匹配", () => {
  assert.equal(m.matchesPkg(npmInfo("@plannotator/pi-extension"), "@plannotator/pi-extension"), true);
});

/* ---------------------------- isOptionalSource --------------------------- */
test("isOptionalSource：node_modules 下的插件算可选（可被停用）", () => {
  assert.equal(m.isOptionalSource(npmInfo("pi-lens")), true);
});

test("isOptionalSource：builtin 工具永不算可选（不会被 /function 关掉）", () => {
  assert.equal(m.isOptionalSource(builtinInfo("read")), false);
  assert.equal(m.isOptionalSource({ path: "builtin:web_search" }), false);
});

test("isOptionalSource：~/.pi/agent/extensions 下的本地扩展算可选", () => {
  assert.equal(m.isOptionalSource(localInfo("function-menu.js")), true);
});

test("isOptionalSource：无路径返回 false", () => {
  assert.equal(m.isOptionalSource({}), false);
  assert.equal(m.isOptionalSource(null), false);
});

/* ------------------------------ coreToolNames ---------------------------- */
test("coreToolNames：只返回真实注册过的核心工具", () => {
  const pi = makePi({ tools: [tool("read", builtinInfo("read")), tool("bash", builtinInfo("bash"))] }).pi;
  assert.deepEqual(m.coreToolNames(pi), ["read", "bash"]);
});

test("coreToolNames：核心工具没注册时不硬塞名字", () => {
  const pi = makePi({ tools: [tool("read", builtinInfo("read"))] }).pi;
  assert.deepEqual(m.coreToolNames(pi), ["read"], "缺的 6 个不应出现在结果里");
});

test("coreToolNames：顺序固定为 CORE_TOOLS 的顺序，不受注册顺序影响", () => {
  const pi = makePi({
    tools: [tool("ls", builtinInfo("ls")), tool("read", builtinInfo("read")), tool("grep", builtinInfo("grep"))],
  }).pi;
  assert.deepEqual(m.coreToolNames(pi), ["read", "grep", "ls"]);
});

/* ---------------------------- toolsForScenario --------------------------- */
test("toolsForScenario：场景相关插件的工具全部进入待启用集合", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const pi = makePi({
    tools: [
      ...coreTools(),
      ...pkgTools("pi-lens", ["lens_diagnostics", "lens_check"]),
      ...pkgTools("pi-test", ["test_run"]),
      ...pkgTools("rpiv-todo", ["todo"]),
    ],
  }).pi;
  const got = m.toolsForScenario(pi, scenario(m, "plugin"), {}).sort();
  assert.deepEqual(got, ["lens_check", "lens_diagnostics", "test_run"]);
});

test("toolsForScenario：无关插件的工具不得出现在待启用集合", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const pi = makePi({
    tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("rpiv-todo", ["todo"])],
  }).pi;
  assert.ok(!m.toolsForScenario(pi, scenario(m, "plugin"), {}).includes("todo"));
});

test("toolsForScenario：核心工具不会被当成「场景额外启用」", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const pi = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])] }).pi;
  const got = m.toolsForScenario(pi, scenario(m, "plugin"), {});
  assert.ok(!got.includes("read"), "核心工具由 coreToolNames 单独兜底，不该混进场景工具");
});

test("toolsForScenario：工作流追加的插件，其工具也进入集合", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const wf = { id: "custom-wf", plugins: ["pi-test"], skills: [] };
  const pi = makePi({
    tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])],
  }).pi;
  const sc = scenario(m, "plugin");
  sc.plugins = ["pi-lens"];
  const withWf = m.toolsForScenario(pi, sc, {}, wf).sort();
  assert.deepEqual(withWf, ["lens_diagnostics", "test_run"]);
});

test("toolsForScenario：noWorkflow 场景忽略工作流插件", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const pi = makePi({
    tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])],
  }).pi;
  const sc = { ...scenario(m, "plugin"), noWorkflow: true, plugins: ["pi-lens"] };
  const got = m.toolsForScenario(pi, sc, {}, { id: "w", plugins: ["pi-test"], skills: [] });
  assert.deepEqual(got, ["lens_diagnostics"]);
});

test("toolsForScenario：store.overrides 手动归入的包也参与（scenarioPackages）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const pi = makePi({
    tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])],
  }).pi;
  const sc = { ...scenario(m, "plugin"), plugins: ["pi-lens"] };
  const store = { overrides: { "npm:pi-test": "plugin" } };
  assert.deepEqual(m.toolsForScenario(pi, sc, store).sort(), ["lens_diagnostics", "test_run"]);
});

test("toolsForScenario：场景没有任何插件时返回空数组", () => {
  hydrate(m, {});
  const pi = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])] }).pi;
  assert.deepEqual(m.toolsForScenario(pi, scenario(m, "plugin"), {}), []);
});

test("toolsForScenario：同名工具只返回一次（去重）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-lens"] } });
  const pi = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics"]) }).pi;
  const got = m.toolsForScenario(pi, scenario(m, "plugin"), {});
  assert.equal(got.filter((n) => n === "lens_diagnostics").length, 1);
});
